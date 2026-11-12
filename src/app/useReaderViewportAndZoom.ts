import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ViewMode } from '../core/types';
import { computeOptimalPageScale } from '../core/reader/device';
import { pinchScale } from '../core/reader/pinch';
import { saveLastPage } from '../core/settings/preferences';
import { updateDocumentPage } from '../core/storage/documents';
import { stopTts } from '../platform/tts';
import {
  isInteractiveTarget,
  type ZoomAnchor,
} from './readerControllerHelpers';
import { useReaderWheelNavigation, type ScrollMetrics } from './useReaderWheelNavigation';

interface UseReaderViewportAndZoomOptions {
  doc: PDFDocumentProxy | null;
  viewMode: ViewMode;
  basePageSize: { width: number; height: number };
  chromeInset: number;
  keyboardCapable: boolean;
  currentPageRef: React.MutableRefObject<number>;
  docIdRef: React.MutableRefObject<string>;
  pageSaveTimerRef: React.MutableRefObject<number | null>;
  actionsRef: React.MutableRefObject<{
    scrollToRenderedPage: (pageNumber: number, offsetRatio?: number) => void;
    goToNextPage: () => void;
    goToPrevPage: () => void;
  }>;
}

/**
 * Owns reader zoom state, spatial pinch/ctrl-wheel anchoring, trackpad paged
 * wheel turns, resize/orientation rescaling, and lifecycle flush on page hide.
 */
