import React, { useEffect, useState, useRef } from 'react';
import type { FilterType, ScannedPage } from '../core/types';
import type { PdfCompressionPreset, PdfPageFormat, PdfWatermarkStyle } from '../core/pdf';
import { loadPageCanvasFromDisk } from '../core/storage/pageStore';
import { dewarpBookCurvatureAsync } from '../core/geometry';
import { terminateOcrWorker } from '../core/ocr/ocrEngine';
import { detectBarcodesFromCanvas, type DetectedBarcode } from '../core/barcode';
import type { SignaturePlacement } from '../core/enhancePdfCompile';
import { EnhanceStageAndGrid } from './EnhanceStageAndGrid';
import { EnhanceBottomDock } from './EnhanceBottomDock';
import { EnhanceModals } from './EnhanceModals';
import { useEnhanceGestures } from './useEnhanceGestures';
import { useEnhanceExportAndActions } from './useEnhanceExportAndActions';
import { ArrowLeft, Trash2, Edit3, PenTool, LayoutGrid, Stamp, EyeOff, Undo2 } from 'lucide-react';

interface EnhanceViewProps {
  pages: ScannedPage[];
  onBackToCamera: () => void;
  onAddMorePages: () => void;
  onDeletePage: (index: number) => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
  onRetakePage: (index: number) => void;
  onRotatePage: (index: number) => Promise<void>;
  onEditCrop?: (index: number) => void;
  onDuplicatePage?: (index: number) => void;
  onUpdatePageThumbnail?: (pageId: string, thumbnailDataUrl: string) => void;
  onResetAll: () => void;
  onOpenPdfInReader?: (file: File) => void;
}

