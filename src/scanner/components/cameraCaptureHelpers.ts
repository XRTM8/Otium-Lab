import {
  calculateLaplacianSharpness,
  detectDocumentCornersWithConfidence,
} from '../core/edgeDetection';
import { mergeIdCardSidesToA4 } from '../core/idCard';
import { runWasmMotionAndSharpness } from '../core/wasmEngine';

export interface CaptureFrameResult {
  dataUrl: string;
  width: number;
  height: number;
  canvas?: HTMLCanvasElement;
}

export function checkCanvasNonBlack(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const pts = [
      { x: Math.floor(w * 0.5), y: Math.floor(h * 0.5) },
      { x: Math.floor(w * 0.25), y: Math.floor(h * 0.25) },
      { x: Math.floor(w * 0.75), y: Math.floor(h * 0.25) },
      { x: Math.floor(w * 0.25), y: Math.floor(h * 0.75) },
      { x: Math.floor(w * 0.75), y: Math.floor(h * 0.75) },
      { x: Math.floor(w * 0.5), y: Math.floor(h * 0.3) },
      { x: Math.floor(w * 0.5), y: Math.floor(h * 0.7) },
    ];
    let total = 0;
    let nonZeroCount = 0;
    for (const p of pts) {
      const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
      const r = pixel[0] ?? 0;
      const g = pixel[1] ?? 0;
      const b = pixel[2] ?? 0;
      const a = pixel[3] ?? 0;
      total += r + g + b;
      if (a > 0 && (r > 0 || g > 0 || b > 0)) {
        nonZeroCount++;
      }
    }
    return total / (pts.length * 3) >= 5 && nonZeroCount >= 3;
  } catch {
    return true;
  }
}

export async function tryGrabCameraFrame(stream: MediaStream | null): Promise<CaptureFrameResult | null> {
  const track = stream?.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') return null;
  const ImageCaptureCtor = window.ImageCapture;
  if (typeof ImageCaptureCtor !== 'function') return null;
  try {
    const capturer = new ImageCaptureCtor(track);
    const bitmap = await capturer.grabFrame?.();
    if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        if (checkCanvasNonBlack(ctx, canvas.width, canvas.height)) {
          return { dataUrl: canvas.toDataURL('image/jpeg', 0.95), width: canvas.width, height: canvas.height, canvas };
        }
      }
    }
  } catch (e) {
    console.warn('ImageCapture.grabFrame fallback:', e);
  }
  return null;
}

export async function tryTakeCameraPhoto(stream: MediaStream | null): Promise<CaptureFrameResult | null> {
  const track = stream?.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') return null;
  const ImageCaptureCtor = window.ImageCapture;
  if (typeof ImageCaptureCtor !== 'function') return null;
  try {
    const capturer = new ImageCaptureCtor(track);
    const blob = await capturer.takePhoto?.();
    if (blob && blob.size > 2000) {
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataUrl;
      });
      return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
    }
  } catch (e) {
    console.warn('ImageCapture.takePhoto fallback:', e);
  }
  return null;
}

export async function tryCaptureVideoCanvas(video: HTMLVideoElement | null): Promise<CaptureFrameResult | null> {
  if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  if (!checkCanvasNonBlack(ctx, canvas.width, canvas.height)) {
    await new Promise((r) => requestAnimationFrame(r));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.95), width: canvas.width, height: canvas.height, canvas };
}

export async function mergeIdCardDataUrls(frontUrl: string, backUrl: string): Promise<string> {
  const loadImg = (src: string) =>
    new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  const [frontImg, backImg] = await Promise.all([loadImg(frontUrl), loadImg(backUrl)]);
  const toCanvas = (img: HTMLImageElement) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')?.drawImage(img, 0, 0);
    return c;
  };
  const mergedCanvas = await mergeIdCardSidesToA4(toCanvas(frontImg), toCanvas(backImg));
  return mergedCanvas.toDataURL('image/jpeg', 0.92);
}

export async function analyzeLiveVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  prevFrameLum: Uint8Array | null,
  resetWasmPrev: boolean
): Promise<{
  isDocumentPresent: boolean;
  motionScore: number;
  sharpness: number;
  nextLum: Uint8Array | null;
} | null> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const wasmPromise = runWasmMotionAndSharpness(data, canvas.width, canvas.height, resetWasmPrev);
  const analysis = detectDocumentCornersWithConfidence(canvas);
  const wasmMetrics = await wasmPromise;

  if (wasmMetrics) {
    return {
      isDocumentPresent: analysis.isDocumentPresent,
      motionScore: wasmMetrics.motion,
      sharpness: wasmMetrics.sharpness,
      nextLum: prevFrameLum,
    };
  }

  let motionScore = 0;
  let nextLum = prevFrameLum;
  if (data.byteLength > 0) {
    const totalPixels = canvas.width * canvas.height;
    const currLum = new Uint8Array(totalPixels);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      currLum[j] = Math.round(0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0));
    }
    if (prevFrameLum && prevFrameLum.length === totalPixels) {
      let diffSum = 0;
      let count = 0;
      for (let i = 0; i < totalPixels; i += 4) {
        diffSum += Math.abs((currLum[i] ?? 0) - (prevFrameLum[i] ?? 0));
        count++;
      }
      motionScore = count > 0 ? diffSum / count : 0;
    }
    nextLum = currLum;
  }

  return {
    isDocumentPresent: analysis.isDocumentPresent,
    motionScore,
    sharpness: calculateLaplacianSharpness(canvas),
    nextLum,
  };
}
