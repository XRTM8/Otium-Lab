import type { Dispatch, RefObject, SetStateAction } from 'react';
import { dewarpBookCurvatureAsync } from '../core/geometry';
import { extractPageTextAndMetadata } from '../core/ocr/ocrEngine';
import { nativeOpenInOtium, nativePrintPdf, nativeSaveImage, nativeSavePdf, nativeSharePdf } from '../core/nativeBridge';
import type { PdfCompressionPreset, PdfPageFormat, PdfWatermarkStyle } from '../core/pdf';
import {
  burnRedactionOnPageCanvas,
  cacheCompiledPdfInLibrary,
  compileScannedPdfDocument,
  type SignaturePlacement,
} from '../core/enhancePdfCompile';
import { loadPageCanvasFromDisk, updateStoredPageFilter } from '../core/storage/pageStore';
import type { FilterType, ScannedPage } from '../core/types';

export interface UseEnhanceExportActionsOptions {
  pages: ScannedPage[];
  currentPage: ScannedPage | undefined;
  safeIndex: number;
  activeFilter: FilterType;
  setActiveFilter: (filter: FilterType) => void;
  curvature: number;
  spinePos: number;
  signatures: Record<string, SignaturePlacement>;
  enableOcr: boolean;
  compressionPreset: PdfCompressionPreset;
  pageFormat: PdfPageFormat;
  watermarkText: string;
  watermarkStyle: PdfWatermarkStyle;
  docTitle: string;
  selectedPages: Set<number>;
  setSelectedPages: Dispatch<SetStateAction<Set<number>>>;
  redactionStrokes: { x: number; y: number }[][];
  setRedactionStrokes: (
    next: { x: number; y: number }[][] | ((prev: { x: number; y: number }[][]) => { x: number; y: number }[][])
  ) => void;
  setIsRedacting: (next: boolean | ((prev: boolean) => boolean)) => void;
  setRedactionDraftInit: (draftInit: string | null) => void;
  redactionPointsRef: RefObject<{ x: number; y: number }[]>;
  redactionLiveStrRef: RefObject<string>;
  redactionSvgRectRef: RefObject<DOMRect | null>;
  previewImageRef: RefObject<HTMLImageElement | null>;
  isExtractingText: boolean;
  setIsExtractingText: (v: boolean) => void;
  setExtractedText: (t: string) => void;
  setSuggestedDocTitle: (t: string) => void;
  setIsOcrModalOpen: (v: boolean) => void;
  setFullResPreviewUrl: (url: string) => void;
  setToastMsg: (msg: string) => void;
  setPdfGenerating: (v: boolean) => void;
  setOcrStatus: (s: string) => void;
  onRotatePage: (index: number) => Promise<void>;
  onDeletePage: (index: number) => void;
  onUpdatePageThumbnail?: (pageId: string, thumbnailDataUrl: string) => void;
  onOpenPdfInReader?: (file: File) => void;
  triggerHaptic: (duration?: number) => void;
}

export function useEnhanceExportAndActions(options: UseEnhanceExportActionsOptions) {
  const {
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
  } = options;

  const generateCompiledPdf = async (presetOverride?: PdfCompressionPreset): Promise<Blob> =>
    compileScannedPdfDocument({
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

  const handleFilterSelect = async (newFilter: FilterType) => {
    if (!currentPage) return;
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
    if (!currentPage) return;
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
    if (!currentPage) return;
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
    if (!currentPage) return;
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

  const handleRotateCurrentPage = async () => {
    if (!currentPage) return;
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
      if (result.suggestedTitle) setSuggestedDocTitle(result.suggestedTitle);
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

  const runPdfTask = async (
    task: (pdfBlob: Blob, filename: string) => Promise<void>,
    optionsTask?: { preset?: PdfCompressionPreset; suffix?: string; pendingToast?: string; doneToast?: string; errToast?: string }
  ) => {
    triggerHaptic(optionsTask?.suffix === '' ? 25 : 20);
    setPdfGenerating(true);
    if (optionsTask?.pendingToast) setToastMsg(optionsTask.pendingToast);
    try {
      const pdfBlob = await generateCompiledPdf(optionsTask?.preset);
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}${optionsTask?.suffix || ''}.pdf`;
      await task(pdfBlob, filename);
      if (optionsTask?.doneToast) {
        setToastMsg(optionsTask.doneToast);
        setTimeout(() => setToastMsg(''), 2400);
      }
    } catch (e) {
      console.warn('PDF export action failed:', e);
      if (optionsTask?.errToast) {
        setToastMsg(optionsTask.errToast);
        setTimeout(() => setToastMsg(''), 2200);
      }
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  return {
    handleFilterSelect,
    handleApplyFilterToAll,
    handleTogglePageSelect,
    handleBulkDelete,
    handleDownloadJpg,
    handleBurnRedaction,
    handleRotateCurrentPage,
    handleExtractTextFromPage,
    handleSharePdf: () =>
      runPdfTask((blob, name) => nativeSharePdf(blob, name, docTitle.trim() || 'Otium Document')),
    handleShareWhatsApp: () =>
      runPdfTask((blob, name) => nativeSharePdf(blob, name, docTitle.trim() || 'Otium Document'), {
        preset: 'compact',
        suffix: '_fast',
        pendingToast: '⏳ جاري تجهيز نسخة خفيفة للمشاركة...',
        doneToast: '✓ تم فتح شاشة المشاركة',
        errToast: 'تعذر إتمام المشاركة السريعة',
      }),
    handleDownloadPdf: () =>
      runPdfTask(async (blob, name) => {
        await nativeSavePdf(blob, name);
      }, {
        doneToast: '✓ تم حفظ ملف الـ PDF',
      }),
    handleOpenInOtium: () =>
      runPdfTask(async (blob, name) => {
        if (onOpenPdfInReader) {
          onOpenPdfInReader(new File([blob], name, { type: 'application/pdf' }));
          return;
        }
        await nativeOpenInOtium(blob, name);
      }),
    handlePrintPdf: () => runPdfTask((blob, name) => nativePrintPdf(blob, name)),
  };
}
