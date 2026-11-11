import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { ThemeMode } from '../core/types';
import { getCanvasPixelRatio } from '../core/reader/device';
import { scheduleIdleWork, scheduleRender } from '../core/reader/renderScheduler';
import { supportsCanvasFilter, themeFilter } from './pdfPageCanvas';

interface UsePdfPageRenderParams {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  theme: ThemeMode;
  baseAspectRatio: number;
  searchQuery?: string;
  isCurrentSearchPage?: boolean;
  renderPriority: number;
}

/** Manages PDF page viewport sizing, canvas rasterization, text-layer layout, and search highlights. */
export function usePdfPageRender({
  doc,
  pageNumber,
  scale,
  theme,
  baseAspectRatio,
  searchQuery,
  isCurrentSearchPage,
  renderPriority,
}: UsePdfPageRenderParams) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const currentRenderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const renderedKeyRef = useRef('');
  const priorityRef = useRef(renderPriority);

  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [renderedTarget, setRenderedTarget] = useState<{ doc: PDFDocumentProxy; page: number } | null>(null);
  const [rasterState, setRasterState] = useState<{ doc: PDFDocumentProxy; page: number; scale: number }>(() => ({ doc, page: pageNumber, scale }));
  const [errorTarget, setErrorTarget] = useState<{ doc: PDFDocumentProxy; page: number; message: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [textLayerVersion, setTextLayerVersion] = useState(0);

  const hasRenderedOnce = renderedTarget?.doc === doc && renderedTarget?.page === pageNumber;
  const renderError = errorTarget?.doc === doc && errorTarget?.page === pageNumber ? errorTarget.message : null;
  const rasterScale = rasterState.doc === doc && rasterState.page === pageNumber ? rasterState.scale : scale;

  const rasterScaleRef = useRef(rasterScale);
  const hasRenderedOnceRef = useRef(hasRenderedOnce);
  const wasVisibleRef = useRef(false);
  const isDark = theme === 'amoled' || theme === 'midnight' || theme === 'amber' || theme === 'forest' || theme === 'nordic';
  const cssThemeFilter = useMemo(() => {
    const filter = themeFilter(theme);
    return filter && !supportsCanvasFilter() ? filter : undefined;
  }, [theme]);

  useLayoutEffect(() => {
    priorityRef.current = renderPriority;
    rasterScaleRef.current = rasterScale;
    hasRenderedOnceRef.current = hasRenderedOnce;
  }, [renderPriority, rasterScale, hasRenderedOnce]);

  // The PDF page's unscaled size is fixed; scaling it synchronously keeps
  // gesture zoom anchored to the fingers instead of waiting for a render.
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>(() => ({
    width: 595,
    height: Math.round(595 / (baseAspectRatio || 0.707))
  }));

  useEffect(() => {
    let active = true;
    let pageRef: PDFPageProxy | null = null;
    doc
      .getPage(pageNumber)
      .then((page: PDFPageProxy) => {
        pageRef = page;
        if (!active) return;
        const unscaledViewport = page.getViewport({ scale: 1 });
        setPageSize({ width: unscaledViewport.width, height: unscaledViewport.height });
      })
      .catch(() => {})
      .finally(() => {
        try {
          pageRef?.cleanup();
        } catch {}
      });

    return () => {
      active = false;
    };
  }, [doc, pageNumber]);

  const dimensions = useMemo(
    () => ({
      width: Math.max(1, Math.round(pageSize.width * scale)),
      height: Math.max(1, Math.round(pageSize.height * scale))
    }),
    [pageSize, scale]
  );

  // A reused component (dual mode) must never show the previous page while
  // the next one is still rasterising.
  useEffect(() => {
    renderedKeyRef.current = '';
    hasRenderedOnceRef.current = false;
    if (textLayerRef.current) {
      delete textLayerRef.current.dataset.pageRendered;
    }
  }, [pageNumber, doc]);

  // Keep CSS sizing immediate at 120Hz while debouncing heavy PDF.js rasterization
  // during active pinch/wheel zoom on already-painted visible pages.
  useEffect(() => {
    if (!isVisible) {
      wasVisibleRef.current = false;
      return;
    }
    const justBecameVisible = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    const syncScale = () => {
      setRasterState((prev) =>
        prev.doc === doc && prev.page === pageNumber && Math.abs(prev.scale - scale) < 0.0001
          ? prev
          : { doc, page: pageNumber, scale }
      );
    };
    if (justBecameVisible || !hasRenderedOnceRef.current) {
      const frame = window.requestAnimationFrame(syncScale);
      return () => window.cancelAnimationFrame(frame);
    }
    if (Math.abs(rasterScaleRef.current - scale) < 0.0001) return;
    const timer = window.setTimeout(syncScale, 90);
    return () => window.clearTimeout(timer);
  }, [doc, pageNumber, scale, isVisible]);

  // Auto-heal canvas on GPU context restoration (e.g. after low-memory resume)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleContextRestored = () => {
      setRetryKey((k) => k + 1);
    };
    canvas.addEventListener('contextrestored', handleContextRestored);
    return () => {
      canvas.removeEventListener('contextrestored', handleContextRestored);
    };
  }, []);

  // Mount pages a little before they enter the viewport, but let the shared
  // scheduler decide when the canvas may actually start rendering.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setIsVisible(entries[0]?.isIntersecting ?? false);
      },
      { rootMargin: '640px 0px 640px 0px', threshold: 0.01 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Immediate GPU texture release on unmount prevents VRAM accumulation in mobile WebViews.
  useEffect(() => {
    const canvas = canvasRef.current;
    const annotationCanvas = annotationCanvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      if (annotationCanvas) {
        annotationCanvas.width = 1;
        annotationCanvas.height = 1;
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const renderKey = `${pageNumber}:${rasterScale.toFixed(4)}:${theme}`;
    if (renderedKeyRef.current === renderKey) return;

    let cancelled = false;

    const run = async () => {
      if (cancelled || !canvasRef.current) return;

      let page: PDFPageProxy | null = null;
      let staging: HTMLCanvasElement | null = null;

      try {
        page = await doc.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const dpr = getCanvasPixelRatio();
        // Safe bitmap ceiling (4.5M pixels = ~18MB buffer) prevents mobile WebView OOM
        // crashes and GPU texture exhaustion when zooming in to 250%+ on Retina displays.
        const MAX_CANVAS_PIXELS = 4_500_000;
        const rawPixels = (pageSize.width * rasterScale * dpr) * (pageSize.height * rasterScale * dpr);
        const dprAdjustment = rawPixels > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / rawPixels) : 1;
        const effectiveDpr = Math.max(1, dpr * dprAdjustment);

        const viewport = page.getViewport({ scale: rasterScale * effectiveDpr });
        const cssViewport = page.getViewport({ scale: rasterScale });

        // Render into a staging canvas first. The visible canvas is updated in
        // one synchronous copy, so zooming never flashes a blank page.
        staging = document.createElement('canvas');
        staging.width = Math.max(1, Math.floor(viewport.width));
        staging.height = Math.max(1, Math.floor(viewport.height));
        const stagingContext = staging.getContext('2d', {
          alpha: false,
          willReadFrequently: false
        });
        if (!stagingContext) return;

        stagingContext.imageSmoothingEnabled = true;
        stagingContext.imageSmoothingQuality = 'high';
        stagingContext.fillStyle = '#ffffff';
        stagingContext.fillRect(0, 0, staging.width, staging.height);

        const task = page.render({
          canvas: staging,
          canvasContext: stagingContext,
          viewport,
          intent: 'display'
        });
        currentRenderTaskRef.current = task;

        try {
          await task.promise;
        } catch (error) {
          const name = (error as { name?: string } | null)?.name;
          if (!cancelled && name !== 'RenderingCancelledException') {
            console.warn(`Render notice on page ${pageNumber}:`, error);
          }
          return;
        }

        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        if (canvas.width !== staging.width) canvas.width = staging.width;
        if (canvas.height !== staging.height) canvas.height = staging.height;

        const context = canvas.getContext('2d', { alpha: false });
        if (context) {
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          const filter = themeFilter(theme);
          const canFilter = Boolean(filter && supportsCanvasFilter());
          if (canFilter && filter) context.filter = filter;
          context.drawImage(
            staging,
            0,
            0,
            staging.width,
            staging.height,
            0,
            0,
            canvas.width,
            canvas.height
          );
          if (canFilter) context.filter = 'none';
        }

        staging.width = 1;
        staging.height = 1;

        currentRenderTaskRef.current = null;
        renderedKeyRef.current = renderKey;
        setRenderedTarget({ doc, page: pageNumber });
        setErrorTarget(null);

        canvas.dataset.viewportWidth = String(Math.floor(cssViewport.width));
        canvas.dataset.viewportHeight = String(Math.floor(cssViewport.height));
      } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        if (!cancelled && name !== 'RenderingCancelledException') {
          console.warn(`Render notice on page ${pageNumber}:`, error);
          setErrorTarget({ doc, page: pageNumber, message: (error as Error)?.message || 'Render failed' });
        }
      } finally {
        if (staging) {
          staging.width = 1;
          staging.height = 1;
        }
        try {
          page?.cleanup();
        } catch {
          // Cleanup is best-effort
        }
      }
    };

    const cancelQueued = scheduleRender(priorityRef.current, run);

    return () => {
      cancelled = true;
      cancelQueued();
      const task = currentRenderTaskRef.current;
      if (task) {
        try {
          task.cancel();
        } catch {
          // A finished render task cannot be cancelled.
        }
        currentRenderTaskRef.current = null;
      }
    };
  }, [doc, pageNumber, rasterScale, pageSize.width, pageSize.height, theme, isVisible, retryKey]);

  // Text layer is laid out once at natural size and scaled via CSS transform.
  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;

    const cancelIdle = scheduleIdleWork(async () => {
      const container = textLayerRef.current;
      if (!container || cancelled) return;

      if (container.dataset.pageRendered === String(pageNumber) && container.hasChildNodes()) {
        return;
      }

      let page: PDFPageProxy | null = null;
      try {
        page = await doc.getPage(pageNumber);
        if (cancelled || !textLayerRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        if (cancelled || !textLayerRef.current) return;

        const target = textLayerRef.current;
        target.innerHTML = '';
        target.style.setProperty('--total-scale-factor', '1');
        target.style.setProperty('--scale-round-x', '1px');
        target.style.setProperty('--scale-round-y', '1px');

        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: target,
          viewport: baseViewport
        });
        await textLayer.render();

        if (!cancelled) {
          target.dataset.renderedScale = '1';
          target.dataset.pageRendered = String(pageNumber);
          setTextLayerVersion((version) => version + 1);
        }
      } catch {
        // Text layer generation is non-fatal
      } finally {
        try {
          page?.cleanup();
        } catch {
          // Cleanup is best-effort
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [doc, pageNumber, isVisible]);

  // Apply search match highlights across normalized text-layer nodes.
  useEffect(() => {
    const container = textLayerRef.current;
    if (!container || textLayerVersion === 0) return;

    container.querySelectorAll('mark.search-highlight').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    });
    container.normalize();

    const term = searchQuery?.trim() ?? '';
    if (term.length < 2) return;

    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let regex: RegExp;
    try {
      regex = new RegExp(safeTerm, 'gi');
    } catch {
      return;
    }
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode.nodeValue) textNodes.push(currentNode as Text);
      currentNode = walker.nextNode();
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue || '';
      if (!text) continue;

      regex.lastIndex = 0;
      const matches = Array.from(text.matchAll(regex));
      if (matches.length === 0) continue;

      const fragment = document.createDocumentFragment();
      let cursor = 0;

      for (const match of matches) {
        const start = match.index ?? 0;
        if (start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, start)));

        const marker = document.createElement('mark');
        marker.className = isCurrentSearchPage
          ? 'search-highlight active-search-highlight'
          : 'search-highlight';
        marker.textContent = match[0];
        fragment.appendChild(marker);
        cursor = start + match[0].length;
      }

      if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }, [searchQuery, isCurrentSearchPage, textLayerVersion]);

  const retryRender = () => {
    setErrorTarget(null);
    setRetryKey((k) => k + 1);
  };

  return {
    containerRef,
    canvasRef,
    textLayerRef,
    annotationCanvasRef,
    isVisible,
    hasRenderedOnce,
    renderError,
    dimensions,
    pageSize,
    isDark,
    cssThemeFilter,
    retryRender,
  };
}
