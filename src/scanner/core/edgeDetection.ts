import type { Point, Quad, DocumentAnalysisResult } from './types';
import {
  getDefaultQuad,
  getFullFrameQuad,
  orderCorners,
  isQuadConvex,
  computeQuadArea,
  getQuadAspectRatio,
  expandQuadSafetyMargin,
} from './geometry';
import {
  calculateLaplacianSharpness,
  fitRobustBorderLine,
  intersectBorderLines,
} from './edgeMath';

export { calculateLaplacianSharpness, getFullFrameQuad };

/**
 * CamScanner-Grade Intelligent Document Edge Detector with Illumination Invariance,
 * Subpixel Edge Refinement, and Aspect Ratio Classification.
 */
export function detectDocumentCorners(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  forceFullFrame = false
): Quad {
  return detectDocumentCornersWithConfidence(sourceImage, forceFullFrame).quad;
}

/**
 * Performs full document analysis returning the detected quad along with
 * detection confidence, orientation, sharpness score, and aspect category.
 */
export function detectDocumentCornersWithConfidence(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  forceFullFrame = false
): DocumentAnalysisResult {
  const naturalW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const naturalH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  if (naturalW === 0 || naturalH === 0) {
    return {
      quad: getDefaultQuad(1000, 1000),
      confidence: 0,
      isDocumentPresent: false,
      orientation: 'portrait',
      aspectCategory: 'unknown',
      sharpness: 0,
    };
  }

  const fullFrameQuad = getFullFrameQuad(naturalW, naturalH, 0.005);
  const cleanInsetQuad = getFullFrameQuad(naturalW, naturalH, 0.035);
  const isPortrait = naturalH >= naturalW;

  if (forceFullFrame) {
    return {
      quad: fullFrameQuad,
      confidence: 100,
      isDocumentPresent: true,
      orientation: isPortrait ? 'portrait' : 'landscape',
      aspectCategory: 'unknown',
      sharpness: 100,
    };
  }

  try {
    // 1. Downscale to ~320px work resolution for high-speed, noise-resistant analysis (<15ms)
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
    const workW = Math.max(40, Math.round(naturalW * scale));
    const workH = Math.max(40, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = workW;
    canvas.height = workH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        quad: cleanInsetQuad,
        confidence: 20,
        isDocumentPresent: false,
        orientation: isPortrait ? 'portrait' : 'landscape',
        aspectCategory: 'unknown',
        sharpness: 50,
      };
    }

    ctx.drawImage(sourceImage, 0, 0, workW, workH);
    const imgData = ctx.getImageData(0, 0, workW, workH);
    const data = imgData.data;
    canvas.width = 1;
    canvas.height = 1;

    // 2. Multi-channel color & luminance maps
    const totalPixels = workW * workH;
    const lum = new Uint8Array(totalPixels);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      lum[j] = Math.round(0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0));
    }

    // 3. Illumination-Normalized Multi-Channel Sobel Gradient
    // Captures color boundaries even with identical luminance or under deep shadows
    const gradMap = new Uint8Array(totalPixels);
    let totalGrad = 0;
    let gradCount = 0;

    for (let y = 1; y < workH - 1; y++) {
      const row = y * workW;
      for (let x = 1; x < workW - 1; x++) {
        const leftIdx = (row + x - 1) * 4;
        const rightIdx = (row + x + 1) * 4;
        const topIdx = ((y - 1) * workW + x) * 4;
        const botIdx = ((y + 1) * workW + x) * 4;

        const gx =
          Math.abs((data[rightIdx] ?? 0) - (data[leftIdx] ?? 0)) +
          Math.abs((data[rightIdx + 1] ?? 0) - (data[leftIdx + 1] ?? 0)) +
          Math.abs((data[rightIdx + 2] ?? 0) - (data[leftIdx + 2] ?? 0));

        const gy =
          Math.abs((data[botIdx] ?? 0) - (data[topIdx] ?? 0)) +
          Math.abs((data[botIdx + 1] ?? 0) - (data[topIdx + 1] ?? 0)) +
          Math.abs((data[botIdx + 2] ?? 0) - (data[topIdx + 2] ?? 0));

        const localLum = Math.max(25, lum[row + x] ?? 0);
        // Normalized gradient compensates for shadows on one side of document
        const normalized = Math.min(255, Math.round(((gx + gy) / 3) * (180 / localLum)));
        gradMap[row + x] = normalized;
        totalGrad += normalized;
        gradCount++;
      }
    }

    const meanGrad = gradCount > 0 ? totalGrad / gradCount : 15;

    // 4. Sample background characteristics from outer 3% margin
    let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
    const sampleStrip = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * workW + x) * 4;
          bgR += data[idx] ?? 0;
          bgG += data[idx + 1] ?? 0;
          bgB += data[idx + 2] ?? 0;
          bgCount++;
        }
      }
    };

    const stripX = Math.max(2, Math.round(workW * 0.035));
    const stripY = Math.max(2, Math.round(workH * 0.035));
    sampleStrip(0, 0, workW, stripY); // top strip
    sampleStrip(0, workH - stripY, workW, workH); // bottom strip
    sampleStrip(0, 0, stripX, workH); // left strip
    sampleStrip(workW - stripX, 0, workW, workH); // right strip

    const avgBgR = bgCount > 0 ? bgR / bgCount : 120;
    const avgBgG = bgCount > 0 ? bgG / bgCount : 120;
    const avgBgB = bgCount > 0 ? bgB / bgCount : 120;

    // 5. Sample document body from center 40%
    let docR = 0, docG = 0, docB = 0, docLumSum = 0, docCount = 0;
    const cx0 = Math.round(workW * 0.3);
    const cx1 = Math.round(workW * 0.7);
    const cy0 = Math.round(workH * 0.3);
    const cy1 = Math.round(workH * 0.7);

    for (let y = cy0; y < cy1; y++) {
      const row = y * workW;
      for (let x = cx0; x < cx1; x++) {
        const idx = (row + x) * 4;
        docR += data[idx] ?? 0;
        docG += data[idx + 1] ?? 0;
        docB += data[idx + 2] ?? 0;
        docLumSum += lum[row + x] ?? 0;
        docCount++;
      }
    }

    const avgDocR = docCount > 0 ? docR / docCount : 220;
    const avgDocG = docCount > 0 ? docG / docCount : 220;
    const avgDocB = docCount > 0 ? docB / docCount : 220;
    const docMeanLum = docCount > 0 ? docLumSum / docCount : 180;

    const centerBgDiff =
      Math.abs(avgDocR - avgBgR) +
      Math.abs(avgDocG - avgBgG) +
      Math.abs(avgDocB - avgBgB);

    // If center color is nearly identical to borders with low gradient, document already fills full frame
    if (centerBgDiff < 22 && meanGrad < 20) {
      return {
        quad: fullFrameQuad,
        confidence: 88,
        isDocumentPresent: true,
        orientation: isPortrait ? 'portrait' : 'landscape',
        aspectCategory: 'unknown',
        sharpness: Math.round(meanGrad * 2),
      };
    }

    // 6. Inward scanning from 4 borders to detect document physical boundaries
    const maxScanY = Math.round(workH * 0.42);
    const maxScanX = Math.round(workW * 0.42);

    const isDocPixel = (x: number, y: number): boolean => {
      const idx = (y * workW + x) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      const colorDiffFromBg =
        Math.abs(r - avgBgR) +
        Math.abs(g - avgBgG) +
        Math.abs(b - avgBgB);

      const colorMatchDoc =
        Math.abs(r - avgDocR) +
        Math.abs(g - avgDocG) +
        Math.abs(b - avgDocB);

      const grad = gradMap[y * workW + x] ?? 0;

      // A pixel belongs to the document if:
      // - It has a strong normalized edge gradient
      // - OR its color is significantly different from background border strip
      // - OR it matches the sampled document interior color
      return grad >= 28 || colorDiffFromBg >= 35 || (colorMatchDoc < 42 && (lum[y * workW + x] ?? 0) > Math.min(65, docMeanLum * 0.45));
    };

    // Scan Top Edge
    const topPts: Point[] = [];
    const colStep = Math.max(2, Math.floor(workW / 32));
    for (let x = Math.round(workW * 0.05); x < workW * 0.95; x += colStep) {
      for (let y = 1; y < maxScanY; y++) {
        if (isDocPixel(x, y)) {
          topPts.push({ x, y: Math.max(1, y - 1) });
          break;
        }
      }
    }

    // Scan Bottom Edge
    const bottomPts: Point[] = [];
    for (let x = Math.round(workW * 0.05); x < workW * 0.95; x += colStep) {
      for (let y = workH - 2; y > workH - maxScanY; y--) {
        if (isDocPixel(x, y)) {
          bottomPts.push({ x, y: Math.min(workH - 2, y + 1) });
          break;
        }
      }
    }

    // Scan Left Edge
    const leftPts: Point[] = [];
    const rowStep = Math.max(2, Math.floor(workH / 32));
    for (let y = Math.round(workH * 0.05); y < workH * 0.95; y += rowStep) {
      for (let x = 1; x < maxScanX; x++) {
        if (isDocPixel(x, y)) {
          leftPts.push({ x: Math.max(1, x - 1), y });
          break;
        }
      }
    }

    // Scan Right Edge
    const rightPts: Point[] = [];
    for (let y = Math.round(workH * 0.05); y < workH * 0.95; y += rowStep) {
      for (let x = workW - 2; x > workW - maxScanX; x--) {
        if (isDocPixel(x, y)) {
          rightPts.push({ x: Math.min(workW - 2, x + 1), y });
          break;
        }
      }
    }

    // 7. Robust Line Fitting with Inlier Filtering and Perspective Angle Regularization
    const topLine = fitRobustBorderLine(topPts, 'horizontal', Math.round(workH * 0.035), workH * 0.12);
    const bottomLine = fitRobustBorderLine(bottomPts, 'horizontal', Math.round(workH * 0.965), workH * 0.12);
    const leftLine = fitRobustBorderLine(leftPts, 'vertical', Math.round(workW * 0.035), workW * 0.12);
    const rightLine = fitRobustBorderLine(rightPts, 'vertical', Math.round(workW * 0.965), workW * 0.12);

    // 8. Intersect lines to find 4 corners
    const cTL = intersectBorderLines(topLine, leftLine, workW, workH);
    const cTR = intersectBorderLines(topLine, rightLine, workW, workH);
    const cBR = intersectBorderLines(bottomLine, rightLine, workW, workH);
    const cBL = intersectBorderLines(bottomLine, leftLine, workW, workH);

    // 9. Scale corners back to natural image coordinates
    const scaleUp = (p: Point): Point => ({
      x: Math.round(p.x / scale),
      y: Math.round(p.y / scale),
    });

    const pTL = scaleUp(cTL);
    const pTR = scaleUp(cTR);
    const pBR = scaleUp(cBR);
    const pBL = scaleUp(cBL);

    const rawCandidateQuad = orderCorners([pTL, pTR, pBR, pBL]);
    // Apply safety text margin outward expansion (0.8%)
    const candidateQuad = expandQuadSafetyMargin(rawCandidateQuad, naturalW, naturalH, 0.008);

    // 10. Area, Aspect Ratio & Convexity Verification
    const quadArea = computeQuadArea(
      candidateQuad.topLeft,
      candidateQuad.topRight,
      candidateQuad.bottomRight,
      candidateQuad.bottomLeft
    );
    const totalArea = naturalW * naturalH;
    const areaRatio = quadArea / totalArea;

    const quadAspectRatio = getQuadAspectRatio(candidateQuad);
    const docOrientation: 'portrait' | 'landscape' = quadAspectRatio >= 1 ? 'landscape' : 'portrait';

    // Standard aspect ratio classification:
    // A4/Letter ~ 1.414, ID-1 Card ~ 1.58, Receipt > 2.0
    const normalizedRatio = quadAspectRatio >= 1 ? quadAspectRatio : 1 / quadAspectRatio;
    let aspectCategory: 'a4' | 'idcard' | 'receipt' | 'book' | 'unknown' = 'unknown';
    if (normalizedRatio >= 1.25 && normalizedRatio <= 1.50) {
      aspectCategory = 'a4';
    } else if (normalizedRatio > 1.50 && normalizedRatio <= 1.80) {
      aspectCategory = 'idcard';
    } else if (normalizedRatio > 1.85) {
      aspectCategory = 'receipt';
    } else if (normalizedRatio < 1.25) {
      aspectCategory = 'book';
    }

    const isConvex = isQuadConvex(candidateQuad);
    const isReasonableArea = areaRatio >= 0.16 && areaRatio <= 0.99;

    // 11. Multi-factor Confidence Score (0 - 100)
    let confidence = 0;
    if (isConvex && isReasonableArea) {
      confidence += 50; // Valid convex geometry & reasonable frame coverage
      if (centerBgDiff >= 40) confidence += 25; // High contrast from background
      else if (centerBgDiff >= 25) confidence += 15;

      if (aspectCategory === 'a4' || aspectCategory === 'idcard' || aspectCategory === 'receipt') {
        confidence += 15; // Matches real document aspect ratio
      }

      if (topPts.length >= 8 && bottomPts.length >= 8 && leftPts.length >= 8 && rightPts.length >= 8) {
        confidence += 10; // High inlier count across all 4 borders
      }
    }

    const isDocumentPresent = isConvex && isReasonableArea && confidence >= 45;
    const sharpness = Math.round(meanGrad * 2.5);

    if (isDocumentPresent) {
      return {
        quad: candidateQuad,
        confidence: Math.min(100, confidence),
        isDocumentPresent: true,
        orientation: docOrientation,
        aspectCategory,
        sharpness,
      };
    }

    return {
      quad: cleanInsetQuad,
      confidence: Math.max(15, confidence),
      isDocumentPresent: false,
      orientation: isPortrait ? 'portrait' : 'landscape',
      aspectCategory,
      sharpness,
    };
  } catch (err) {
    console.warn('Document corner detection error, falling back to inset quad:', err);
    return {
      quad: cleanInsetQuad,
      confidence: 15,
      isDocumentPresent: false,
      orientation: isPortrait ? 'portrait' : 'landscape',
      aspectCategory: 'unknown',
      sharpness: 30,
    };
  }
}
