import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '../../core/i18n/translations';
import type { ReaderController } from '../../app/useReaderController';

interface UseBeamModalCameraOptions {
  isOpen: boolean;
  lang: Language;
  hasDoc: boolean;
  readerDoc: ReaderController['doc'];
  onDetectedRoom: (roomCode: string, hasDoc: boolean) => void;
}

export function useBeamModalCamera({
  isOpen,
  lang,
  readerDoc,
  onDetectedRoom,
}: UseBeamModalCameraOptions) {
  const [scanState, setScanState] = useState<{ open: boolean; active: boolean }>({
    open: isOpen,
    active: false,
  });
  const isScanningCamera = isOpen && scanState.open && scanState.active;
  const setIsScanningCamera = useCallback(
    (active: boolean) => {
      setScanState({ open: isOpen, active });
    },
    [isOpen]
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanAnimFrameRef = useRef<number | null>(null);

  const stopHardwareCamera = useCallback(() => {
    if (scanAnimFrameRef.current) {
      cancelAnimationFrame(scanAnimFrameRef.current);
      scanAnimFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopHardwareCamera();
    setIsScanningCamera(false);
  }, [stopHardwareCamera, setIsScanningCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopHardwareCamera();
    }
  }, [isOpen, stopHardwareCamera]);

  useEffect(() => () => stopHardwareCamera(), [stopHardwareCamera]);

  const startCameraScanner = async () => {
    setCameraError(null);
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      setCameraError(
        lang === 'ar'
          ? 'متصفح هذا الجهاز لا يدعم مسح QR. اكتب الرمز الظاهر على السبورة يدوياً.'
          : 'This browser cannot scan QR codes. Type the code shown on the board instead.'
      );
      setIsScanningCamera(false);
      return;
    }
    setIsScanningCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const BarcodeDetectorApi = (window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
        };
      }).BarcodeDetector;
      if (!BarcodeDetectorApi) {
        setCameraError(
          lang === 'ar'
            ? 'متصفح هذا الجهاز لا يدعم مسح QR. اكتب الرمز الظاهر على السبورة يدوياً.'
            : 'This browser cannot scan QR codes. Type the code shown on the board instead.'
        );
        setIsScanningCamera(false);
        return;
      }

      const detector = new BarcodeDetectorApi({ formats: ['qr_code'] });
      const scanLoop = async () => {
        if (!videoRef.current || !mediaStreamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue || '';
            const match =
              raw.match(/room=([A-Za-z0-9_-]+)/) ||
              raw.match(/(OTM-[A-Za-z0-9_-]+)/i) ||
              raw.match(/([0-9]{4,6})/);
            const detected = match ? match[1].toUpperCase() : raw.toUpperCase();
            if (detected) {
              stopCamera();
              onDetectedRoom(detected, Boolean(readerDoc));
              return;
            }
          }
        } catch {}
        scanAnimFrameRef.current = requestAnimationFrame(scanLoop);
      };
      scanAnimFrameRef.current = requestAnimationFrame(scanLoop);
    } catch (err: unknown) {
      console.warn('Camera access error:', err);
      setCameraError(lang === 'ar' ? 'تعذر تشغيل الكاميرا، يمكنك كتابة الكود يدوياً' : 'Camera inaccessible, enter code manually');
      setIsScanningCamera(false);
    }
  };

  return {
    isScanningCamera,
    cameraError,
    videoRef,
    stopCamera,
    startCameraScanner,
  };
}
