import type { Point } from './types';

/** Fit a linear boundary line with median outlier filtering along either X (horizontal) or Y (vertical). */
export function fitRobustBorderLine(
  pts: Point[],
  axis: 'horizontal' | 'vertical',
  fallbackIntercept: number,
  maxDeviation: number
): { m: number; c: number } {
  if (pts.length < 4) return { m: 0, c: fallbackIntercept };
  const depValues = pts.map((p) => (axis === 'horizontal' ? p.y : p.x)).sort((a, b) => a - b);
  const medianDep = depValues[Math.floor(depValues.length / 2)] ?? fallbackIntercept;
  const inliers = pts.filter((p) => Math.abs((axis === 'horizontal' ? p.y : p.x) - medianDep) < maxDeviation);
  if (inliers.length < 3) return { m: 0, c: medianDep };

  let sumInd = 0;
  let sumDep = 0;
  let sumProd = 0;
  let sumIndSq = 0;
  for (const p of inliers) {
    const ind = axis === 'horizontal' ? p.x : p.y;
    const dep = axis === 'horizontal' ? p.y : p.x;
    sumInd += ind;
    sumDep += dep;
    sumProd += ind * dep;
    sumIndSq += ind * ind;
  }

  const n = inliers.length;
  const denom = n * sumIndSq - sumInd * sumInd;
  if (Math.abs(denom) < 1e-4) return { m: 0, c: medianDep };
  const m = Math.max(-0.35, Math.min(0.35, (n * sumProd - sumInd * sumDep) / denom));
  const c = (sumDep - m * sumInd) / n;
  return { m, c };
}

export function intersectBorderLines(
  hLine: { m: number; c: number },
  vLine: { m: number; c: number },
  workW: number,
  workH: number
): Point {
  const denom = 1 - hLine.m * vLine.m;
  const y = Math.abs(denom) > 1e-4 ? (hLine.m * vLine.c + hLine.c) / denom : hLine.c;
  const x = vLine.m * y + vLine.c;
  return {
    x: Math.max(0, Math.min(workW, x)),
    y: Math.max(0, Math.min(workH, y)),
  };
}

/** Calculates focus sharpness of an image using Laplacian operator variance. */
export function calculateLaplacianSharpness(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): number {
  const w = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const h = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;
  if (w === 0 || h === 0) return 0;

  const scale = Math.min(1, 160 / Math.max(w, h));
  const workW = Math.max(10, Math.round(w * scale));
  const workH = Math.max(10, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 100;

  ctx.drawImage(sourceImage, 0, 0, workW, workH);
  const data = ctx.getImageData(0, 0, workW, workH).data;
  canvas.width = 1;
  canvas.height = 1;

  const total = workW * workH;
  const gray = new Uint8Array(total);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0));
  }

  let sum = 0;
  let count = 0;
  const lapScores = new Float32Array(total);
  for (let y = 1; y < workH - 1; y++) {
    const row = y * workW;
    for (let x = 1; x < workW - 1; x++) {
      const idx = row + x;
      const val =
        (gray[idx - workW] ?? 0) +
        (gray[idx + workW] ?? 0) +
        (gray[idx - 1] ?? 0) +
        (gray[idx + 1] ?? 0) -
        4 * (gray[idx] ?? 0);
      lapScores[count] = val;
      sum += val;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  let variance = 0;
  for (let i = 0; i < count; i++) {
    const diff = (lapScores[i] ?? 0) - mean;
    variance += diff * diff;
  }
  return Math.round(variance / count);
}
