import { useRef, useState, useCallback, useEffect } from 'react';
import type React from 'react';
import type { Point, Quad } from '../core/types';
import { getDefaultQuad, getFullFrameQuad, warpPerspectiveAsync, isQuadConvex } from '../core/geometry';
import { detectDocumentCorners } from '../core/edgeDetection';

export type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';
export type EdgeKey = 'top' | 'right' | 'bottom' | 'left';

interface UseCropInteractionOptions {
  imageSrc: string;
  initialQuad?: Quad;
  onConfirm: (warpedCanvas: HTMLCanvasElement, quad: Quad) => void;
}

export function triggerCropHaptic(duration = 10): void {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(duration);
    } catch {}
  }
}

export function useCropInteraction({ imageSrc, initialQuad, onConfirm }: UseCropInteractionOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageBoundsRef = useRef<DOMRect | null>(null);
  const hasInitializedRef = useRef(false);

  const [currentSrc, setCurrentSrc] = useState<string>(imageSrc);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);
  const [activeEdge, setActiveEdge] = useState<EdgeKey | null>(null);
  const [edgeDragStart, setEdgeDragStart] = useState<{ client: Point; quad: Quad } | null>(null);
  const [pointerPos, setPointerPos] = useState<Point | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [imageRect, setImageRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [undoStack, setUndoStack] = useState<Quad[]>([]);
  const [redoStack, setRedoStack] = useState<Quad[]>([]);

  const syncImageRect = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setImageRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
  }, []);

  useEffect(() => {
    const img = imageRef.current;
    const onResize = () => syncImageRect();
    window.addEventListener('resize', onResize);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && img) {
      observer = new ResizeObserver(onResize);
      observer.observe(img);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [syncImageRect, currentSrc]);

  const pushHistory = useCallback((currentQuad: Quad | null) => {
    if (!currentQuad) return;
    setUndoStack((prev) => [...prev.slice(-12), { ...currentQuad }]);
    setRedoStack([]);
  }, []);

  const handleUndo = () => {
    if (undoStack.length === 0 || !quad) return;
    triggerCropHaptic(10);
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, { ...quad }]);
    setUndoStack((u) => u.slice(0, -1));
    setQuad(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !quad) return;
    triggerCropHaptic(10);
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, { ...quad }]);
    setRedoStack((r) => r.slice(0, -1));
    setQuad(next);
  };

  const applyAspectRatio = (ratio: number) => {
    if (!imageRef.current || imageSize.width === 0 || imageSize.height === 0 || !quad) return;
    triggerCropHaptic(15);
    pushHistory(quad);

    const imgW = imageSize.width;
    const imgH = imageSize.height;
    let targetW = imgW * 0.90;
    let targetH = targetW / ratio;
    if (targetH > imgH * 0.90) {
      targetH = imgH * 0.90;
      targetW = targetH * ratio;
    }

    const x0 = Math.round((imgW - targetW) / 2);
    const y0 = Math.round((imgH - targetH) / 2);
    const x1 = Math.round(x0 + targetW);
    const y1 = Math.round(y0 + targetH);

    setQuad({
      topLeft: { x: x0, y: y0 },
      topRight: { x: x1, y: y0 },
      bottomRight: { x: x1, y: y1 },
      bottomLeft: { x: x0, y: y1 },
    });
  };

  const handleImageLoad = () => {
    if (!imageRef.current) return;
    const { naturalWidth, naturalHeight } = imageRef.current;
    setImageSize({ width: naturalWidth, height: naturalHeight });
    syncImageRect();

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      if (initialQuad && isQuadConvex(initialQuad)) {
        setQuad(initialQuad);
      } else {
        setQuad(getFullFrameQuad(naturalWidth, naturalHeight, 0.005));
      }
    }
  };

  const handleAutoDetect = () => {
    if (!imageRef.current || !quad) return;
    triggerCropHaptic(15);
    pushHistory(quad);
    setQuad(detectDocumentCorners(imageRef.current));
  };

  const handleSelectFullImage = () => {
    if (imageSize.width === 0 || imageSize.height === 0 || !quad) return;
    triggerCropHaptic(15);
    pushHistory(quad);
    setQuad({
      topLeft: { x: 0, y: 0 },
      topRight: { x: imageSize.width, y: 0 },
      bottomRight: { x: imageSize.width, y: imageSize.height },
      bottomLeft: { x: 0, y: imageSize.height },
    });
  };

  const handleResetQuad = () => {
    if (!quad) return;
    triggerCropHaptic(15);
    pushHistory(quad);
    setQuad(getDefaultQuad(imageSize.width, imageSize.height));
  };

  const clientToImageCoords = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!imageRef.current || imageSize.width <= 0 || imageSize.height <= 0) return { x: 0, y: 0 };
      const rect = imageBoundsRef.current ?? imageRef.current.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
      const scaleX = imageSize.width / rect.width;
      const scaleY = imageSize.height / rect.height;
      return {
        x: Math.max(0, Math.min(imageSize.width, (clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(imageSize.height, (clientY - rect.top) * scaleY)),
      };
    },
    [imageSize]
  );

  const imageToClientCoords = useCallback(
    (point: Point): Point => {
      if (!imageRect || imageSize.width <= 0 || imageSize.height <= 0 || imageRect.width <= 0 || imageRect.height <= 0) {
        return { x: 0, y: 0 };
      }
      const scaleX = imageRect.width / imageSize.width;
      const scaleY = imageRect.height / imageSize.height;
      return {
        x: imageRect.left + point.x * scaleX,
        y: imageRect.top + point.y * scaleY,
      };
    },
    [imageRect, imageSize]
  );

  const handleCornerPointerDown = (corner: CornerKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pushHistory(quad);
    imageBoundsRef.current = imageRef.current?.getBoundingClientRect() ?? null;
    try { containerRef.current?.setPointerCapture(e.pointerId); } catch {}
    setActiveCorner(corner);
    setActiveEdge(null);
    setPointerPos({ x: e.clientX, y: e.clientY });
    triggerCropHaptic(15);
  };

  const handleEdgePointerDown = (edge: EdgeKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!quad) return;
    pushHistory(quad);
    imageBoundsRef.current = imageRef.current?.getBoundingClientRect() ?? null;
    try { containerRef.current?.setPointerCapture(e.pointerId); } catch {}
    setActiveEdge(edge);
    setActiveCorner(null);
    setEdgeDragStart({ client: { x: e.clientX, y: e.clientY }, quad: { ...quad } });
    setPointerPos({ x: e.clientX, y: e.clientY });
    triggerCropHaptic(15);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!quad) return;

    if (activeCorner) {
      e.preventDefault();
      setPointerPos({ x: e.clientX, y: e.clientY });
      const imgCoord = clientToImageCoords(e.clientX, e.clientY);
      const rect = imageBoundsRef.current ?? imageRef.current?.getBoundingClientRect();
      const scaleX = rect && rect.width > 0 ? imageSize.width / rect.width : 1;
      const scaleY = rect && rect.height > 0 ? imageSize.height / rect.height : 1;
      const snapX = 16 * scaleX;
      const snapY = 16 * scaleY;

      if (Math.abs(imgCoord.x) < snapX) {
        imgCoord.x = 0;
        triggerCropHaptic(8);
      } else if (Math.abs(imgCoord.x - imageSize.width) < snapX) {
        imgCoord.x = imageSize.width;
        triggerCropHaptic(8);
      }

      if (Math.abs(imgCoord.y) < snapY) {
        imgCoord.y = 0;
        triggerCropHaptic(8);
      } else if (Math.abs(imgCoord.y - imageSize.height) < snapY) {
        imgCoord.y = imageSize.height;
        triggerCropHaptic(8);
      }

      const minGapX = Math.max(24, Math.round(imageSize.width * 0.07));
      const minGapY = Math.max(24, Math.round(imageSize.height * 0.07));

      setQuad((prev) => {
        if (!prev) return prev;
        const nextCoord = { ...imgCoord };
        if (activeCorner === 'topLeft') {
          nextCoord.x = Math.max(0, Math.min(nextCoord.x, prev.topRight.x - minGapX));
          nextCoord.y = Math.max(0, Math.min(nextCoord.y, prev.bottomLeft.y - minGapY));
        } else if (activeCorner === 'topRight') {
          nextCoord.x = Math.min(imageSize.width, Math.max(nextCoord.x, prev.topLeft.x + minGapX));
          nextCoord.y = Math.max(0, Math.min(nextCoord.y, prev.bottomRight.y - minGapY));
        } else if (activeCorner === 'bottomRight') {
          nextCoord.x = Math.min(imageSize.width, Math.max(nextCoord.x, prev.bottomLeft.x + minGapX));
          nextCoord.y = Math.min(imageSize.height, Math.max(nextCoord.y, prev.topRight.y + minGapY));
        } else if (activeCorner === 'bottomLeft') {
          nextCoord.x = Math.max(0, Math.min(nextCoord.x, prev.bottomRight.x - minGapX));
          nextCoord.y = Math.min(imageSize.height, Math.max(nextCoord.y, prev.topLeft.y + minGapY));
        }
        return { ...prev, [activeCorner]: nextCoord };
      });
      return;
    }

    if (activeEdge && edgeDragStart && imageRef.current) {
      e.preventDefault();
      setPointerPos({ x: e.clientX, y: e.clientY });
      const rect = imageBoundsRef.current ?? imageRef.current.getBoundingClientRect();
      const scaleX = imageSize.width / rect.width;
      const scaleY = imageSize.height / rect.height;
      const dx = (e.clientX - edgeDragStart.client.x) * scaleX;
      const dy = (e.clientY - edgeDragStart.client.y) * scaleY;
      const orig = edgeDragStart.quad;
      const clampPt = (pt: Point, deltaX: number, deltaY: number): Point => ({
        x: Math.max(0, Math.min(imageSize.width, Math.round(pt.x + deltaX))),
        y: Math.max(0, Math.min(imageSize.height, Math.round(pt.y + deltaY))),
      });

      setQuad((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (activeEdge === 'top') {
          next.topLeft = clampPt(orig.topLeft, dx, dy);
          next.topRight = clampPt(orig.topRight, dx, dy);
        } else if (activeEdge === 'right') {
          next.topRight = clampPt(orig.topRight, dx, dy);
          next.bottomRight = clampPt(orig.bottomRight, dx, dy);
        } else if (activeEdge === 'bottom') {
          next.bottomLeft = clampPt(orig.bottomLeft, dx, dy);
          next.bottomRight = clampPt(orig.bottomRight, dx, dy);
        } else if (activeEdge === 'left') {
          next.topLeft = clampPt(orig.topLeft, dx, dy);
          next.bottomLeft = clampPt(orig.bottomLeft, dx, dy);
        }
        return next;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeCorner || activeEdge) {
      try { containerRef.current?.releasePointerCapture(e.pointerId); } catch {}
      imageBoundsRef.current = null;
      setActiveCorner(null);
      setActiveEdge(null);
      setEdgeDragStart(null);
      setPointerPos(null);
      triggerCropHaptic(10);
    }
  };

  const rotateImageAndQuad = (clockwise: boolean) => {
    triggerCropHaptic(15);
    if (!imageRef.current || imageSize.width === 0 || imageSize.height === 0) return;

    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = imageSize.height;
    rotCanvas.height = imageSize.width;
    const ctx = rotCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
    ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    ctx.rotate(((clockwise ? 90 : -90) * Math.PI) / 180);
    ctx.drawImage(imageRef.current, -imageSize.width / 2, -imageSize.height / 2);

    const rotatedDataUrl = rotCanvas.toDataURL('image/jpeg', 0.95);
    const oldW = imageSize.width;
    const oldH = imageSize.height;
    const rotPt = (p: Point): Point =>
      clockwise
        ? { x: Math.round(oldH - p.y), y: Math.round(p.x) }
        : { x: Math.round(p.y), y: Math.round(oldW - p.x) };

    if (quad) {
      setQuad(
        clockwise
          ? {
              topLeft: rotPt(quad.bottomLeft),
              topRight: rotPt(quad.topLeft),
              bottomRight: rotPt(quad.topRight),
              bottomLeft: rotPt(quad.bottomRight),
            }
          : {
              topLeft: rotPt(quad.topRight),
              topRight: rotPt(quad.bottomRight),
              bottomRight: rotPt(quad.bottomLeft),
              bottomLeft: rotPt(quad.topLeft),
            }
      );
    }

    setImageSize({ width: imageSize.height, height: imageSize.width });
    setCurrentSrc(rotatedDataUrl);
  };

  const handleApply = async () => {
    if (!imageRef.current || !quad || isApplying) return;
    setIsApplying(true);
    triggerCropHaptic(20);
    try {
      const warped = await warpPerspectiveAsync(imageRef.current, quad);
      onConfirm(warped, quad);
    } finally {
      setIsApplying(false);
    }
  };

  return {
    containerRef,
    imageRef,
    currentSrc,
    quad,
    activeCorner,
    activeEdge,
    pointerPos,
    imageSize,
    isApplying,
    undoStack,
    redoStack,
    handleUndo,
    handleRedo,
    applyAspectRatio,
    handleImageLoad,
    handleAutoDetect,
    handleSelectFullImage,
    handleResetQuad,
    imageToClientCoords,
    handleCornerPointerDown,
    handleEdgePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleRotateCw: () => rotateImageAndQuad(true),
    handleRotateCcw: () => rotateImageAndQuad(false),
    handleApply,
  };
}
