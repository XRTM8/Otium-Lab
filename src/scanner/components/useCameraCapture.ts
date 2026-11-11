import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { playShutterSound } from '../core/audio';
import {
  calculateLaplacianSharpness,
  detectDocumentCorners,
  detectDocumentCornersWithConfidence,
  getFullFrameQuad,
} from '../core/edgeDetection';
import { mergeIdCardSidesToA4 } from '../core/idCard';
import type { CropMode, Quad } from '../core/types';
import { runWasmMotionAndSharpness } from '../core/wasmEngine';

interface MediaTrackFocusCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
}

interface MediaTrackFocusConstraintSet extends MediaTrackConstraintSet {
  focusMode?: string;
}

interface ImageCaptureApi {
  grabFrame?: () => Promise<ImageBitmap>;
  takePhoto?: () => Promise<Blob>;
}

type ImageCaptureConstructor = new (track: MediaStreamTrack) => ImageCaptureApi;

interface CaptureFrameResult {
  dataUrl: string;
  width: number;
  height: number;
  canvas?: HTMLCanvasElement;
}

export interface UseCameraCaptureOptions {
  cropMode: CropMode;
  viewfinderFit: 'contain' | 'cover';
  autoCapture: boolean;
  facingMode: 'environment' | 'user';
  scanMode: 'batch' | 'single' | 'idcard';
  idCardStep: 'front' | 'back';
  setIdCardStep: (step: 'front' | 'back') => void;
  idFrontDataUrl: string | null;
  setIdFrontDataUrl: (url: string | null) => void;
  setIdStatusToast: (msg: string) => void;
  setCaptureToast: (msg: string) => void;
  setTorchOn: (on: boolean) => void;
  pagesCount: number;
  triggerHaptic: (duration?: number) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onCapture: (imageDataUrl: string, isBatchMode: boolean, detectedQuad?: Quad) => void;
}

function checkCanvasNonBlack(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
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
      total += pixel[0] + pixel[1] + pixel[2];
      if (pixel[3] > 0 && (pixel[0] > 0 || pixel[1] > 0 || pixel[2] > 0)) {
        nonZeroCount++;
      }
    }
    return total / (pts.length * 3) >= 5 && nonZeroCount >= 3;
  } catch {
    return true;
  }
}

