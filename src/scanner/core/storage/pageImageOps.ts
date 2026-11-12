import type { FilterType } from '../types';
import { applyFilterAsync } from '../filters';

export interface StoredPageRecord {
  id: string;
  originalBlob: Blob;
  warpedBlob: Blob;
  filteredBlob: Blob;
  thumbnailDataUrl: string;
  filter: string;
  timestamp: number;
}

export function generateThumbnailDataUrl(
  source: HTMLCanvasElement | HTMLImageElement,
  aspect: number,
  quality = 0.6
): string {
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 120;
  thumbCanvas.height = Math.round(120 / Math.max(0.1, aspect));
  const ctx = thumbCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  return thumbCanvas.toDataURL('image/jpeg', quality);
}

export function createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load blob as image'));
    };
    img.src = url;
  });
}

async function rotateBlob90(blob: Blob): Promise<Blob> {
  const img = await createImageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  }
  return new Promise((res) => canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.9));
}

export async function transformRotatedRecord(record: StoredPageRecord): Promise<StoredPageRecord> {
  const [newFilteredBlob, newWarpedBlob] = await Promise.all([
    rotateBlob90(record.filteredBlob),
    rotateBlob90(record.warpedBlob),
  ]);
  const thumbImg = await createImageFromBlob(newFilteredBlob);
  const aspect = thumbImg.naturalWidth / Math.max(1, thumbImg.naturalHeight);
  return {
    ...record,
    filteredBlob: newFilteredBlob,
    warpedBlob: newWarpedBlob,
    thumbnailDataUrl: generateThumbnailDataUrl(thumbImg, aspect, 0.6),
  };
}

export async function transformFilteredRecord(
  record: StoredPageRecord,
  filter: FilterType
): Promise<StoredPageRecord> {
  const warpedImg = await createImageFromBlob(record.warpedBlob);
  const warpedCanvas = document.createElement('canvas');
  warpedCanvas.width = warpedImg.naturalWidth;
  warpedCanvas.height = warpedImg.naturalHeight;
  const ctx = warpedCanvas.getContext('2d');
  if (ctx) ctx.drawImage(warpedImg, 0, 0);

  const filteredCanvas = await applyFilterAsync(warpedCanvas, filter);
  const newFilteredBlob = await new Promise<Blob>((resolve) =>
    filteredCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.88)
  );
  const aspect = filteredCanvas.width / Math.max(1, filteredCanvas.height);

  return {
    ...record,
    filteredBlob: newFilteredBlob,
    thumbnailDataUrl: generateThumbnailDataUrl(filteredCanvas, aspect, 0.6),
    filter,
  };
}