export const EnhanceView: React.FC<EnhanceViewProps> = ({
  pages,
  onBackToCamera,
  onAddMorePages,
  onDeletePage,
  onMovePage,
  onRetakePage,
  onRotatePage,
  onEditCrop,
  onDuplicatePage,
  onUpdatePageThumbnail,
  onResetAll,
  onOpenPdfInReader,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [showDeletePageModal, setShowDeletePageModal] = useState<boolean>(false);
  const [showMoreActions, setShowMoreActions] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  const [curvature, setCurvature] = useState<number>(0);
  const [spinePos, setSpinePos] = useState<number>(0.5);
  const [enableOcr, setEnableOcr] = useState<boolean>(false);
  const [compressionPreset, setCompressionPreset] = useState<PdfCompressionPreset>('balanced');
  const [pageFormat, setPageFormat] = useState<PdfPageFormat>('a4');
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [signatures, setSignatures] = useState<Record<string, SignaturePlacement>>({});
  const [isGridView, setIsGridView] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [watermarkText, setWatermarkText] = useState<string>('');
  const [watermarkStyle, setWatermarkStyle] = useState<PdfWatermarkStyle>('diagonal');
  const [isWatermarkOpen, setIsWatermarkOpen] = useState(false);
  const [isAdvancedOptionsOpen, setIsAdvancedOptionsOpen] = useState(false);
  const pageScopeKey =
    pages[Math.min(currentPageIndex, Math.max(0, pages.length - 1))]?.id ??
    String(Math.min(currentPageIndex, Math.max(0, pages.length - 1)));
  const [redactionState, setRedactionState] = useState<{
    key: string;
    active: boolean;
    strokes: { x: number; y: number }[][];
    draftInit: string | null;
  }>({ key: pageScopeKey, active: false, strokes: [], draftInit: null });
  const isRedacting = redactionState.key === pageScopeKey ? redactionState.active : false;
  const redactionStrokes = redactionState.key === pageScopeKey ? redactionState.strokes : [];
  const redactionDraftInit = redactionState.key === pageScopeKey ? redactionState.draftInit : null;

  const updateRedaction = (updater: (base: { key: string; active: boolean; strokes: { x: number; y: number }[][]; draftInit: string | null }) => { key: string; active: boolean; strokes: { x: number; y: number }[][]; draftInit: string | null }) =>
    setRedactionState((prev) => updater(prev.key === pageScopeKey ? prev : { key: pageScopeKey, active: false, strokes: [], draftInit: null }));
  const setIsRedacting = (next: boolean | ((prev: boolean) => boolean)) =>
    updateRedaction((base) => ({ ...base, active: typeof next === 'function' ? next(base.active) : next }));
  const setRedactionStrokes = (next: { x: number; y: number }[][] | ((prev: { x: number; y: number }[][]) => { x: number; y: number }[][])) =>
    updateRedaction((base) => ({ ...base, strokes: typeof next === 'function' ? next(base.strokes) : next }));
  const setRedactionDraftInit = (draftInit: string | null) =>
    updateRedaction((base) => ({ ...base, draftInit }));

  const redactionPointsRef = useRef<{ x: number; y: number }[]>([]);
  const redactionLiveStrRef = useRef<string>('');
  const redactionSvgRectRef = useRef<DOMRect | null>(null);
  const redactionPolylineRef = useRef<SVGPolylineElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const [toastMsg, setToastMsg] = useState<string>('');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [previewState, setPreviewState] = useState<{ key: string; url: string }>({ key: pageScopeKey, url: '' });
  const fullResPreviewUrl = previewState.key === pageScopeKey ? previewState.url : '';
  const setFullResPreviewUrl = (url: string) => setPreviewState({ key: pageScopeKey, url });
  const [detectedBarcodes, setDetectedBarcodes] = useState<DetectedBarcode[]>([]);
  const [docTitle, setDocTitle] = useState<string>(() => {
    const d = new Date();
    return `Otium_Doc_${d.toISOString().slice(0, 10)}_${d.toTimeString().slice(0, 5).replace(':', '-')}`;
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [suggestedDocTitle, setSuggestedDocTitle] = useState<string>('');

  const safeIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[safeIndex];

  const triggerHaptic = (duration = 15) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {}
    }
  };

  const {
    stageContainerRef,
    zoomScale,
    panOffset,
    resetZoomAndPan,
    handleStageTouchStart,
    handleStageTouchMove,
    handleStageTouchEnd,
  } = useEnhanceGestures({
    pageScopeKey,
    pageCount: pages.length,
    safeIndex,
    isRedacting,
    onChangePage: setCurrentPageIndex,
    onHaptic: triggerHaptic,
  });

  useEffect(() => {
    redactionPointsRef.current = [];
    redactionLiveStrRef.current = '';
    redactionSvgRectRef.current = null;
  }, [pageScopeKey]);

  useEffect(() => {
    return () => {
      if (fullResPreviewUrl && fullResPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(fullResPreviewUrl);
    };
  }, [fullResPreviewUrl]);

  useEffect(() => () => { terminateOcrWorker().catch(() => {}); }, []);

  useEffect(() => {
    let active = true;
    if (!currentPage) return;
    loadPageCanvasFromDisk(currentPage.id)
      .then(async (canvas) => {
        if (!active) return;
        const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(canvas, curvature, spinePos) : canvas;
        if (!active) return;
        setPreviewState({ key: pageScopeKey, url: finalCanvas.toDataURL('image/jpeg', 0.9) });
        detectBarcodesFromCanvas(finalCanvas).then((codes) => {
          if (active) setDetectedBarcodes(codes);
        });
      })
      .catch(() => {
        if (active) {
          setPreviewState({ key: pageScopeKey, url: currentPage.thumbnailDataUrl });
          setDetectedBarcodes([]);
        }
      });
    return () => { active = false; };
  }, [currentPage, curvature, spinePos, pageScopeKey]);

  const actions = useEnhanceExportAndActions({
    pages,
    currentPage,
    safeIndex,
    activeFilter,
    setActiveFilter,
    curvature,
    spinePos,
    signatures,
    enableOcr,
    compressionPreset,
    pageFormat,
    watermarkText,
    watermarkStyle,
    docTitle,
    selectedPages,
    setSelectedPages,
    redactionStrokes,
    setRedactionStrokes,
    setIsRedacting,
    setRedactionDraftInit,
    redactionPointsRef,
    redactionLiveStrRef,
    redactionSvgRectRef,
    previewImageRef,
    isExtractingText,
    setIsExtractingText,
    setExtractedText,
    setSuggestedDocTitle,
    setIsOcrModalOpen,
    setFullResPreviewUrl,
    setToastMsg,
    setPdfGenerating,
    setOcrStatus,
    onRotatePage,
    onDeletePage,
    onUpdatePageThumbnail,
    onOpenPdfInReader,
    triggerHaptic,
  });

  if (!currentPage) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center p-6 text-center">
        <p className="text-gray-400 text-sm">No scanned pages available</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none">
      <div
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)' }}
        className="relative z-20 flex items-center justify-between px-3 pb-3 otium-chrome border-b border-white/[0.08]"
      >
        <div className="flex items-center gap-1.5">
          <button onClick={onBackToCamera} className="p-2 rounded-full glass-button text-gray-300 active:text-white" title="رجوع للكاميرا">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCancelModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 active:scale-95 transition-all text-[11px] font-bold" title="إلغاء كافة الصور والعودة للرئيسية">
            <Trash2 className="w-3.5 h-3.5" />
            <span className="font-arabic">إلغاء الكل</span>
          </button>
        </div>

        <div className="flex flex-col items-center max-w-[40%]">
          {isEditingTitle ? (
            <input
              type="text"
              value={docTitle}
              autoFocus
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingTitle(false); }}
              onChange={(e) => setDocTitle(e.target.value)}
              className="text-xs bg-white/10 text-white px-2 py-0.5 rounded-lg border border-accent focus:outline-none text-center max-w-full font-bold"
            />
          ) : (
            <button onClick={() => setIsEditingTitle(true)} className="flex items-center gap-1 text-xs sm:text-sm font-bold text-white truncate max-w-full hover:text-accent font-arabic" title="تعديل اسم المستند">
              <span className="truncate"><bdi>{docTitle}</bdi></span>
              <Edit3 className="w-3 h-3 text-accent opacity-80 shrink-0" />
            </button>
          )}
          <span className="text-[10px] text-accent font-bold font-arabic mt-0.5">صفحة {safeIndex + 1} من {pages.length}</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => setShowDeletePageModal(true)} className="p-1.5 rounded-full glass-button text-gray-300 hover:text-rose-400 active:scale-95 transition-colors" title="حذف هذه الصفحة">
            <Trash2 className="w-4 h-4 text-rose-400" />
          </button>
          <button onClick={() => { triggerHaptic(15); setIsRedacting(!isRedacting); }} className={`p-1.5 rounded-full glass-button transition-colors ${isRedacting ? 'text-accent border-accent/50 bg-accent/20' : 'text-gray-300 active:text-accent'}`} title="حجب نصوص حساسة">
            <EyeOff className="w-4 h-4" />
          </button>
          <button onClick={() => { triggerHaptic(15); setIsGridView(!isGridView); }} className={`p-1.5 rounded-full glass-button transition-colors ${isGridView ? 'text-accent border-accent/50 bg-accent/10' : 'text-gray-300 active:text-accent'}`} title="عرض شبكي">
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => { triggerHaptic(15); setIsWatermarkOpen(true); }} className={`p-1.5 rounded-full glass-button transition-colors ${watermarkText ? 'text-accent border-accent/50 bg-accent/10' : 'text-gray-300 active:text-accent'}`} title="علامة مائية">
            <Stamp className="w-4 h-4" />
          </button>
          <button onClick={() => { triggerHaptic(15); setIsSignatureOpen(true); }} className={`p-1.5 rounded-full glass-button transition-colors ${signatures[currentPage?.id ?? ''] ? 'text-accent border-accent/50' : 'text-gray-300 active:text-accent'}`} title="إضافة توقيع">
            <PenTool className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isRedacting && (
        <div className="relative z-30 px-6 py-2.5 bg-black/95 border-b border-accent/30 flex items-center justify-between text-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-accent font-semibold">
            <EyeOff className="w-4 h-4 shrink-0" />
            <span className="truncate">Drag finger over text to censor</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { triggerHaptic(10); setRedactionStrokes((prev) => prev.slice(0, -1)); }} disabled={redactionStrokes.length === 0} className="p-1.5 rounded-lg glass-button text-gray-300 disabled:opacity-30 hover:text-white" title="Undo last stroke">
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={() => { triggerHaptic(10); setIsRedacting(false); setRedactionStrokes([]); }} className="px-3 py-1 rounded-lg text-gray-400 hover:text-white text-xs">Cancel</button>
            <button onClick={actions.handleBurnRedaction} className="px-3.5 py-1 rounded-lg bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/25 active:scale-95">Apply</button>
          </div>
        </div>
      )}

      <EnhanceStageAndGrid
        isGridView={isGridView}
        setIsGridView={setIsGridView}
        pages={pages}
        safeIndex={safeIndex}
        setCurrentPageIndex={setCurrentPageIndex}
        selectedPages={selectedPages}
        handleBulkDelete={actions.handleBulkDelete}
        handleTogglePageSelect={actions.handleTogglePageSelect}
        onMovePage={onMovePage}
        handleStageTouchStart={handleStageTouchStart}
        handleStageTouchMove={handleStageTouchMove}
        handleStageTouchEnd={handleStageTouchEnd}
        toastMsg={toastMsg}
        setToastMsg={setToastMsg}
        zoomScale={zoomScale}
        resetZoomAndPan={resetZoomAndPan}
        detectedBarcodes={detectedBarcodes}
        stageContainerRef={stageContainerRef}
        panOffset={panOffset}
        previewImageRef={previewImageRef}
        previewSource={fullResPreviewUrl || currentPage.thumbnailDataUrl}
        isRedacting={isRedacting}
        redactionPointsRef={redactionPointsRef}
        redactionLiveStrRef={redactionLiveStrRef}
        redactionSvgRectRef={redactionSvgRectRef}
        redactionPolylineRef={redactionPolylineRef}
        redactionStrokes={redactionStrokes}
        redactionDraftInit={redactionDraftInit}
        setRedactionDraftInit={setRedactionDraftInit}
        setRedactionStrokes={setRedactionStrokes}
        currentPage={currentPage}
        signatures={signatures}
        setSignatures={setSignatures}
        pdfGenerating={pdfGenerating}
        ocrStatus={ocrStatus}
        triggerHaptic={triggerHaptic}
      />

      {!isGridView && (
        <EnhanceBottomDock
          safeIndex={safeIndex}
          pages={pages}
          activeFilter={activeFilter}
          isExtractingText={isExtractingText}
          compressionPreset={compressionPreset}
          pdfGenerating={pdfGenerating}
          onEditCrop={onEditCrop}
          onRotateCurrentPage={actions.handleRotateCurrentPage}
          onExtractTextFromPage={actions.handleExtractTextFromPage}
          onRetakePage={onRetakePage}
          onDuplicatePage={onDuplicatePage}
          onFilterSelect={actions.handleFilterSelect}
          onApplyFilterToAll={actions.handleApplyFilterToAll}
          onSelectPageIndex={setCurrentPageIndex}
          onAddMorePages={onAddMorePages}
          onOpenAdvancedOptions={() => { triggerHaptic(12); setIsAdvancedOptionsOpen(true); }}
          onOpenInOtium={actions.handleOpenInOtium}
          onSharePdf={actions.handleSharePdf}
          onDownloadJpg={actions.handleDownloadJpg}
          onOpenMoreActions={() => { triggerHaptic(10); setShowMoreActions(true); }}
          triggerHaptic={triggerHaptic}
        />
      )}

      <EnhanceModals
        pages={pages}
        safeIndex={safeIndex}
        currentPage={currentPage}
        showCancelModal={showCancelModal}
        setShowCancelModal={setShowCancelModal}
        showDeletePageModal={showDeletePageModal}
        setShowDeletePageModal={setShowDeletePageModal}
        showMoreActions={showMoreActions}
        setShowMoreActions={setShowMoreActions}
        isSignatureOpen={isSignatureOpen}
        setIsSignatureOpen={setIsSignatureOpen}
        isWatermarkOpen={isWatermarkOpen}
        setIsWatermarkOpen={setIsWatermarkOpen}
        isAdvancedOptionsOpen={isAdvancedOptionsOpen}
        setIsAdvancedOptionsOpen={setIsAdvancedOptionsOpen}
        isOcrModalOpen={isOcrModalOpen}
        setIsOcrModalOpen={setIsOcrModalOpen}
        watermarkText={watermarkText}
        setWatermarkText={setWatermarkText}
        watermarkStyle={watermarkStyle}
        setWatermarkStyle={setWatermarkStyle}
        compressionPreset={compressionPreset}
        setCompressionPreset={setCompressionPreset}
        pageFormat={pageFormat}
        setPageFormat={setPageFormat}
        enableOcr={enableOcr}
        setEnableOcr={setEnableOcr}
        curvature={curvature}
        setCurvature={setCurvature}
        spinePos={spinePos}
        setSpinePos={setSpinePos}
        suggestedDocTitle={suggestedDocTitle}
        extractedText={extractedText}
        setDocTitle={setDocTitle}
        setToastMsg={setToastMsg}
        setCurrentPageIndex={setCurrentPageIndex}
        setSignatures={setSignatures}
        onDeletePage={onDeletePage}
        onResetAll={onResetAll}
        onShareWhatsApp={actions.handleShareWhatsApp}
        onDownloadPdf={actions.handleDownloadPdf}
        onPrintPdf={actions.handlePrintPdf}
        triggerHaptic={triggerHaptic}
      />
    </div>
  );
};
