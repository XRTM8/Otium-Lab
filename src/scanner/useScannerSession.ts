import { useState, useEffect, useCallback } from 'react';
import type { Quad, ScannedPage, ScanStep } from './core/types';
import { applyFilterAsync } from './core/filters';
import { registerBackHandler } from '../core/navigation/backHandler';
import {
  storePageToDisk,
  clearScanSession,
  rotateStoredPage,
  deleteStoredPage,
  duplicateStoredPage,
  loadOriginalDataUrlFromDisk,
  saveActiveSessionPages,
  getActiveSessionPages,
  clearActiveSessionPages,
} from './core/storage/pageStore';
import { getFullFrameQuad } from './core/edgeDetection';
import { warpPerspectiveAsync } from './core/geometry';
import { terminateScannerWorker } from './core/wasmEngine';

export function useScannerSession(onClose: () => void) {
  const [{ initialStep, initialPages }] = useState(() => {
    const activeDraft = getActiveSessionPages();
    if (activeDraft && activeDraft.length > 0) {
      return { initialStep: 'review' as ScanStep, initialPages: activeDraft };
    }
    return { initialStep: 'camera' as ScanStep, initialPages: [] as ScannedPage[] };
  });

  const [step, setStep] = useState<ScanStep>(initialStep);
  const [currentRawImage, setCurrentRawImage] = useState<string>('');
  const [currentInitialQuad, setCurrentInitialQuad] = useState<Quad | null>(null);
  const [pages, setPages] = useState<ScannedPage[]>(initialPages);
  const [retakeTargetIndex, setRetakeTargetIndex] = useState<number | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [isOpeningInReader, setIsOpeningInReader] = useState(false);

  useEffect(() => () => { terminateScannerWorker(); }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => saveActiveSessionPages(pages), 350);
    return () => window.clearTimeout(timer);
  }, [pages]);

  const handleCapture = (imageSrc: string, isBatchMode: boolean, detectedQuad?: Quad) => {
    setCurrentRawImage(imageSrc);
    if (!isBatchMode || retakeTargetIndex !== null) {
      setCurrentInitialQuad(detectedQuad ?? null);
      setStep('crop');
      return;
    }

    const img = new Image();
    img.onload = async () => {
      try {
        const quad = detectedQuad ?? getFullFrameQuad(img.naturalWidth, img.naturalHeight, 0.005);
        const warpedCanvas = await warpPerspectiveAsync(img, quad);
        const filteredCanvas = await applyFilterAsync(warpedCanvas, 'magic');
        const pageId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const thumbnailDataUrl = await storePageToDisk(pageId, imageSrc, warpedCanvas, filteredCanvas, 'magic');
        const newPage: ScannedPage = { id: pageId, thumbnailDataUrl, quad, filter: 'magic', timestamp: Date.now() };
        setPages((prev) => [...prev, newPage]);
      } catch (err) {
        console.warn('Batch page capture error:', err);
      }
    };
    img.src = imageSrc;
  };

  const handleCropConfirm = async (warpedCanvas: HTMLCanvasElement, quad: Quad) => {
    try {
      const pageId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const filteredCanvas = await applyFilterAsync(warpedCanvas, 'magic');
      const thumbnailDataUrl = await storePageToDisk(pageId, currentRawImage, warpedCanvas, filteredCanvas, 'magic');
      const newPage: ScannedPage = { id: pageId, thumbnailDataUrl, quad, filter: 'magic', timestamp: Date.now() };
      if (retakeTargetIndex !== null) {
        setPages((prev) => {
          const updated = [...prev];
          if (retakeTargetIndex >= 0 && retakeTargetIndex < updated.length) updated[retakeTargetIndex] = newPage;
          return updated;
        });
        setRetakeTargetIndex(null);
      } else {
        setPages((prev) => [...prev, newPage]);
      }
    } catch (err) {
      console.warn('Crop confirm error:', err);
    } finally {
      setCurrentRawImage('');
      setCurrentInitialQuad(null);
      setStep('review');
    }
  };

  const handleCropCancel = useCallback(() => {
    setCurrentRawImage('');
    setCurrentInitialQuad(null);
    setRetakeTargetIndex(null);
    setStep(pages.length > 0 ? 'review' : 'camera');
  }, [pages.length]);

  const handleEditCrop = async (index: number) => {
    const page = pages[index];
    if (!page) return;
    try {
      const originalDataUrl = await loadOriginalDataUrlFromDisk(page.id);
      setCurrentRawImage(originalDataUrl);
      setCurrentInitialQuad(page.quad);
      setRetakeTargetIndex(index);
      setStep('crop');
    } catch (e) {
      console.warn('Could not load original image for crop:', e);
    }
  };

  const handleRotatePage = async (index: number) => {
    const page = pages[index];
    if (!page) return;
    try {
      const newThumb = await rotateStoredPage(page.id);
      setPages((prev) => {
        const updated = [...prev];
        if (updated[index]) updated[index] = { ...updated[index], thumbnailDataUrl: newThumb };
        return updated;
      });
    } catch (err) {
      console.error('Failed to rotate page:', err);
    }
  };

  const handleDeletePage = (index: number) => {
    const page = pages[index];
    if (page) deleteStoredPage(page.id).catch(console.warn);
    setPages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setStep('camera');
      return next;
    });
  };

  const handleDuplicatePage = async (index: number) => {
    const page = pages[index];
    if (!page) return;
    const newId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      await duplicateStoredPage(page.id, newId);
      setPages((prev) => {
        const idx = prev.findIndex((p) => p.id === page.id);
        const sourcePage = idx === -1 ? undefined : prev[idx];
        if (!sourcePage) return prev;
        const copy: ScannedPage = { ...sourcePage, id: newId, timestamp: Date.now() };
        const updated = [...prev];
        updated.splice(idx + 1, 0, copy);
        return updated;
      });
    } catch (err) {
      console.warn('Failed to duplicate page:', err);
    }
  };

  const handleUpdatePageThumbnail = useCallback((pageId: string, thumbnailDataUrl: string) => {
    setPages((prev) => prev.map((page) => (page.id === pageId ? { ...page, thumbnailDataUrl } : page)));
  }, []);

  const handleMovePage = (fromIndex: number, toIndex: number) => {
    setPages((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      if (!moved) return prev;
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const handleResetAll = () => {
    clearScanSession();
    clearActiveSessionPages();
    setPages([]);
    setStep('camera');
  };

  const handleRequestClose = useCallback(() => {
    if (pages.length === 0) {
      clearScanSession();
      clearActiveSessionPages();
      onClose();
    } else {
      setShowCloseConfirmModal(true);
    }
  }, [pages.length, onClose]);

  const handleSaveDraftAndClose = () => {
    saveActiveSessionPages(pages);
    setShowCloseConfirmModal(false);
    onClose();
  };

  const handleDiscardAndClose = () => {
    clearScanSession();
    clearActiveSessionPages();
    setPages([]);
    setShowCloseConfirmModal(false);
    onClose();
  };

  useEffect(() => {
    const handleBack = (event?: Event) => {
      if (event && event.cancelable) event.preventDefault();
      if (isLibraryOpen) { setIsLibraryOpen(false); return true; }
      if (isSettingsOpen) { setIsSettingsOpen(false); return true; }
      if (showCloseConfirmModal) { setShowCloseConfirmModal(false); return true; }
      if (step === 'crop') { handleCropCancel(); return true; }
      if (step === 'review' && pages.length === 0) { setStep('camera'); return true; }
      handleRequestClose();
      return true;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleBack();
      }
    };
    const unregisterBack = registerBackHandler(() => { handleBack(); return true; });
    window.addEventListener('otium:back', handleBack);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      unregisterBack();
      window.removeEventListener('otium:back', handleBack);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLibraryOpen, isSettingsOpen, showCloseConfirmModal, step, pages.length, handleCropCancel, handleRequestClose]);

  return {
    step, setStep, currentRawImage, currentInitialQuad, pages, setPages,
    isLibraryOpen, setIsLibraryOpen, isSettingsOpen, setIsSettingsOpen,
    showCloseConfirmModal, setShowCloseConfirmModal, isOpeningInReader, setIsOpeningInReader,
    handleCapture, handleCropConfirm, handleCropCancel,
    handleAddMorePages: () => { setRetakeTargetIndex(null); setStep('camera'); },
    handleRetakePage: (index: number) => { setRetakeTargetIndex(index); setStep('camera'); },
    handleEditCrop, handleRotatePage, handleDeletePage, handleDuplicatePage,
    handleUpdatePageThumbnail, handleMovePage, handleResetAll,
    handleRequestClose, handleSaveDraftAndClose, handleDiscardAndClose,
  };
}
