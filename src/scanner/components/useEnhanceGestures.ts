import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface UseEnhanceGesturesOptions {
  pageScopeKey: string;
  pageCount: number;
  safeIndex: number;
  isRedacting: boolean;
  onChangePage: (index: number) => void;
  onHaptic: (duration?: number) => void;
}

/**
 * 120Hz pinch-to-zoom, double-tap zoom, zoomed pan, and horizontal swipe-to-turn
 * gesture controller for the scanner review stage.
 */
export function useEnhanceGestures({
  pageScopeKey,
  pageCount,
  safeIndex,
  isRedacting,
  onChangePage,
  onHaptic,
}: UseEnhanceGesturesOptions) {
  const [zoomPanState, setZoomPanState] = useState<{
    key: string;
    zoom: number;
    pan: { x: number; y: number };
  }>({ key: pageScopeKey, zoom: 1, pan: { x: 0, y: 0 } });
  const zoomScale = zoomPanState.key === pageScopeKey ? zoomPanState.zoom : 1;
  const panOffset = zoomPanState.key === pageScopeKey ? zoomPanState.pan : { x: 0, y: 0 };

  const setZoomScale = (next: number | ((prev: number) => number)) =>
    setZoomPanState((prev) => {
      const base = prev.key === pageScopeKey ? prev : { key: pageScopeKey, zoom: 1, pan: { x: 0, y: 0 } };
      const zoom = typeof next === 'function' ? next(base.zoom) : next;
      return { ...base, zoom };
    });

  const setPanOffset = (next: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) =>
    setZoomPanState((prev) => {
      const base = prev.key === pageScopeKey ? prev : { key: pageScopeKey, zoom: 1, pan: { x: 0, y: 0 } };
      const pan = typeof next === 'function' ? next(base.pan) : next;
      return { ...base, pan };
    });

  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const liveZoomRef = useRef<number>(1);
  const livePanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const liveSwipeXRef = useRef<number>(0);
  const liveSwipingRef = useRef<boolean>(false);
  const gestureRafRef = useRef<number | null>(null);

  const lastTapTimeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchDistanceStartRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  const applyStageTransform = (transitionCss = 'none') => {
    const el = stageContainerRef.current;
    if (!el) return;
    el.style.transition = transitionCss;
    el.style.transform = `translateX(${liveSwipeXRef.current}px) translate(${livePanRef.current.x}px, ${livePanRef.current.y}px) scale(${liveZoomRef.current})`;
  };

  const scheduleStageTransform = () => {
    if (gestureRafRef.current !== null) return;
    gestureRafRef.current = requestAnimationFrame(() => {
      gestureRafRef.current = null;
      applyStageTransform('none');
    });
  };

  const resetZoomPanDom = () => {
    if (gestureRafRef.current !== null) {
      cancelAnimationFrame(gestureRafRef.current);
      gestureRafRef.current = null;
    }
    liveZoomRef.current = 1;
    livePanRef.current = { x: 0, y: 0 };
    liveSwipeXRef.current = 0;
    liveSwipingRef.current = false;
    applyStageTransform('transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)');
  };

  const resetZoomAndPan = () => {
    resetZoomPanDom();
    setZoomPanState({ key: pageScopeKey, zoom: 1, pan: { x: 0, y: 0 } });
  };

  useEffect(() => {
    resetZoomPanDom();
  }, [pageScopeKey]);

  useEffect(() => {
    return () => {
      if (gestureRafRef.current !== null) {
        cancelAnimationFrame(gestureRafRef.current);
        gestureRafRef.current = null;
      }
    };
  }, []);

  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isRedacting) return;

    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceStartRef.current = dist;
      initialZoomRef.current = liveZoomRef.current;
      return;
    }

    if (e.touches.length === 1) {
      const now = Date.now();
      const touch = e.touches[0];

      if (now - lastTapTimeRef.current < 280) {
        lastTapTimeRef.current = 0;
        onHaptic(15);
        if (liveZoomRef.current > 1.05) {
          resetZoomAndPan();
        } else {
          liveZoomRef.current = 2.5;
          setZoomScale(2.5);
          applyStageTransform('transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)');
        }
        return;
      }
      lastTapTimeRef.current = now;

      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now };
      panStartRef.current = { ...livePanRef.current };
    }
  };

  const handleStageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isRedacting) return;

    if (e.touches.length === 2 && touchDistanceStartRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scaleFactor = dist / touchDistanceStartRef.current;
      const newScale = Math.min(4.0, Math.max(1.0, initialZoomRef.current * scaleFactor));
      liveZoomRef.current = newScale;
      if (newScale === 1.0) {
        livePanRef.current = { x: 0, y: 0 };
      }
      scheduleStageTransform();
      return;
    }

    if (e.touches.length === 1 && touchStartRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      if (liveZoomRef.current > 1.05) {
        if (panStartRef.current) {
          const maxPanX = (liveZoomRef.current - 1) * 160;
          const maxPanY = (liveZoomRef.current - 1) * 220;
          const nextX = Math.min(maxPanX, Math.max(-maxPanX, panStartRef.current.x + dx));
          const nextY = Math.min(maxPanY, Math.max(-maxPanY, panStartRef.current.y + dy));
          livePanRef.current = { x: nextX, y: nextY };
          scheduleStageTransform();
        }
      } else if (pageCount > 1) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
          liveSwipingRef.current = true;
          const isAtBoundary = (safeIndex === 0 && dx > 0) || (safeIndex === pageCount - 1 && dx < 0);
          liveSwipeXRef.current = isAtBoundary ? dx * 0.3 : dx;
          scheduleStageTransform();
        }
      }
    }
  };

  const handleStageTouchEnd = () => {
    if (isRedacting) return;
    touchDistanceStartRef.current = null;
    if (gestureRafRef.current !== null) {
      cancelAnimationFrame(gestureRafRef.current);
      gestureRafRef.current = null;
    }

    const swipeDx = liveSwipeXRef.current;
    if (liveSwipingRef.current && touchStartRef.current) {
      const dt = Date.now() - touchStartRef.current.time;
      const velocity = Math.abs(swipeDx) / Math.max(1, dt);

      if (Math.abs(swipeDx) > 60 || velocity > 0.4) {
        if (swipeDx < 0 && safeIndex < pageCount - 1) {
          onHaptic(20);
          onChangePage(safeIndex + 1);
        } else if (swipeDx > 0 && safeIndex > 0) {
          onHaptic(20);
          onChangePage(safeIndex - 1);
        }
      }
    }
    liveSwipeXRef.current = 0;
    liveSwipingRef.current = false;
    touchStartRef.current = null;
    setZoomScale(liveZoomRef.current);
    setPanOffset({ ...livePanRef.current });
    applyStageTransform(liveZoomRef.current > 1.05 ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)');
  };

  return {
    stageContainerRef,
    zoomScale,
    panOffset,
    resetZoomAndPan,
    handleStageTouchStart,
    handleStageTouchMove,
    handleStageTouchEnd,
  };
}
