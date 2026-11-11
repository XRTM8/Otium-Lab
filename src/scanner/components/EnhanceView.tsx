import React, { useEffect, useState, useRef } from 'react';
import type { FilterType, ScannedPage } from '../core/types';
import type {
  PdfCompressionPreset,
  PdfPageFormat,
  PdfWatermarkStyle,
} from '../core/pdf';
import {
  loadPageCanvasFromDisk,
  updateStoredPageFilter,
} from '../core/storage/pageStore';
import { dewarpBookCurvatureAsync } from '../core/geometry';
import { terminateOcrWorker, extractPageTextAndMetadata } from '../core/ocr/ocrEngine';
import { detectBarcodesFromCanvas } from '../core/barcode';
import type { DetectedBarcode } from '../core/barcode';
import { nativeSharePdf, nativeSavePdf, nativeOpenInOtium, nativeSaveImage, nativePrintPdf } from '../core/nativeBridge';
import {
  burnRedactionOnPageCanvas,
  cacheCompiledPdfInLibrary,
  compileScannedPdfDocument,
  type SignaturePlacement,
} from '../core/enhancePdfCompile';
import { EnhanceStageAndGrid } from './EnhanceStageAndGrid';
import { EnhanceBottomDock } from './EnhanceBottomDock';
import { EnhanceModals } from './EnhanceModals';
import { useEnhanceGestures } from './useEnhanceGestures';
import {
  ArrowLeft,
  Trash2,
  Edit3,
  PenTool,
  LayoutGrid,
  Stamp,
  EyeOff,
  Undo2,
} from 'lucide-react';

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
  const pageScopeKey = pages[Math.min(currentPageIndex, Math.max(0, pages.length - 1))]?.id ?? String(Math.min(currentPageIndex, Math.max(0, pages.length - 1)));
  const [redactionState, setRedactionState] = useState<{
    key: string;
    active: boolean;
    strokes: { x: number; y: number }[][];
    draftInit: string | null;
  }>({ key: pageScopeKey, active: false, strokes: [], draftInit: null });
  const isRedacting = redactionState.key === pageScopeKey ? redactionState.active : false;
  const redactionStrokes = redactionState.key === pageScopeKey ? redactionState.strokes : [];
  const redactionDraftInit = redactionState.key === pageScopeKey ? redactionState.draftInit : null;
  const setIsRedacting = (next: boolean | ((prev: boolean) => boolean)) =>
    setRedactionState((prev) => {
      const base = prev.key === pageScopeKey ? prev : { key: pageScopeKey, active: false, strokes: [], draftInit: null };
      const active = typeof next === 'function' ? next(base.active) : next;
      return { ...base, active };
    });
  const setRedactionStrokes = (next: { x: number; y: number }[][] | ((prev: { x: number; y: number }[][]) => { x: number; y: number }[][])) =>
    setRedactionState((prev) => {
      const base = prev.key === pageScopeKey ? prev : { key: pageScopeKey, active: false, strokes: [], draftInit: null };
      const strokes = typeof next === 'function' ? next(base.strokes) : next;
      return { ...base, strokes };
    });
  const setRedactionDraftInit = (draftInit: string | null) =>
    setRedactionState((prev) => {
      const base = prev.key === pageScopeKey ? prev : { key: pageScopeKey, active: false, strokes: [], draftInit: null };
      return { ...base, draftInit };
    });
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
    const dateStr = d.toISOString().slice(0, 10);
    const timeStr = d.toTimeString().slice(0, 5).replace(':', '-');
    return `Otium_Doc_${dateStr}_${timeStr}`;
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

  // Auto-reset live redaction buffers when changing page
  useEffect(() => {
    redactionPointsRef.current = [];
    redactionLiveStrRef.current = '';
    redactionSvgRectRef.current = null;
  }, [pageScopeKey]);

  // Cleanup preview object URLs on change or unmount
  useEffect(() => {
    return () => {
      if (fullResPreviewUrl && fullResPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(fullResPreviewUrl);
      }
    };
  }, [fullResPreviewUrl]);

  // Terminate OCR WebAssembly worker when unmounting review to reclaim RAM
  useEffect(() => {
    return () => {
      terminateOcrWorker().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!currentPage) return;

    loadPageCanvasFromDisk(currentPage.id)
      .then(async (canvas) => {
        if (!active) return;
        const finalCanvas =
          curvature > 0 ? await dewarpBookCurvatureAsync(canvas, curvature, spinePos) : canvas;
        if (!active) return;
        setPreviewState({ key: pageScopeKey, url: finalCanvas.toDataURL('image/jpeg', 0.9) });

        // Background Barcode & QR Code Intelligence
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

    return () => {
      active = false;
    };
  }, [currentPage, curvature, spinePos, pageScopeKey]);

  const handleFilterSelect = async (newFilter: FilterType) => {
    triggerHaptic(10);
    setActiveFilter(newFilter);
    try {
      await updateStoredPageFilter(currentPage.id, newFilter);
      const canvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(canvas, curvature, spinePos) : canvas;
      setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      console.warn('Filter update failed:', e);
    }
  };

  const handleApplyFilterToAll = async () => {
    triggerHaptic(15);
    setToastMsg(`Applying ${activeFilter} to all pages...`);
    for (const p of pages) {
      await updateStoredPageFilter(p.id, activeFilter);
    }
    const canvas = await loadPageCanvasFromDisk(currentPage.id);
    const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(canvas, curvature, spinePos) : canvas;
    setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
    setToastMsg(`Applied ${activeFilter} to all pages`);
    setTimeout(() => setToastMsg(''), 2200);
  };

  const handleTogglePageSelect = (idx: number) => {
    triggerHaptic(10);
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedPages.size === 0) return;
    triggerHaptic(20);
    const indices = Array.from(selectedPages).sort((a, b) => b - a);
    indices.forEach((idx) => onDeletePage(idx));
    setSelectedPages(new Set());
    setToastMsg(`Deleted ${indices.length} pages`);
    setTimeout(() => setToastMsg(''), 2200);
  };

  const handleDownloadJpg = async () => {
    triggerHaptic(20);
    try {
      const rawCanvas = await loadPageCanvasFromDisk(currentPage.id);
      const processed = curvature > 0 ? await dewarpBookCurvatureAsync(rawCanvas, curvature, spinePos) : rawCanvas;
      const filename = `${docTitle.trim() || 'Otium_Scan'}_Page_${safeIndex + 1}.jpg`;
      const blob = await new Promise<Blob | null>((res) => processed.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) return;

      await nativeSaveImage(blob, filename);
      setToastMsg(`✓ تم حفظ صفحة ${safeIndex + 1} في الصور`);
      setTimeout(() => setToastMsg(''), 2200);
    } catch (e) {
      console.warn('JPG export failed:', e);
    }
  };

  const handleBurnRedaction = async () => {
    if (redactionStrokes.length === 0) {
      setIsRedacting(false);
      return;
    }
    triggerHaptic(20);
    try {
      if (previewImageRef.current) {
        const previewUrl = await burnRedactionOnPageCanvas({
          page: currentPage,
          strokes: redactionStrokes,
          previewRect: previewImageRef.current.getBoundingClientRect(),
          onThumbnailUpdated: onUpdatePageThumbnail,
        });
        setFullResPreviewUrl(previewUrl);
        redactionPointsRef.current = [];
        redactionLiveStrRef.current = '';
        redactionSvgRectRef.current = null;
        setRedactionStrokes([]);
        setRedactionDraftInit(null);
        setIsRedacting(false);
        setToastMsg('Confidential info permanently censored');
        setTimeout(() => setToastMsg(''), 2200);
      }
    } catch (e) {
      console.warn('Redaction burn failed:', e);
    }
  };

  const generateCompiledPdf = async (presetOverride?: PdfCompressionPreset): Promise<Blob> => {
    return await compileScannedPdfDocument({
      pages,
      curvature,
      spinePos,
      signatures,
      enableOcr,
      compressionPreset: presetOverride || compressionPreset,
      pageFormat,
      watermarkText,
      watermarkStyle,
      onOcrProgress: setOcrStatus,
    });
  };

  const handleRotateCurrentPage = async () => {
    triggerHaptic(20);
    try {
      await onRotatePage(safeIndex);
      const canvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(canvas, curvature, spinePos) : canvas;
      setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      console.warn('Rotation failed:', e);
    }
  };

  const handleExtractTextFromPage = async () => {
    if (isExtractingText || !currentPage) return;
    triggerHaptic(15);
    setIsExtractingText(true);
    setToastMsg('جاري استخراج النص والتعرف الضوئي...');
    try {
      const rawCanvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(rawCanvas, curvature, spinePos) : rawCanvas;
      const result = await extractPageTextAndMetadata(finalCanvas);
      setExtractedText(result.text || 'لم يتم العثور على نص واضح في هذه الصفحة.');
      if (result.suggestedTitle) {
        setSuggestedDocTitle(result.suggestedTitle);
      }
      setIsOcrModalOpen(true);
      setToastMsg('');
    } catch (err) {
      console.warn('OCR error:', err);
      setToastMsg('تعذر استخراج النص من الصفحة');
      setTimeout(() => setToastMsg(''), 2000);
    } finally {
      setIsExtractingText(false);
    }
  };

  const persistToLibrary = (pdfBlob: Blob) => cacheCompiledPdfInLibrary(docTitle, pages, pdfBlob);

  const handleSharePdf = async () => {
    triggerHaptic(20);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      await nativeSharePdf(pdfBlob, filename, docTitle.trim() || 'Otium Document');
    } catch (e) {
      console.warn('Share PDF failed:', e);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  const handleShareWhatsApp = async () => {
    triggerHaptic(20);
    setPdfGenerating(true);
    setToastMsg('⏳ جاري تجهيز نسخة خفيفة للمشاركة...');
    try {
      // Force 'compact' compression for ultra-fast WhatsApp/messaging transfer (< 1.5MB)
      const pdfBlob = await generateCompiledPdf('compact');
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}_fast.pdf`;
      await nativeSharePdf(pdfBlob, filename, docTitle.trim() || 'Otium Document');
      setToastMsg('✓ تم فتح شاشة المشاركة');
    } catch (e) {
      console.warn('WhatsApp Quick Share failed:', e);
      setToastMsg('تعذر إتمام المشاركة السريعة');
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
      setTimeout(() => setToastMsg(''), 2200);
    }
  };

  const handleDownloadPdf = async () => {
    triggerHaptic(20);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      await nativeSavePdf(pdfBlob, filename);
      setToastMsg('✓ تم حفظ ملف الـ PDF');
      setTimeout(() => setToastMsg(''), 2500);
    } catch (e) {
      console.warn('Download PDF failed:', e);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  const handleOpenInOtium = async () => {
    triggerHaptic(25);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      if (onOpenPdfInReader) {
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });
        onOpenPdfInReader(file);
        return;
      }
      await nativeOpenInOtium(pdfBlob, filename);
    } catch (e) {
      console.warn('Open in Otium Reader failed:', e);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  const handlePrintPdf = async () => {
    triggerHaptic(20);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      await nativePrintPdf(pdfBlob, filename);
    } catch (e) {
      console.warn('Print PDF failed:', e);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  if (!currentPage) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center p-6 text-center">
        <p className="text-gray-400 text-sm">No scanned pages available</p>
      </div>
    );
  }

  const previewSource = fullResPreviewUrl || currentPage.thumbnailDataUrl;

  return (
    <div className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar with Safe Area Inset */}
      <div
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)',
        }}
        className="relative z-20 flex items-center justify-between px-3 pb-3 otium-chrome border-b border-white/[0.08]"
      >
        {/* Left: Back & Cancel All */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onBackToCamera}
            className="p-2 rounded-full glass-button text-gray-300 active:text-white"
            title="رجوع للكاميرا"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowCancelModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 active:scale-95 transition-all text-[11px] font-bold"
            title="إلغاء كافة الصور والعودة للرئيسية"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="font-arabic">إلغاء الكل</span>
          </button>
        </div>

        {/* Center: Title & Page Count */}
        <div className="flex flex-col items-center max-w-[40%]">
          {isEditingTitle ? (
            <input
              type="text"
              value={docTitle}
              autoFocus
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
              onChange={(e) => setDocTitle(e.target.value)}
              className="text-xs bg-white/10 text-white px-2 py-0.5 rounded-lg border border-accent focus:outline-none text-center max-w-full font-bold"
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1 text-xs sm:text-sm font-bold text-white truncate max-w-full hover:text-accent font-arabic"
              title="تعديل اسم المستند"
            >
              <span className="truncate">
                <bdi>{docTitle}</bdi>
              </span>
              <Edit3 className="w-3 h-3 text-accent opacity-80 shrink-0" />
            </button>
          )}
          <span className="text-[10px] text-accent font-bold font-arabic mt-0.5">
            صفحة {safeIndex + 1} من {pages.length}
          </span>
        </div>

        {/* Right: Quick Tools */}
        <div className="flex items-center gap-1">
          {/* Delete Current Page */}
          <button
            onClick={() => setShowDeletePageModal(true)}
            className="p-1.5 rounded-full glass-button text-gray-300 hover:text-rose-400 active:scale-95 transition-colors"
            title="حذف هذه الصفحة"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
          </button>

          {/* Privacy Redaction */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsRedacting(!isRedacting);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${
              isRedacting ? 'text-accent border-accent/50 bg-accent/20' : 'text-gray-300 active:text-accent'
            }`}
            title="حجب نصوص حساسة"
          >
            <EyeOff className="w-4 h-4" />
          </button>

          {/* Grid Overview Toggle */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsGridView(!isGridView);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${
              isGridView ? 'text-accent border-accent/50 bg-accent/10' : 'text-gray-300 active:text-accent'
            }`}
            title="عرض شبكي"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          {/* Security Watermark */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsWatermarkOpen(true);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${
              watermarkText ? 'text-accent border-accent/50 bg-accent/10' : 'text-gray-300 active:text-accent'
            }`}
            title="علامة مائية"
          >
            <Stamp className="w-4 h-4" />
          </button>

          {/* Sign Document */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsSignatureOpen(true);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${
              signatures[currentPage?.id ?? ''] ? 'text-accent border-accent/50' : 'text-gray-300 active:text-accent'
            }`}
            title="إضافة توقيع"
          >
            <PenTool className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Redaction Control Bar */}
      {isRedacting && (
        <div className="relative z-30 px-6 py-2.5 bg-black/95 border-b border-accent/30 flex items-center justify-between text-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-accent font-semibold">
            <EyeOff className="w-4 h-4 shrink-0" />
            <span className="truncate">Drag finger over text to censor</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                triggerHaptic(10);
                setRedactionStrokes((prev) => prev.slice(0, -1));
              }}
              disabled={redactionStrokes.length === 0}
              className="p-1.5 rounded-lg glass-button text-gray-300 disabled:opacity-30 hover:text-white"
              title="Undo last stroke"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                triggerHaptic(10);
                setIsRedacting(false);
                setRedactionStrokes([]);
              }}
              className="px-3 py-1 rounded-lg text-gray-400 hover:text-white text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleBurnRedaction}
              className="px-3.5 py-1 rounded-lg bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/25 active:scale-95"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Main Stage: Carousel View or Grid Overview Sheet */}
      <EnhanceStageAndGrid
        isGridView={isGridView}
        setIsGridView={setIsGridView}
        pages={pages}
        safeIndex={safeIndex}
        setCurrentPageIndex={setCurrentPageIndex}
        selectedPages={selectedPages}
        handleBulkDelete={handleBulkDelete}
        handleTogglePageSelect={handleTogglePageSelect}
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
        previewSource={previewSource}
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
          onRotateCurrentPage={handleRotateCurrentPage}
          onExtractTextFromPage={handleExtractTextFromPage}
          onRetakePage={onRetakePage}
          onDuplicatePage={onDuplicatePage}
          onFilterSelect={handleFilterSelect}
          onApplyFilterToAll={handleApplyFilterToAll}
          onSelectPageIndex={setCurrentPageIndex}
          onAddMorePages={onAddMorePages}
          onOpenAdvancedOptions={() => {
            triggerHaptic(12);
            setIsAdvancedOptionsOpen(true);
          }}
          onOpenInOtium={handleOpenInOtium}
          onSharePdf={handleSharePdf}
          onDownloadJpg={handleDownloadJpg}
          onOpenMoreActions={() => {
            triggerHaptic(10);
            setShowMoreActions(true);
          }}
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
        onShareWhatsApp={handleShareWhatsApp}
        onDownloadPdf={handleDownloadPdf}
        onPrintPdf={handlePrintPdf}
        triggerHaptic={triggerHaptic}
      />
    </div>
  );
};