export function useCameraCapture(options: UseCameraCaptureOptions) {
  const {
    cropMode,
    viewfinderFit,
    autoCapture,
    facingMode,
    scanMode,
    idCardStep,
    setIdCardStep,
    idFrontDataUrl,
    setIdFrontDataUrl,
    setIdStatusToast,
    setCaptureToast,
    setTorchOn,
    pagesCount,
    triggerHaptic,
    fileInputRef,
    onCapture,
  } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameLumRef = useRef<Uint8Array | null>(null);
  const stabilityStepRef = useRef<number>(0);
  const analysisBusyRef = useRef<boolean>(false);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [flashAnimation, setFlashAnimation] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState<number>(0);
  const [liveDocPresent, setLiveDocPresent] = useState<boolean>(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [renderedBounds, setRenderedBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const effectiveLiveDocPresent = Boolean(hasPermission && stream && !capturing && liveDocPresent);
  const effectiveStabilityProgress = hasPermission && stream && !capturing ? stabilityProgress : 0;

  const initCamera = useCallback(
    async (targetFacingMode?: 'environment' | 'user') => {
      const activeFacing = targetFacingMode || facingMode;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        console.warn('Camera API (navigator.mediaDevices.getUserMedia) is not available');
        setHasPermission(false);
        return;
      }

      const constraintList: MediaStreamConstraints[] = [
        {
          video: { facingMode: { ideal: activeFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        },
        { video: { facingMode: activeFacing }, audio: false },
        { video: true, audio: false },
      ];

      let acquiredStream: MediaStream | null = null;
      for (const constraints of constraintList) {
        try {
          acquiredStream = await navigator.mediaDevices.getUserMedia(constraints);
          if (acquiredStream) break;
        } catch (err) {
          console.warn('Camera constraint tier failed, trying next:', err);
        }
      }

      if (acquiredStream) {
        streamRef.current = acquiredStream;
        setStream(acquiredStream);
        setHasPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = acquiredStream;
          videoRef.current.play().catch(console.warn);
        }
      } else {
        console.warn('All camera constraints failed');
        setHasPermission(false);
      }
    },
    [facingMode]
  );

  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => {
      if (mounted) void initCamera();
    });

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTorchOn(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        setStream(null);
      } else {
        void initCamera();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [initCamera, setTorchOn]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch((err) => {
        console.warn('Video auto-play interrupted:', err);
      });
    }
  }, [stream]);

  const updateRenderedBounds = useCallback(() => {
    const video = videoRef.current;
    const container = viewfinderRef.current;
    if (!video || !container || video.videoWidth === 0 || video.videoHeight === 0) return;
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    if (cWidth === 0 || cHeight === 0) return;

    const scale =
      viewfinderFit === 'contain'
        ? Math.min(cWidth / vWidth, cHeight / vHeight)
        : Math.max(cWidth / vWidth, cHeight / vHeight);
    const renderedW = Math.round(vWidth * scale);
    const renderedH = Math.round(vHeight * scale);
    setRenderedBounds({
      x: Math.round((cWidth - renderedW) / 2),
      y: Math.round((cHeight - renderedH) / 2),
      width: renderedW,
      height: renderedH,
    });
  }, [viewfinderFit]);

  useEffect(() => {
    updateRenderedBounds();
    window.addEventListener('resize', updateRenderedBounds);
    return () => window.removeEventListener('resize', updateRenderedBounds);
  }, [updateRenderedBounds]);

  const handleViewfinderTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = viewfinderRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFocusPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    triggerHaptic(12);

    if (stream) {
      const track = stream.getVideoTracks()[0];
      try {
        const capabilities = track.getCapabilities?.() as MediaTrackFocusCapabilities | undefined;
        if (capabilities?.focusMode?.includes('continuous')) {
          const focusConstraint: MediaTrackFocusConstraintSet = { focusMode: 'continuous' };
          track.applyConstraints({ advanced: [focusConstraint] }).catch(() => {});
        }
      } catch {}
    }

    setTimeout(() => setFocusPoint(null), 1200);
  };

  const handleCapture = useCallback(async () => {
    if (capturing) return;
    triggerHaptic(35);
    playShutterSound();
    setCapturing(true);
    setFlashAnimation(true);
    setTimeout(() => setFlashAnimation(false), 120);

    const processCapturedImage = async (
      dataUrl: string,
      frameW?: number,
      frameH?: number,
      sourceCanvas?: HTMLCanvasElement
    ) => {
      let detectedQuad: Quad | undefined;
      if (cropMode === 'full') {
        if (frameW && frameH && frameW > 0 && frameH > 0) {
          detectedQuad = getFullFrameQuad(frameW, frameH, 0.005);
        }
      } else if (sourceCanvas) {
        try {
          detectedQuad = detectDocumentCorners(sourceCanvas);
        } catch {
          if (frameW && frameH) detectedQuad = getFullFrameQuad(frameW, frameH, 0.005);
        }
      } else if (frameW && frameH && frameW > 0 && frameH > 0) {
        detectedQuad = getFullFrameQuad(frameW, frameH, 0.005);
      }

      if (scanMode === 'idcard') {
        if (idCardStep === 'front') {
          setIdFrontDataUrl(dataUrl);
          setIdCardStep('back');
          setIdStatusToast('✓ تم تصوير الوجه الأمامي — الآن اقلب الهوية وصور الوجه الخلفي');
          setTimeout(() => setIdStatusToast(''), 3500);
          setCapturing(false);
          return;
        }
        if (idFrontDataUrl) {
          setIdStatusToast('⏳ جاري دمج وجهي الهوية على ورقة A4...');
          try {
            const loadImg = (src: string) =>
              new Promise<HTMLImageElement>((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = src;
              });
            const [frontImg, backImg] = await Promise.all([loadImg(idFrontDataUrl), loadImg(dataUrl)]);
            const makeCanvas = (img: HTMLImageElement) => {
              const c = document.createElement('canvas');
              c.width = img.naturalWidth;
              c.height = img.naturalHeight;
              c.getContext('2d')?.drawImage(img, 0, 0);
              return c;
            };
            const mergedCanvas = await mergeIdCardSidesToA4(makeCanvas(frontImg), makeCanvas(backImg));
            setIdFrontDataUrl(null);
            setIdCardStep('front');
            setIdStatusToast('');
            setCapturing(false);
            setCaptureToast('✓ تم دمج الهوية بنجاح!');
            setTimeout(() => setCaptureToast(''), 2000);
            onCapture(mergedCanvas.toDataURL('image/jpeg', 0.92), false);
            return;
          } catch (e) {
            console.warn('ID Card merge failed:', e);
          }
        }
      }

      setCapturing(false);
      const isBatch = scanMode === 'batch';
      setCaptureToast(isBatch ? `✓ تمت إضافة صفحة ${pagesCount + 1}` : '✓ تم حفظ الصورة');
      setTimeout(() => setCaptureToast(''), 1800);
      onCapture(dataUrl, isBatch, detectedQuad);
    };

    const tryGrabFrame = async (): Promise<CaptureFrameResult | null> => {
      if (!stream) return null;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return null;
      const ImageCaptureCtor = (window as unknown as { ImageCapture?: ImageCaptureConstructor }).ImageCapture;
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
    };

    const tryTakePhoto = async (): Promise<CaptureFrameResult | null> => {
      if (!stream) return null;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return null;
      const ImageCaptureCtor = (window as unknown as { ImageCapture?: ImageCaptureConstructor }).ImageCapture;
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
    };

    const tryVideoCanvas = async (): Promise<CaptureFrameResult | null> => {
      const video = videoRef.current;
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
    };

    try {
      const captureResult = (await tryVideoCanvas()) || (await tryGrabFrame()) || (await tryTakePhoto());
      if (captureResult) {
        await processCapturedImage(
          captureResult.dataUrl,
          captureResult.width,
          captureResult.height,
          captureResult.canvas
        );
      } else {
        fileInputRef.current?.click();
        setCapturing(false);
      }
    } catch (err) {
      console.warn('Capture error:', err);
      fileInputRef.current?.click();
      setCapturing(false);
    }
  }, [
    capturing,
    cropMode,
    fileInputRef,
    idCardStep,
    idFrontDataUrl,
    onCapture,
    pagesCount,
    scanMode,
    setCaptureToast,
    setIdCardStep,
    setIdFrontDataUrl,
    setIdStatusToast,
    stream,
    triggerHaptic,
  ]);

  const handleCaptureRef = useRef(handleCapture);
  useEffect(() => {
    handleCaptureRef.current = handleCapture;
  }, [handleCapture]);

  useEffect(() => {
    if (!hasPermission || !stream || capturing) {
      stabilityStepRef.current = 0;
      analysisBusyRef.current = false;
      return;
    }

    let cancelled = false;
    let resetWasmPrev = true;

    const intervalId = window.setInterval(async () => {
      if (analysisBusyRef.current || cancelled) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || capturing) {
        return;
      }

      analysisBusyRef.current = true;
      try {
        if (!scratchCanvasRef.current) {
          scratchCanvasRef.current = document.createElement('canvas');
          scratchCanvasRef.current.width = 180;
          scratchCanvasRef.current.height = 135;
        }
        const canvas = scratchCanvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const wasmPromise = runWasmMotionAndSharpness(data, canvas.width, canvas.height, resetWasmPrev);
        resetWasmPrev = false;

        const analysis = detectDocumentCornersWithConfidence(canvas);
        const wasmMetrics = await wasmPromise;
        if (cancelled) return;

        let motionScore = 0;
        let sharpness: number;
        if (wasmMetrics) {
          motionScore = wasmMetrics.motion;
          sharpness = wasmMetrics.sharpness;
        } else {
          if (data.byteLength > 0) {
            const totalPixels = canvas.width * canvas.height;
            const currLum = new Uint8Array(totalPixels);
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
              currLum[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            }
            if (prevFrameLumRef.current && prevFrameLumRef.current.length === totalPixels) {
              let diffSum = 0;
              let count = 0;
              for (let i = 0; i < totalPixels; i += 4) {
                diffSum += Math.abs(currLum[i] - prevFrameLumRef.current[i]);
                count++;
              }
              motionScore = count > 0 ? diffSum / count : 0;
            }
            prevFrameLumRef.current = currLum;
          }
          sharpness = calculateLaplacianSharpness(canvas);
        }

        setLiveDocPresent(analysis.isDocumentPresent);

        if (autoCapture && analysis.isDocumentPresent && motionScore < 8.5 && sharpness >= 15) {
          stabilityStepRef.current += 1;
          setStabilityProgress(Math.min(100, Math.round((stabilityStepRef.current / 3) * 100)));
          if (stabilityStepRef.current >= 3) {
            stabilityStepRef.current = 0;
            setStabilityProgress(0);
            handleCaptureRef.current();
          }
        } else {
          stabilityStepRef.current = 0;
          setStabilityProgress(0);
        }
      } finally {
        analysisBusyRef.current = false;
      }
    }, 220);

    return () => {
      cancelled = true;
      analysisBusyRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [autoCapture, capturing, hasPermission, stream]);

  return {
    videoRef,
    viewfinderRef,
    hasPermission,
    stream,
    capturing,
    flashAnimation,
    renderedBounds,
    effectiveLiveDocPresent,
    effectiveStabilityProgress,
    focusPoint,
    initCamera,
    updateRenderedBounds,
    handleViewfinderTap,
    handleCapture,
  };
}
