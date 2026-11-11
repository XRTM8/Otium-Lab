import React from 'react';
import {
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  QrCode,
  Square,
  Trash2,
} from 'lucide-react';
import type { ScannedPage } from '../core/types';
import type { DetectedBarcode } from '../core/barcode';
import { isSafeUrl } from '../core/nativeBridge';
import { copyTextToClipboard } from '../../core/utils/clipboard';
import type { SignaturePlacement } from '../core/enhancePdfCompile';

export interface EnhanceStageAndGridProps {
  isGridView: boolean;
  setIsGridView: (open: boolean) => void;
  pages: ScannedPage[];
  safeIndex: number;
  setCurrentPageIndex: (idx: number) => void;
  selectedPages: Set<number>;
  handleBulkDelete: () => void;
  handleTogglePageSelect: (idx: number) => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
  handleStageTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
  handleStageTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  handleStageTouchEnd: () => void;
  toastMsg: string;
  setToastMsg: (msg: string) => void;
  zoomScale: number;
  resetZoomAndPan: () => void;
  detectedBarcodes: DetectedBarcode[];
  stageContainerRef: React.RefObject<HTMLDivElement | null>;
  panOffset: { x: number; y: number };
  previewImageRef: React.RefObject<HTMLImageElement | null>;
  previewSource: string;
  isRedacting: boolean;
  redactionPointsRef: React.MutableRefObject<{ x: number; y: number }[]>;
  redactionLiveStrRef: React.MutableRefObject<string>;
  redactionSvgRectRef: React.MutableRefObject<DOMRect | null>;
  redactionPolylineRef: React.RefObject<SVGPolylineElement | null>;
  redactionStrokes: { x: number; y: number }[][];
  redactionDraftInit: string | null;
  setRedactionDraftInit: (draft: string | null) => void;
  setRedactionStrokes: React.Dispatch<React.SetStateAction<{ x: number; y: number }[][]>>;
  currentPage: ScannedPage;
  signatures: Record<string, SignaturePlacement>;
  setSignatures: React.Dispatch<React.SetStateAction<Record<string, SignaturePlacement>>>;
  pdfGenerating: boolean;
  ocrStatus: string;
  triggerHaptic: (duration?: number) => void;
}

