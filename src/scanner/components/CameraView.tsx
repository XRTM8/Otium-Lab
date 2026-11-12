import { localStorage } from '../../lab/storage';
import React, { useRef, useState } from 'react';
import { CameraViewfinderHud } from './CameraViewfinderHud';
import { useCameraCapture } from './useCameraCapture';
import type { Quad, CropMode } from '../core/types';

interface CameraViewProps {
  onCapture: (imageDataUrl: string, isBatchMode: boolean, detectedQuad?: Quad) => void;
  pagesCount: number;
  lastThumbnail?: string;
  onFinishBatch: () => void;
  onOpenLibrary?: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onCapture,
  pagesCount,
  lastThumbnail,
  onFinishBatch,
  onOpenLibrary,
  onOpenSettings,
  onClose,
}) => {
  const [torchOn, setTorchOn] = useState(false);
  const [scanMode, setScanMode] = useState<'batch' | 'single' | 'idcard'>('batch');
  const [idCardStep, setIdCardStep] = useState<'front' | 'back'>('front');
  const [idFrontDataUrl, setIdFrontDataUrl] = useState<string | null>(null);
  const [idStatusToast, setIdStatusToast] = useState<string>('');
  const [captureToast, setCaptureToast] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [autoCapture, setAutoCapture] = useState<boolean>(() => {
    try {
      return localStorage.getItem('otium_scan_auto_capture') === 'true';
    } catch {
      return false;
    }
  });
  const [cropMode] = useState<CropMode>(() => {
    try {
      return (localStorage.getItem('otium_scan_crop_mode') as CropMode) || 'full';
    } catch {
      return 'full';
    }
  });
  const [viewfinderFit] = useState<'contain' | 'cover'>(() => {
    try {
      return (localStorage.getItem('otium_scan_viewfinder_fit') as 'contain' | 'cover') || 'contain';
    } catch {
      return 'contain';
    }
  });

  const triggerHaptic = (duration = 25) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch (err) {
        console.debug('[CameraView] Haptic vibrate skipped:', err);
      }
    }
  };

  const {
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
  } = useCameraCapture({
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
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validImageFiles = Array.from(files).filter((file) => {
      const isImage = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
      const isUnderLimit = file.size <= 50 * 1024 * 1024;
      return isImage && isUnderLimit;
    });

    if (validImageFiles.length === 0) {
      setCaptureToast('⚠️ الملفات المحددة غير صالحة (يُشترط صور JPEG/PNG/WebP بحجم أقل من 50 ميجابايت)');
      setTimeout(() => setCaptureToast(''), 3000);
      e.target.value = '';
      return;
    }

    const isMulti = validImageFiles.length > 1 || scanMode === 'batch';
    validImageFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onCapture(reader.result, isMulti);
          if (index === validImageFiles.length - 1) {
            setCaptureToast(`✓ تم استيراد ${validImageFiles.length} صورة من المعرض`);
            setTimeout(() => setCaptureToast(''), 2200);
          }
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
      if (capabilities && 'torch' in capabilities && capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
        });
        setTorchOn(!torchOn);
        triggerHaptic(15);
      } else {
        setCaptureToast('الفلاش غير مدعوم في هذه الكاميرا');
        setTimeout(() => setCaptureToast(''), 2200);
      }
    } catch (e) {
      console.warn('Torch unsupported:', e);
      setCaptureToast('تعذر تشغيل الفلاش');
      setTimeout(() => setCaptureToast(''), 2200);
    }
  };

  return (
    <CameraViewfinderHud
      flashAnimation={flashAnimation}
      captureToast={captureToast}
      idStatusToast={idStatusToast}
      hasClose={Boolean(onClose)}
      onCloseClick={() => {
        triggerHaptic(15);
        onClose?.();
      }}
      onOpenLibraryClick={() => {
        triggerHaptic(15);
        onOpenLibrary?.();
      }}
      autoCapture={autoCapture}
      onToggleAutoCapture={() => {
        const next = !autoCapture;
        setAutoCapture(next);
        try {
          localStorage.setItem('otium_scan_auto_capture', String(next));
        } catch (err) {
          console.warn('[CameraView] Failed to persist auto-capture setting:', err);
        }
        setCaptureToast(next ? '✓ تم تفعيل الالتقاط التلقائي الذكي' : 'الالتقاط اليدوي');
        setTimeout(() => setCaptureToast(''), 2200);
        triggerHaptic(15);
      }}
      torchOn={torchOn}
      onToggleTorch={toggleTorch}
      onFlipCamera={() => {
        triggerHaptic(15);
        const nextMode = facingMode === 'environment' ? 'user' : 'environment';
        setFacingMode(nextMode);
        setTorchOn(false);
        initCamera(nextMode);
      }}
      onOpenSettingsClick={() => {
        triggerHaptic(15);
        onOpenSettings?.();
      }}
      viewfinderRef={viewfinderRef}
      onViewfinderTap={handleViewfinderTap}
      videoRef={videoRef}
      onVideoLoadedMetadata={() => {
        videoRef.current?.play().catch(console.warn);
        updateRenderedBounds();
      }}
      viewfinderFit={viewfinderFit}
      focusPoint={focusPoint}
      hasPermission={hasPermission}
      onRetryCamera={() => {
        triggerHaptic(20);
        initCamera();
      }}
      fileInputRef={fileInputRef}
      scanMode={scanMode}
      idCardStep={idCardStep}
      renderedBounds={renderedBounds}
      effectiveLiveDocPresent={effectiveLiveDocPresent}
      effectiveStabilityProgress={effectiveStabilityProgress}
      pagesCount={pagesCount}
      onSelectScanMode={(mode) => {
        triggerHaptic(10);
        setScanMode(mode);
        if (mode === 'idcard') {
          setIdCardStep('front');
          setIdFrontDataUrl(null);
        }
      }}
      capturing={capturing}
      onCaptureClick={handleCapture}
      onFinishBatchClick={() => {
        triggerHaptic(20);
        onFinishBatch();
      }}
      lastThumbnail={lastThumbnail}
      onFileChange={handleFileChange}
    />
  );
};