export function useReaderViewportAndZoom({
  doc,
  viewMode,
  basePageSize,
  chromeInset,
  keyboardCapable,
  currentPageRef,
  docIdRef,
  pageSaveTimerRef,
  actionsRef,
}: UseReaderViewportAndZoomOptions) {
  const [zoom, setZoom] = useState(1.15);
  const [fitScaleState, setFitScaleState] = useState(0);
  const lastFitScaleRef = useRef(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pinchFrameRef = useRef<number | null>(null);
  const pendingPinchZoom = useRef<number | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const isPinchingRef = useRef(false);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const zoomFocusRef = useRef<{ x: number; y: number } | null>(null);

  const cachedScrollMetricsRef = useRef<ScrollMetrics>({
    maxScrollX: 0,
    maxScrollY: 0,
    isOverflowingX: false,
    isOverflowingY: false,
  });

  useEffect(() => {
    return () => {
      if (pinchFrameRef.current !== null) cancelAnimationFrame(pinchFrameRef.current);
    };
  }, []);

  const getFitScale = useCallback(() => {
    if (!basePageSize.width || !basePageSize.height || typeof window === 'undefined') {
      return 1.15;
    }
    return computeOptimalPageScale(
      basePageSize.width,
      basePageSize.height,
      scrollContainerRef.current?.clientWidth || window.innerWidth,
      (scrollContainerRef.current?.clientHeight || window.innerHeight) - chromeInset,
      viewMode
    );
  }, [basePageSize, chromeInset, viewMode]);

  const getMinZoom = useCallback(() => {
    const fit = lastFitScaleRef.current || getFitScale();
    return Math.max(0.04, Math.min(0.5, Number((fit * 0.5).toFixed(2))));
  }, [getFitScale]);

  const getMaxZoom = useCallback(() => {
    const fit = lastFitScaleRef.current || getFitScale();
    return Math.max(3.5, Number((fit * 4.0).toFixed(2)));
  }, [getFitScale]);

  const captureZoomAnchor = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const page = target?.closest<HTMLElement>('[data-pdf-page]');
    if (!page) {
      zoomAnchorRef.current = null;
      zoomFocusRef.current = null;
      return;
    }
    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      zoomAnchorRef.current = null;
      zoomFocusRef.current = null;
      return;
    }
    zoomAnchorRef.current = {
      element: page,
      fractionX: (clientX - rect.left) / rect.width,
      fractionY: (clientY - rect.top) / rect.height,
    };
    zoomFocusRef.current = { x: clientX, y: clientY };
  }, []);

  const clearZoomAnchor = useCallback(() => {
    zoomAnchorRef.current = null;
    zoomFocusRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const focus = zoomFocusRef.current;
    const container = scrollContainerRef.current;
    if (zoom <= 0 || !anchor || !focus || !container || !anchor.element.isConnected) return;

    const rect = anchor.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const targetX = rect.left + anchor.fractionX * rect.width;
    const targetY = rect.top + anchor.fractionY * rect.height;
    const deltaX = targetX - focus.x;
    const deltaY = targetY - focus.y;

    if (Math.abs(deltaX) > 0.5) container.scrollLeft += deltaX;
    if (Math.abs(deltaY) > 0.5) container.scrollTop += deltaY;
  }, [zoom]);

  useEffect(() => {
    let timer: number | null = null;
    let stabilizeTimer: number | null = null;

    const rescale = () => {
      if (typeof window === 'undefined') return;
      if (window.innerWidth <= 0 || window.innerHeight <= 0) return;
      if (!doc || !basePageSize.width || !basePageSize.height) return;

      const fit = computeOptimalPageScale(
        basePageSize.width,
        basePageSize.height,
        scrollContainerRef.current?.clientWidth || window.innerWidth,
        (scrollContainerRef.current?.clientHeight || window.innerHeight) - chromeInset,
        viewMode
      );
      const previousFit = lastFitScaleRef.current;
      lastFitScaleRef.current = fit;
      setFitScaleState(fit);
      const minZ = Math.max(0.04, Math.min(0.5, Number((fit * 0.5).toFixed(2))));
      const maxZ = Math.max(3.5, Number((fit * 4.0).toFixed(2)));
      setZoom((current) =>
        current <= (previousFit || fit) * 1.08
          ? fit
          : Math.min(maxZ, Math.max(minZ, current))
      );
      window.requestAnimationFrame(() => {
        actionsRef.current.scrollToRenderedPage(currentPageRef.current);
      });
    };

    const handleResizeOrOrientation = () => {
      if (timer !== null) window.clearTimeout(timer);
      if (stabilizeTimer !== null) window.clearTimeout(stabilizeTimer);
      timer = window.setTimeout(rescale, 80);
      stabilizeTimer = window.setTimeout(rescale, 320);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        rescale();
        window.setTimeout(rescale, 220);
      } else if (document.visibilityState === 'hidden') {
        stopTts();
        const activeDocId = docIdRef.current;
        const activePage = currentPageRef.current;
        if (pageSaveTimerRef.current !== null && activeDocId) {
          window.clearTimeout(pageSaveTimerRef.current);
          pageSaveTimerRef.current = null;
        }
        if (activeDocId) {
          saveLastPage(activeDocId, activePage);
          void updateDocumentPage(activeDocId, activePage);
        }
      }
    };

    const handlePageHide = () => {
      stopTts();
      const activeDocId = docIdRef.current;
      const activePage = currentPageRef.current;
      if (activeDocId) {
        saveLastPage(activeDocId, activePage);
        void updateDocumentPage(activeDocId, activePage);
      }
    };

    window.addEventListener('resize', handleResizeOrOrientation);
    window.addEventListener('orientationchange', handleResizeOrOrientation);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      if (stabilizeTimer !== null) window.clearTimeout(stabilizeTimer);
      window.removeEventListener('resize', handleResizeOrOrientation);
      window.removeEventListener('orientationchange', handleResizeOrOrientation);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [doc, basePageSize, chromeInset, viewMode, actionsRef, currentPageRef, docIdRef, pageSaveTimerRef]);

  const { resetWheelTurnAccum } = useReaderWheelNavigation({
    doc,
    viewMode,
    scrollContainerRef,
    cachedScrollMetricsRef,
    lastFitScaleRef,
    getMinZoom,
    getMaxZoom,
    setZoom,
    captureZoomAnchor,
    clearZoomAnchor,
    actionsRef,
  });

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) return;

    if (event.touches.length === 2) {
      const t0 = event.touches[0];
      const t1 = event.touches[1];
      if (!t0 || !t1) return;
      const distance = Math.hypot(
        t0.clientX - t1.clientX,
        t0.clientY - t1.clientY
      );
      if (distance > 10) {
        pinchStartDistRef.current = distance;
        pinchStartZoomRef.current = zoom;
        isPinchingRef.current = true;
        captureZoomAnchor(
          (t0.clientX + t1.clientX) / 2,
          (t0.clientY + t1.clientY) / 2
        );
      }
      return;
    }

    if (event.touches.length === 1 && !isPinchingRef.current) {
      const container = scrollContainerRef.current;
      if (container) {
        const maxScrollX = Math.max(0, container.scrollWidth - container.clientWidth);
        const maxScrollY = Math.max(0, container.scrollHeight - container.clientHeight);
        cachedScrollMetricsRef.current = {
          maxScrollX,
          maxScrollY,
          isOverflowingX: maxScrollX > 2,
          isOverflowingY: maxScrollY > 2,
        };
      }
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (
      event.touches.length === 2 &&
      pinchStartDistRef.current !== null &&
      pinchStartDistRef.current > 0
    ) {
      const t0 = event.touches[0];
      const t1 = event.touches[1];
      if (!t0 || !t1) return;
      const distance = Math.hypot(
        t0.clientX - t1.clientX,
        t0.clientY - t1.clientY
      );
      zoomFocusRef.current = {
        x: (t0.clientX + t1.clientX) / 2,
        y: (t0.clientY + t1.clientY) / 2,
      };
      const minZ = getMinZoom();
      const maxZ = getMaxZoom();
      const targetZoom = pinchScale(pinchStartZoomRef.current, pinchStartDistRef.current, distance, minZ, maxZ);
      if (Number.isFinite(targetZoom) && targetZoom > 0 && Math.abs(targetZoom - zoom) >= 0.01) {
        pendingPinchZoom.current = targetZoom;
        if (pinchFrameRef.current === null) {
          pinchFrameRef.current = requestAnimationFrame(() => {
            pinchFrameRef.current = null;
            if (pendingPinchZoom.current !== null) setZoom(pendingPinchZoom.current);
          });
        }
      }
    }
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length > 0) return;
    if (pinchFrameRef.current !== null) cancelAnimationFrame(pinchFrameRef.current);
    pinchFrameRef.current = null;
    if (isPinchingRef.current && pendingPinchZoom.current !== null) setZoom(pendingPinchZoom.current);
    pendingPinchZoom.current = null;
    isPinchingRef.current = false;
    pinchStartDistRef.current = null;

    const anchor = zoomAnchorRef.current;
    requestAnimationFrame(() => {
      if (zoomAnchorRef.current === anchor) clearZoomAnchor();
    });
  };

  const handleTouchCancel = () => {
    if (pinchFrameRef.current !== null) cancelAnimationFrame(pinchFrameRef.current);
    pinchFrameRef.current = null;
    pendingPinchZoom.current = null;
    isPinchingRef.current = false;
    pinchStartDistRef.current = null;
    clearZoomAnchor();
  };

  const renderFitScale =
    fitScaleState ||
    (!basePageSize.width || !basePageSize.height
      ? 1.15
      : computeOptimalPageScale(
          basePageSize.width,
          basePageSize.height,
          keyboardCapable ? 1280 : 390,
          (keyboardCapable ? 800 : 844) - chromeInset,
          viewMode
        ));

  return {
    zoom,
    setZoom,
    fitScaleState,
    setFitScaleState,
    lastFitScaleRef,
    scrollContainerRef,
    getFitScale,
    getMinZoom,
    getMaxZoom,
    renderFitScale,
    minZoom: Math.max(0.04, Math.min(0.5, Number((renderFitScale * 0.5).toFixed(2)))),
    maxZoom: Math.max(3.5, Number((renderFitScale * 4.0).toFixed(2))),
    captureZoomAnchor,
    clearZoomAnchor,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    resetWheelTurnAccum,
  };
}