export const EnhanceStageAndGrid: React.FC<EnhanceStageAndGridProps> = ({
  isGridView,
  setIsGridView,
  pages,
  safeIndex,
  setCurrentPageIndex,
  selectedPages,
  handleBulkDelete,
  handleTogglePageSelect,
  onMovePage,
  handleStageTouchStart,
  handleStageTouchMove,
  handleStageTouchEnd,
  toastMsg,
  setToastMsg,
  zoomScale,
  resetZoomAndPan,
  detectedBarcodes,
  stageContainerRef,
  panOffset,
  previewImageRef,
  previewSource,
  isRedacting,
  redactionPointsRef,
  redactionLiveStrRef,
  redactionSvgRectRef,
  redactionPolylineRef,
  redactionStrokes,
  redactionDraftInit,
  setRedactionDraftInit,
  setRedactionStrokes,
  currentPage,
  signatures,
  setSignatures,
  pdfGenerating,
  ocrStatus,
  triggerHaptic,
}) => {
  if (isGridView) {
    return (
      <div className="relative flex-1 w-full h-full flex flex-col p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs text-gray-400 font-semibold">
            {pages.length} Pages • {selectedPages.size} Selected
          </span>

          <div className="flex items-center gap-2">
            {selectedPages.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 rounded-xl bg-red-500/20 text-red-400 font-semibold text-xs border border-red-500/30 flex items-center gap-1 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedPages.size})</span>
              </button>
            )}

            <button
              onClick={() => setIsGridView(false)}
              className="px-3.5 py-1.5 rounded-xl bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/25 active:scale-95"
            >
              Done
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pb-8">
          {pages.map((p, idx) => {
            const isSelected = selectedPages.has(idx);
            const isCurrent = idx === safeIndex;
            return (
              <div
                key={p.id}
                onClick={() => {
                  setCurrentPageIndex(idx);
                  setIsGridView(false);
                }}
                className={`relative rounded-xl overflow-hidden border-2 bg-black/40 flex flex-col group cursor-pointer transition-all ${
                  isSelected
                    ? 'border-accent ring-2 ring-accent/40 shadow-lg'
                    : isCurrent
                      ? 'border-accent/70'
                      : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="aspect-[3/4] w-full relative">
                  <img src={p.thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePageSelect(idx);
                    }}
                    className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/70 text-white shadow"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-accent" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white font-bold">
                    #{idx + 1}
                  </span>
                </div>

                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-between p-1 bg-white/5 border-t border-white/5"
                >
                  <button
                    disabled={idx === 0}
                    onClick={() => onMovePage(idx, idx - 1)}
                    className="px-2 py-0.5 text-[10px] text-gray-300 disabled:opacity-20 hover:text-white"
                  >
                    ◀
                  </button>
                  <span className="text-[9px] text-gray-500 font-semibold">Move</span>
                  <button
                    disabled={idx === pages.length - 1}
                    onClick={() => onMovePage(idx, idx + 1)}
                    className="px-2 py-0.5 text-[10px] text-gray-300 disabled:opacity-20 hover:text-white"
                  >
                    ▶
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      onTouchStart={handleStageTouchStart}
      onTouchMove={handleStageTouchMove}
      onTouchEnd={handleStageTouchEnd}
      onTouchCancel={handleStageTouchEnd}
      className="relative flex-1 w-full h-full flex items-center justify-center p-4 overflow-hidden touch-none"
    >
      {zoomScale > 1.05 && (
        <div className="absolute top-2 inset-x-0 flex justify-center z-40 pointer-events-auto animate-in fade-in duration-150">
          <button
            onClick={() => {
              triggerHaptic(10);
              resetZoomAndPan();
            }}
            className="px-3.5 py-1 rounded-full bg-black/85 backdrop-blur-md border border-accent/50 text-accent text-xs font-bold shadow-2xl flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <span>{Math.round(zoomScale * 100)}%</span>
            <span className="text-[10px] text-gray-300 font-arabic font-normal">• انقر للعودة إلى 1x</span>
          </button>
        </div>
      )}

      {detectedBarcodes.length > 0 && zoomScale <= 1.05 && (
        <div className="absolute top-2 inset-x-6 z-30 flex items-center justify-between px-3.5 py-2 rounded-2xl bg-black/85 backdrop-blur-xl border border-accent/40 shadow-2xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <QrCode className="w-4 h-4 text-accent shrink-0" />
            <div className="flex flex-col overflow-hidden text-left">
              <span className="text-[10px] text-accent font-bold uppercase tracking-wider">
                {detectedBarcodes[0].format.replace('_', ' ')} Detected
              </span>
              <span className="text-xs text-white truncate max-w-[180px] font-mono">
                {detectedBarcodes[0].rawValue}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={async () => {
                triggerHaptic(15);
                await copyTextToClipboard(detectedBarcodes[0].rawValue);
                setToastMsg('Code copied to clipboard');
                setTimeout(() => setToastMsg(''), 2000);
              }}
              className="p-1.5 rounded-lg glass-button text-gray-300 hover:text-white"
              title="Copy code"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            {isSafeUrl(detectedBarcodes[0].rawValue) && (
              <a
                href={detectedBarcodes[0].rawValue}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg glass-button text-accent hover:text-white"
                title="Open link"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="absolute top-4 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in duration-200">
          <span className="px-4 py-1.5 rounded-full bg-accent text-on-accent font-semibold text-xs shadow-2xl flex items-center gap-1.5 border border-white/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{toastMsg}</span>
          </span>
        </div>
      )}

      <div
        ref={stageContainerRef}
        style={{
          transform: `translateX(0px) translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
          transition: zoomScale > 1.05 ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="relative w-full h-full max-h-[64vh] flex items-center justify-center select-none will-change-transform"
      >
        <img
          ref={previewImageRef}
          src={previewSource}
          alt={`Page ${safeIndex + 1}`}
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10 pointer-events-none"
        />

        {isRedacting && (
          <svg
            onPointerDown={(e) => {
              e.preventDefault();
              try {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              } catch {}
              const rect = e.currentTarget.getBoundingClientRect();
              redactionSvgRectRef.current = rect;
              const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
              const initStr = `${pt.x},${pt.y} ${pt.x},${pt.y}`;
              redactionPointsRef.current = [pt];
              redactionLiveStrRef.current = initStr;
              setRedactionDraftInit(initStr);
            }}
            onPointerMove={(e) => {
              if (redactionPointsRef.current.length === 0) return;
              const cached = redactionSvgRectRef.current;
              const rect =
                cached && cached.width > 0 && cached.height > 0 ? cached : e.currentTarget.getBoundingClientRect();
              const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
              redactionPointsRef.current.push(pt);
              redactionLiveStrRef.current += ` ${pt.x},${pt.y}`;
              redactionPolylineRef.current?.setAttribute('points', redactionLiveStrRef.current);
            }}
            onPointerUp={(e) => {
              try {
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
              } catch {}
              const pts = redactionPointsRef.current;
              redactionPointsRef.current = [];
              redactionLiveStrRef.current = '';
              redactionSvgRectRef.current = null;
              setRedactionDraftInit(null);
              if (pts.length > 0) {
                setRedactionStrokes((prev) => [...prev, pts]);
              }
            }}
            onPointerCancel={() => {
              redactionPointsRef.current = [];
              redactionLiveStrRef.current = '';
              redactionSvgRectRef.current = null;
              setRedactionDraftInit(null);
            }}
            className="absolute inset-0 w-full h-full z-30 touch-none cursor-crosshair bg-black/5"
          >
            {redactionStrokes.map((stroke, i) => (
              <polyline
                key={i}
                points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#000000"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {redactionDraftInit !== null && (
              <polyline
                ref={redactionPolylineRef}
                points={redactionDraftInit}
                fill="none"
                stroke="#000000"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        )}

        {!isRedacting && redactionStrokes.length > 0 && (
          <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none">
            {redactionStrokes.map((stroke, i) => (
              <polyline
                key={i}
                points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#000000"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )}

        {currentPage && signatures[currentPage.id] && (
          <div
            style={{
              left: `${signatures[currentPage.id].x * 100}%`,
              top: `${signatures[currentPage.id].y * 100}%`,
            }}
            className="absolute z-20 w-32 -translate-x-1/2 -translate-y-1/2 p-1.5 border-2 border-dashed border-accent bg-accent/10 rounded-xl shadow-2xl flex items-center justify-center group"
          >
            <img
              src={signatures[currentPage.id].dataUrl}
              alt="Signature"
              className="w-full h-auto object-contain pointer-events-none"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic(10);
                setSignatures((prev) => {
                  const next = { ...prev };
                  delete next[currentPage.id];
                  return next;
                });
              }}
              className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-md active:scale-90"
              title="Remove signature"
            >
              ✕
            </button>
          </div>
        )}

        {pdfGenerating && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold text-white">{ocrStatus || 'Compiling Optimized PDF...'}</p>
          </div>
        )}
      </div>

      {safeIndex > 0 && (
        <button
          onClick={() => {
            triggerHaptic(10);
            setCurrentPageIndex(safeIndex - 1);
          }}
          className="absolute left-3 p-2.5 rounded-full glass-button text-white active:scale-90 shadow-xl z-20"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {safeIndex < pages.length - 1 && (
        <button
          onClick={() => {
            triggerHaptic(10);
            setCurrentPageIndex(safeIndex + 1);
          }}
          className="absolute right-3 p-2.5 rounded-full glass-button text-white active:scale-90 shadow-xl z-20"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
