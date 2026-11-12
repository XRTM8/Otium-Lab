import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { playShutterSound } from '../core/audio';
import { detectDocumentCorners, getFullFrameQuad } from '../core/edgeDetection';
import type { CropMode, Quad } from '../core/types';
import {
  analyzeLiveVideoFrame,
  mergeIdCardDataUrls,
  tryCaptureVideoCanvas,
  tryGrabCameraFrame,
  tryTakeCameraPhoto,
} from './cameraCaptureHelpers';

interface MediaTrackFocusCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
}

interface MediaTrackFocusConstraintSet extends MediaTrackConstraintSet {
  focusMode?: string;
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

export function useCameraCapture(options: UseCameraCaptureOptions) {
  const {
    cropMode, viewfinderFit, autoCapture, facingMode, scanMode, idCardStep,
    setIdCardStep, idFrontDataUrl, setIdFrontDataUrl, setIdStatusToast,
    setCaptureToast, setTorchOn, pagesCount, triggerHaptic, fileInputRef, onCapture,
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
    x: number; y: number; width: number; height: number;
  } | null>(null);

  const effectiveLiveDocPresent = Boolean(hasPermission && stream && !capturing && liveDocPresent);
  const effectiveStabilityProgress = hasPermission && stream && !capturing ? stabilityProgress : 0;

  const initCamera = useCallback(async (targetFacingMode?: 'environment' | 'user') => {
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
      { video: { facingMode: { ideal: activeFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
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
  }, [facingMode]);

  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void initCamera(); });
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTorchOn(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setStream(null);
      } else {
        void initCamera();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [initCamera, setTorchOn]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch((err) => console.warn('Video auto-play interrupted:', err));
    }
  }, [stream]);

  const updateRenderedBounds = useCallback(() => {
    const video = videoRef.current;
    const container = viewfinderRef.current;
    if (!video || !container || video.videoWidth === 0 || video.videoHeight === 0) return;
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    if (cWidth === 0 || cHeight === 0) return;
    const scale =
      viewfinderFit === 'contain'
        ? Math.min(cWidth / video.videoWidth, cHeight / video.videoHeight)
        : Math.max(cWidth / video.videoWidth, cHeight / video.videoHeight);
    const renderedW = Math.round(video.videoWidth * scale);
    const renderedH = Math.round(video.videoHeight * scale);
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
    const track = stream?.getVideoTracks()[0];
    if (track) {
      try {
        const capabilities = track.getCapabilities?.() as MediaTrackFocusCapabilities | undefined;
        if (capabilities?.focusMode?.includes('continuous')) {
          const focusConstraint: MediaTrackFocusConstraintSet = { focusMode: 'continuous' };
          track.applyConstraints({ advanced: [focusConstraint] }).then(undefined, (err: unknown) => {
            console.debug('[useCameraCapture] Focus constraint unsupported:', err);
          });
        }
      } catch (err) {
        console.debug('[useCameraCapture] Track capabilities lookup skipped:', err);
      }
    }
    setTimeout(() => setFocusPoint(null), 900);
  };

  const handleCapture = useCallback(async () => {
    if (capturing) return;
    triggerHaptic(35);
    playShutterSound();
    setCapturing(true);
    setFlashAnimation(true);
    setTimeout(() => setFlashAnimation(false), 120);

    const processCapturedImage = async (dataUrl: string, frameW?: number, frameH?: number, sourceCanvas?: HTMLCanvasElement) => {
      let detectedQuad: Quad | undefined;
      if (cropMode === 'full' && frameW && frameH && frameW > 0 && frameH > 0) {
        detectedQuad = getFullFrameQuad(frameW, frameH, 0.005);
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
            const mergedUrl = await mergeIdCardDataUrls(idFrontDataUrl, dataUrl);
            setIdFrontDataUrl(null);
            setIdCardStep('front');
            setIdStatusToast('');
            setCapturing(false);
            setCaptureToast('✓ تم دمج الهوية بنجاح!');
            setTimeout(() => setCaptureToast(''), 2000);
            onCapture(mergedUrl, false);
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

    try {
      const result =
        (await tryCaptureVideoCanvas(videoRef.current)) ||
        (await tryGrabCameraFrame(stream)) ||
        (await tryTakeCameraPhoto(stream));
      if (result) {
        await processCapturedImage(result.dataUrl, result.width, result.height, result.canvas);
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
    capturing, cropMode, fileInputRef, idCardStep, idFrontDataUrl, onCapture, pagesCount,
    scanMode, setCaptureToast, setIdCardStep, setIdFrontDataUrl, setIdStatusToast, stream, triggerHaptic,
  ]);

  const handleCaptureRef = useRef(handleCapture);
  useEffect(() => { handleCaptureRef.current = handleCapture; }, [handleCapture]);

  const autoCaptureRef = useRef(autoCapture);
  useEffect(() => { autoCaptureRef.current = autoCapture; }, [autoCapture]);

  useEffect(() => {
    if (!hasPermission || !stream) return;
    let cancelled = false;
    let resetWasmPrev = true;

    const intervalId = window.setInterval(async () => {
      if (analysisBusyRef.current || cancelled) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || capturing) return;
      analysisBusyRef.current = true;
      try {
        if (!scratchCanvasRef.current) {
          scratchCanvasRef.current = document.createElement('canvas');
          scratchCanvasRef.current.width = 180;
          scratchCanvasRef.current.height = 135;
        }
        const metrics = await analyzeLiveVideoFrame(video, scratchCanvasRef.current, prevFrameLumRef.current, resetWasmPrev);
        resetWasmPrev = false;
        if (cancelled || !metrics) return;
        prevFrameLumRef.current = metrics.nextLum;
        setLiveDocPresent(metrics.isDocumentPresent);

        if (autoCaptureRef.current && metrics.isDocumentPresent && metrics.motionScore < 8.5 && metrics.sharpness >= 15) {
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
  }, [capturing, hasPermission, stream]);

  return {
    videoRef, viewfinderRef, hasPermission, stream, capturing, flashAnimation, renderedBounds,
    effectiveLiveDocPresent, effectiveStabilityProgress, focusPoint,
    initCamera, updateRenderedBounds, handleViewfinderTap, handleCapture,
  };
}
