import React from 'react';
import type { Point, Quad } from '../core/types';
import { isQuadConvex } from '../core/geometry';
import { Check, RotateCcw, X, Wand2, RotateCw, Maximize2, Undo2, Redo2, FileText, CreditCard, Receipt } from 'lucide-react';
import { useCropInteraction, type CornerKey, type EdgeKey } from './useCropInteraction';

interface CropViewProps {
  imageSrc: string;
  initialQuad?: Quad;
  onConfirm: (warpedCanvas: HTMLCanvasElement, quad: Quad) => void;
  onCancel: () => void;
}

export const CropView: React.FC<CropViewProps> = ({ imageSrc, initialQuad, onConfirm, onCancel }) => {
  const {
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
    handleRotateCw,
    handleRotateCcw,
    handleApply,
  } = useCropInteraction({ imageSrc, initialQuad, onConfirm });

  const renderPolyPoints = () => {
    if (!quad) return '';
    const tl = imageToClientCoords(quad.topLeft);
    const tr = imageToClientCoords(quad.topRight);
    const br = imageToClientCoords(quad.bottomRight);
    const bl = imageToClientCoords(quad.bottomLeft);
    return `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
  };

  // Loupe target coordinates
  let loupeTargetPt: Point | null = null;
  if (quad) {
    if (activeCorner) {
      loupeTargetPt = quad[activeCorner];
    } else if (activeEdge) {
      if (activeEdge === 'top') {
        loupeTargetPt = { x: (quad.topLeft.x + quad.topRight.x) / 2, y: (quad.topLeft.y + quad.topRight.y) / 2 };
      } else if (activeEdge === 'right') {
        loupeTargetPt = { x: (quad.topRight.x + quad.bottomRight.x) / 2, y: (quad.topRight.y + quad.bottomRight.y) / 2 };
      } else if (activeEdge === 'bottom') {
        loupeTargetPt = { x: (quad.bottomLeft.x + quad.bottomRight.x) / 2, y: (quad.bottomLeft.y + quad.bottomRight.y) / 2 };
      } else if (activeEdge === 'left') {
        loupeTargetPt = { x: (quad.topLeft.x + quad.bottomLeft.x) / 2, y: (quad.topLeft.y + quad.bottomLeft.y) / 2 };
      }
    }
  }

  const edgeMidpoints = quad
    ? {
        top: {
          x: (imageToClientCoords(quad.topLeft).x + imageToClientCoords(quad.topRight).x) / 2,
          y: (imageToClientCoords(quad.topLeft).y + imageToClientCoords(quad.topRight).y) / 2,
        },
        right: {
          x: (imageToClientCoords(quad.topRight).x + imageToClientCoords(quad.bottomRight).x) / 2,
          y: (imageToClientCoords(quad.topRight).y + imageToClientCoords(quad.bottomRight).y) / 2,
        },
        bottom: {
          x: (imageToClientCoords(quad.bottomLeft).x + imageToClientCoords(quad.bottomRight).x) / 2,
          y: (imageToClientCoords(quad.bottomLeft).y + imageToClientCoords(quad.bottomRight).y) / 2,
        },
        left: {
          x: (imageToClientCoords(quad.topLeft).x + imageToClientCoords(quad.bottomLeft).x) / 2,
          y: (imageToClientCoords(quad.topLeft).y + imageToClientCoords(quad.bottomLeft).y) / 2,
        },
      }
    : null;

  const isValidQuad = quad ? isQuadConvex(quad) : false;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none font-sans touch-none"
    >
      {/* Top Action Bar with Safe Area Inset */}
      <div
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)',
        }}
        className="relative z-30 flex items-center justify-between px-4 pb-3 otium-chrome border-b border-white/[0.08]"
      >
        <button
          onClick={onCancel}
          className="fluid-press flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-button text-gray-300 active:text-white cursor-pointer"
          title="إلغاء / Cancel"
        >
          <X className="w-4 h-4" />
          <span className="text-xs">إلغاء</span>
        </button>

        <span className="text-xs font-bold text-white font-arabic">
          تحديد أبعاد المستند
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="fluid-press p-2 rounded-full glass-button text-gray-300 disabled:opacity-30 hover:text-white cursor-pointer"
            title="تراجع / Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-2 rounded-full glass-button text-gray-300 disabled:opacity-30 hover:text-white active:scale-90"
            title="إعادة / Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSelectFullImage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full glass-button text-accent active:scale-95 text-[11px] font-bold"
            title="تحديد كامل الصورة / Full Image"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>الكل</span>
          </button>
          <button
            onClick={handleAutoDetect}
            className="p-2 rounded-full glass-button text-accent active:scale-90"
            title="كشف ذكي / Auto Detect"
          >
            <Wand2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotateCcw}
            className="p-2 rounded-full glass-button text-gray-300 active:scale-90"
            title="تدوير يساراً 90° / Rotate Left"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotateCw}
            className="p-2 rounded-full glass-button text-gray-300 active:scale-90"
            title="تدوير يميناً 90° / Rotate Right"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetQuad}
            className="p-2 rounded-full glass-button text-gray-300 active:text-accent"
            title="إعادة ضبط كامل الإطار / Reset"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center p-3 overflow-hidden">
        <img
          ref={imageRef}
          src={currentSrc}
          alt="Scan target"
          onLoad={handleImageLoad}
          className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-2xl pointer-events-none"
        />

        {/* SVG Quad Overlay with Theme Accent */}
        {quad && (
          <svg className="fixed inset-0 w-full h-full pointer-events-none z-20">
            <polygon
              points={renderPolyPoints()}
              fill={isValidQuad ? "color-mix(in srgb, var(--accent, #38bdf8) 18%, transparent)" : "rgba(239, 68, 68, 0.22)"}
              stroke={isValidQuad ? "var(--accent, #38bdf8)" : "#EF4444"}
              strokeWidth="2.5"
              strokeDasharray="6 4"
            />
          </svg>
        )}

        {/* 4 Corner Handles with Theme Accent */}
        {quad &&
          (['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as CornerKey[]).map((corner) => {
            const clientPt = imageToClientCoords(quad[corner]);
            const isTargeted = activeCorner === corner;
            return (
              <div
                key={corner}
                onPointerDown={(e) => handleCornerPointerDown(corner, e)}
                style={{
                  transform: `translate3d(${clientPt.x}px, ${clientPt.y}px, 0px) translate(-50%, -50%)`,
                }}
                className={`fixed z-30 w-12 h-12 flex items-center justify-center cursor-pointer touch-none transition-transform ${
                  isTargeted ? 'scale-125' : 'active:scale-125'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full ${
                    isValidQuad ? 'bg-accent ring-accent/30' : 'bg-red-500 ring-red-500/30'
                  } border-2 border-white shadow-xl flex items-center justify-center ring-4`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-black" />
                </div>
              </div>
            );
          })}

        {/* 4 Edge Midpoint Handles with Theme Accent */}
        {edgeMidpoints &&
          (['top', 'right', 'bottom', 'left'] as EdgeKey[]).map((edge) => {
            const pt = edgeMidpoints[edge];
            const isTargeted = activeEdge === edge;
            return (
              <div
                key={edge}
                onPointerDown={(e) => handleEdgePointerDown(edge, e)}
                style={{
                  transform: `translate3d(${pt.x}px, ${pt.y}px, 0px) translate(-50%, -50%)`,
                }}
                className={`fixed z-30 w-10 h-10 flex items-center justify-center cursor-pointer touch-none transition-transform ${
                  isTargeted ? 'scale-125' : 'active:scale-115'
                }`}
                title={`Drag ${edge} edge`}
              >
                <div className="w-6 h-2.5 rounded-full bg-accent border border-white/90 shadow-md flex items-center justify-center">
                  <div className="w-2 h-0.5 bg-black/80 rounded-full" />
                </div>
              </div>
            );
          })}

        {/* Precision Magnifier Loupe with Bespoke Optics */}
        {pointerPos && loupeTargetPt && (
          <div
            style={{
              left: `${Math.max(74, Math.min(window.innerWidth - 74, pointerPos.x))}px`,
              top: `${Math.max(74, Math.min(window.innerHeight - 74, pointerPos.y < 185 ? pointerPos.y + 125 : pointerPos.y - 125))}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className="fixed z-50 w-32 h-32 rounded-full border-2 border-white/90 overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.2)] bg-black pointer-events-none ring-4 ring-black/75 animate-in fade-in zoom-in-95 duration-100"
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundImage: `url(${currentSrc})`,
                backgroundSize: `${imageSize.width * 2.5}px ${imageSize.height * 2.5}px`,
                backgroundPosition: `-${loupeTargetPt.x * 2.5 - 64}px -${loupeTargetPt.y * 2.5 - 64}px`,
                backgroundRepeat: 'no-repeat',
              }}
            />
            {/* Glass Specular Glare */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/35 pointer-events-none" />

            {/* Precision Micro Crosshairs */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-[1px] bg-accent/90 shadow-[0_0_4px_rgba(56,189,248,0.8)]" />
              <div className="absolute h-full w-[1px] bg-accent/90 shadow-[0_0_4px_rgba(56,189,248,0.8)]" />
              <div className="absolute w-3.5 h-3.5 rounded-full border border-white/90 bg-accent/30 ring-1 ring-accent/60" />
            </div>

            {/* Magnification Badge */}
            <div className="absolute top-1.5 inset-x-0 flex justify-center pointer-events-none">
              <span className="px-1.5 py-0.2 rounded-full bg-black/70 backdrop-blur-md text-[9px] font-mono font-bold text-white/90 border border-white/20">
                2.5×
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Aspect Ratio Snapping Bar */}
      <div className="relative z-30 flex items-center justify-center gap-1.5 px-4 py-2 bg-black/75 backdrop-blur-md border-t border-white/[0.08]">
        <span className="text-[10px] text-gray-400 font-bold ml-1 font-arabic">المقاس:</span>
        <button
          onClick={() => applyAspectRatio(Math.SQRT1_2)}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-accent/20 text-gray-300 hover:text-accent text-[11px] font-bold border border-white/10 flex items-center gap-1 active:scale-95 transition-all"
          title="A4 Standard Document (1:√2)"
        >
          <FileText className="w-3 h-3 text-accent" />
          <span>A4 قياسي</span>
        </button>
        <button
          onClick={() => applyAspectRatio(0.55)}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-accent/20 text-gray-300 hover:text-accent text-[11px] font-bold border border-white/10 flex items-center gap-1 active:scale-95 transition-all"
          title="Receipt / Invoice"
        >
          <Receipt className="w-3 h-3 text-accent" />
          <span>فاتورة</span>
        </button>
        <button
          onClick={() => applyAspectRatio(1.586)}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-accent/20 text-gray-300 hover:text-accent text-[11px] font-bold border border-white/10 flex items-center gap-1 active:scale-95 transition-all"
          title="ID Card / Business Card"
        >
          <CreditCard className="w-3 h-3 text-accent" />
          <span>هوية / كرت</span>
        </button>
        <button
          onClick={handleResetQuad}
          className="px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 hover:text-white text-[11px] font-semibold border border-white/5 active:scale-95 transition-all"
          title="Free custom quad"
        >
          <span>حر</span>
        </button>
      </div>

      {/* Bottom Confirm Bar */}
      <div className="relative z-30 flex items-center justify-between px-5 pt-3 pb-8 glass-panel border-t-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectFullImage}
            className="px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-gray-200 text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5 text-accent" />
            <span>كامل الصورة</span>
          </button>
          <button
            onClick={handleAutoDetect}
            className="px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-gray-200 text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5 text-accent" />
            <span>كشف ذكي</span>
          </button>
        </div>

        <button
          onClick={handleApply}
          disabled={!isValidQuad || isApplying}
          className={`flex items-center gap-2 px-7 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-xl cursor-pointer ${
            isValidQuad && !isApplying
              ? 'bg-accent text-on-accent shadow-accent/25'
              : 'bg-red-500/20 text-red-300 border border-red-500/30 opacity-70 cursor-not-allowed'
          }`}
        >
          <Check className="w-5 h-5 stroke-[3]" />
          <span>{isValidQuad ? 'تطبيق القص' : 'زوايا متقاطعة'}</span>
        </button>
      </div>
    </div>
  );
};
