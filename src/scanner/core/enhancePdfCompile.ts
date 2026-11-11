import { createPdfFromCanvases } from './pdf';
import type {
  OcrWordToken,
  PdfCompressionPreset,
  PdfPageFormat,
  PdfPageInput,
  PdfWatermarkStyle,
} from './pdf';
import {
  loadOriginalDataUrlFromDisk,
  loadPageCanvasFromDisk,
  storePageToDisk,
} from './storage/pageStore';
import { saveDocumentToLibrary } from './storage/documentLibrary';
import { dewarpBookCurvatureAsync } from './geometry';
import { performOcr } from './ocr/ocrEngine';
import type { ScannedPage } from './types';

export interface SignaturePlacement {
  dataUrl: string;
  x: number;
  y: number;
}

export async function burnRedactionOnPageCanvas({
  page,
  strokes,
  previewRect,
  onThumbnailUpdated,
}: {
  page: ScannedPage;
  strokes: { x: number; y: number }[][];
  previewRect: DOMRect;
  onThumbnailUpdated?: (pageId: string, thumbnailDataUrl: string) => void;
}): Promise<string> {
  const rawCanvas = await loadPageCanvasFromDisk(page.id);
  const ctx = rawCanvas.getContext('2d');
  if (!ctx) {
    return rawCanvas.toDataURL('image/jpeg', 0.9);
  }

  const scaleX = rawCanvas.width / previewRect.width;
  const scaleY = rawCanvas.height / previewRect.height;

  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineWidth = 18 * scaleX;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x * scaleX, stroke[0].y * scaleY);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x * scaleX, stroke[i].y * scaleY);
    }
    ctx.stroke();
  }

  const originalUrl = await loadOriginalDataUrlFromDisk(page.id).catch(() => page.thumbnailDataUrl);
  const newThumb = await storePageToDisk(page.id, originalUrl, rawCanvas, rawCanvas, page.filter);
  onThumbnailUpdated?.(page.id, newThumb);
  return rawCanvas.toDataURL('image/jpeg', 0.9);
}

export async function compileScannedPdfDocument({
  pages,
  curvature,
  spinePos,
  signatures,
  enableOcr,
  compressionPreset,
  pageFormat,
  watermarkText,
  watermarkStyle,
  onOcrProgress,
}: {
  pages: ScannedPage[];
  curvature: number;
  spinePos: number;
  signatures: Record<string, SignaturePlacement>;
  enableOcr: boolean;
  compressionPreset: PdfCompressionPreset;
  pageFormat: PdfPageFormat;
  watermarkText: string;
  watermarkStyle: PdfWatermarkStyle;
  onOcrProgress: (status: string) => void;
}): Promise<Blob> {
  const pageInputs: PdfPageInput[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const rawCanvas = await loadPageCanvasFromDisk(page.id);
    const processed = curvature > 0 ? await dewarpBookCurvatureAsync(rawCanvas, curvature, spinePos) : rawCanvas;

    const sig = signatures[page.id];
    if (sig) {
      const sigImg = new Image();
      sigImg.src = sig.dataUrl;
      await new Promise((res) => {
        sigImg.onload = res;
        sigImg.onerror = res;
      });
      const ctx = processed.getContext('2d');
      if (ctx) {
        const sigW = Math.round(processed.width * 0.32);
        const sigH = Math.round((sigImg.naturalHeight / sigImg.naturalWidth) * sigW);
        const posX = Math.round(sig.x * processed.width);
        const posY = Math.round(sig.y * processed.height);
        ctx.drawImage(sigImg, posX, posY, sigW, sigH);
      }
    }

    let words: OcrWordToken[] = [];
    if (enableOcr) {
      onOcrProgress(`OCR scanning page ${i + 1} of ${pages.length}...`);
      words = await performOcr(processed, 'ara+eng');
    }

    pageInputs.push({
      canvas: processed,
      words,
    });
  }

  onOcrProgress('');
  return await createPdfFromCanvases(pageInputs, compressionPreset, pageFormat, watermarkText, watermarkStyle);
}

export async function cacheCompiledPdfInLibrary(
  docTitle: string,
  pages: ScannedPage[],
  pdfBlob: Blob
): Promise<void> {
  try {
    await saveDocumentToLibrary({
      id: `doc_${Date.now()}`,
      title:
        docTitle.trim() ||
        `Scan — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      pageCount: pages.length,
      thumbnail: pages[0].thumbnailDataUrl,
      pdfBlob,
    });
  } catch (e) {
    console.warn('Could not cache document to library:', e);
  }
}
