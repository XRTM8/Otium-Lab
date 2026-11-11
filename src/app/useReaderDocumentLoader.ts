import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { BookmarkItem, TextAnnotation, ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { RecentDocItem } from '../core/storage/documents';
import { isPdfBuffer, openPdf } from '../core/pdf/document';
import { mergeTextAnnotations } from '../core/annotations/textSync';
import {
  adoptLegacyDocumentRecord,
  getDocumentFromStorage,
  saveDocumentToStorage,
  updateDocumentPage,
} from '../core/storage/documents';
import { fingerprintDocument } from '../core/storage/documentIdentity';
import { loadStoredAnnotations } from '../core/storage/annotations';
import { getStoredBookmarks } from '../core/storage/bookmarks';
import {
  loadDocumentTheme,
  loadLastPage,
  loadScrollOffset,
  loadTheme,
  resolveScheduledTheme,
  type ThemeScheduleMode,
} from '../core/settings/preferences';
import { computeOptimalPageScale } from '../core/reader/device';
import { clearSearchTextCache } from '../core/search/documentSearch';
import { stopTts } from '../platform/tts';
import {
  describeDocumentError,
  destroyDocumentSoon,
  detectIsArabicScript,
  EMPTY_PASSWORD_MODAL,
  SAMPLE_DOCUMENT_NAME,
  type PasswordModalState,
} from './readerControllerHelpers';

interface UseReaderDocumentLoaderOptions {
  dragDropEnabled: boolean;
  lang: Language;
  langRef: React.MutableRefObject<Language>;
  viewMode: ViewMode;
  chromeInset: number;
  docRef: React.MutableRefObject<PDFDocumentProxy | null>;
  docIdRef: React.MutableRefObject<string>;
  annotationsGenerationRef: React.MutableRefObject<number>;
  annotationsHydratedRef: React.MutableRefObject<boolean>;
  bookmarksHydratedRef: React.MutableRefObject<boolean>;
  pendingScrollPageRef: React.MutableRefObject<number | null>;
  pendingScrollOffsetRef: React.MutableRefObject<number | null>;
  pageSaveTimerRef: React.MutableRefObject<number | null>;
  currentPageRef: React.MutableRefObject<number>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  lastFitScaleRef: React.MutableRefObject<number>;
  rememberDocThemeRef: React.MutableRefObject<boolean>;
  themeScheduleRef: React.MutableRefObject<ThemeScheduleMode>;
  dayThemeRef: React.MutableRefObject<ThemeMode>;
  nightThemeRef: React.MutableRefObject<ThemeMode>;
  passwordModal: PasswordModalState;
  setPasswordModal: React.Dispatch<React.SetStateAction<PasswordModalState>>;
  setDoc: React.Dispatch<React.SetStateAction<PDFDocumentProxy | null>>;
  setDocTitle: React.Dispatch<React.SetStateAction<string>>;
  setDocId: React.Dispatch<React.SetStateAction<string>>;
  setNumPages: React.Dispatch<React.SetStateAction<number>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setAnnotations: React.Dispatch<React.SetStateAction<TextAnnotation[]>>;
  setBookmarks: React.Dispatch<React.SetStateAction<BookmarkItem[]>>;
  setBasePageSize: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setBaseAspectRatio: React.Dispatch<React.SetStateAction<number>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setActiveSearchPage: React.Dispatch<React.SetStateAction<number | null>>;
  setSearchSeed: React.Dispatch<React.SetStateAction<{ query: string; id: number } | null>>;
  setIsSearchOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setIsSidebarOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setIsSettingsOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setIsImmersive: React.Dispatch<React.SetStateAction<boolean>>;
  setDocumentError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadProgress: React.Dispatch<React.SetStateAction<number | null>>;
  setDetectedDocIsRtl: React.Dispatch<React.SetStateAction<boolean>>;
  setFitScaleState: React.Dispatch<React.SetStateAction<number>>;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setFileSizeBytes: React.Dispatch<React.SetStateAction<number>>;
  changeTheme: (nextTheme: ThemeMode, persistDocument?: boolean) => void;
}

/**
 * Coordinates PDF opening, drag-and-drop file loading, password prompts,
 * sample/recent document loading, and clean document closing.
 */
export function useReaderDocumentLoader(opts: UseReaderDocumentLoaderOptions) {
  const {
    dragDropEnabled,
    lang,
    langRef,
    viewMode,
    chromeInset,
    docRef,
    docIdRef,
    annotationsGenerationRef,
    annotationsHydratedRef,
    bookmarksHydratedRef,
    pendingScrollPageRef,
    pendingScrollOffsetRef,
    pageSaveTimerRef,
    currentPageRef,
    scrollContainerRef,
    lastFitScaleRef,
    rememberDocThemeRef,
    themeScheduleRef,
    dayThemeRef,
    nightThemeRef,
    passwordModal,
    setPasswordModal,
    setDoc,
    setDocTitle,
    setDocId,
    setNumPages,
    setCurrentPage,
    setAnnotations,
    setBookmarks,
    setBasePageSize,
    setBaseAspectRatio,
    setSearchQuery,
    setActiveSearchPage,
    setSearchSeed,
    setIsSearchOpen,
    setIsSidebarOpen,
    setIsSettingsOpen,
    setIsImmersive,
    setDocumentError,
    setIsLoading,
    setLoadProgress,
    setDetectedDocIsRtl,
    setFitScaleState,
    setZoom,
    setFileSizeBytes,
    changeTheme,
  } = opts;

  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const loadGenerationRef = useRef(0);
  const fileReadGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      if (loadingTaskRef.current) {
        void loadingTaskRef.current.destroy().catch(() => {});
      }
      if (docRef.current) {
        void docRef.current.loadingTask.destroy().catch(() => {});
      }
    };
  }, [docRef]);

  const closeDocument = useCallback(() => {
    fileReadGenerationRef.current++;
    loadGenerationRef.current++;
    const pendingTask = loadingTaskRef.current;
    loadingTaskRef.current = null;
    if (pendingTask) void pendingTask.destroy().catch(() => {});
    stopTts();
    if (pageSaveTimerRef.current !== null && docIdRef.current) {
      window.clearTimeout(pageSaveTimerRef.current);
      pageSaveTimerRef.current = null;
      void updateDocumentPage(docIdRef.current, currentPageRef.current);
    }
    const activeDoc = docRef.current;
    clearSearchTextCache(activeDoc);
    docRef.current = null;
    docIdRef.current = '';
    annotationsGenerationRef.current += 1;
    annotationsHydratedRef.current = false;
    bookmarksHydratedRef.current = false;
    setDoc(null);
    setDocTitle('');
    setDocId('');
    setNumPages(0);
    setCurrentPage(1);
    setAnnotations([]);
    setBookmarks([]);
    setSearchQuery('');
    setActiveSearchPage(null);
    setSearchSeed(null);
    setIsSearchOpen(false);
    setIsSidebarOpen(false);
    setIsSettingsOpen(false);
    setIsImmersive(false);

    setPasswordModal(EMPTY_PASSWORD_MODAL);
    setDocumentError(null);
    setIsLoading(false);
    setLoadProgress(null);
    lastFitScaleRef.current = 0;
    setFitScaleState(0);
    if (activeDoc) destroyDocumentSoon(activeDoc);
  }, [
    annotationsGenerationRef,
    annotationsHydratedRef,
    bookmarksHydratedRef,
    currentPageRef,
    docIdRef,
    docRef,
    lastFitScaleRef,
    pageSaveTimerRef,
    setActiveSearchPage,
    setAnnotations,
    setBookmarks,
    setCurrentPage,
    setDoc,
    setDocId,
    setDocTitle,
    setDocumentError,
    setFitScaleState,
    setIsImmersive,
    setIsLoading,
    setIsSearchOpen,
    setIsSettingsOpen,
    setIsSidebarOpen,
    setLoadProgress,
    setNumPages,
    setPasswordModal,
    setSearchQuery,
    setSearchSeed,
  ]);

  const handlePasswordCancel = useCallback(() => {
    loadGenerationRef.current += 1;
    const task = loadingTaskRef.current;
    loadingTaskRef.current = null;
    if (task) {
      void task.destroy().catch(() => {});
    }
    setPasswordModal(EMPTY_PASSWORD_MODAL);
    setIsLoading(false);
    setLoadProgress(null);
  }, [setIsLoading, setLoadProgress, setPasswordModal]);

  const loadPdfData = async (data: ArrayBuffer, title: string, startPage?: number, reportFailure = false) => {
    if (!data || data.byteLength === 0) {
      setDocumentError(lang === 'ar' ? 'الملف المحدد فارغ.' : 'The selected file is empty.');
      return false;
    }

    if (!isPdfBuffer(data)) {
      setDocumentError(
        lang === 'ar'
          ? 'الملف المحدد تالف أو ليس مستند PDF صالحاً.'
          : 'The selected file is corrupt or not a valid PDF document.'
      );
      return false;
    }

    const generation = ++loadGenerationRef.current;
    const annotationGeneration = ++annotationsGenerationRef.current;
    annotationsHydratedRef.current = false;
    bookmarksHydratedRef.current = false;
    setDocumentError(null);
    setLoadProgress(null);
    setIsLoading(true);
    setPasswordModal(EMPTY_PASSWORD_MODAL);

    const previousTask = loadingTaskRef.current;
    loadingTaskRef.current = null;
    if (previousTask) {
      void previousTask.destroy().catch(() => {});
    }

    const storageBuffer = data.slice(0);
    const identityPromise = fingerprintDocument(storageBuffer).catch(() => '');

    const handle = openPdf(data, {
      onPassword: ({ callback, reason }) => {
        if (generation !== loadGenerationRef.current) return;
        setIsLoading(false);
        setPasswordModal({
          isOpen: true,
          isIncorrect: reason === 2,
          callback,
          title,
        });
      },
      onProgress: (loaded, total) => {
        if (generation !== loadGenerationRef.current || total <= 0) return;
        setLoadProgress(Math.min(100, Math.round((loaded / total) * 100)));
      },
    });

    loadingTaskRef.current = handle.loadingTask;

    try {
      const opened = await handle.promise;
      if (generation !== loadGenerationRef.current) {
        destroyDocumentSoon(opened.doc);
        return false;
      }

      const documentId = (await identityPromise) || title;
      if (generation !== loadGenerationRef.current) {
        destroyDocumentSoon(opened.doc);
        return false;
      }

      loadingTaskRef.current = null;
      const previousDoc = docRef.current;
      docRef.current = opened.doc;
      docIdRef.current = documentId;

      setDoc(opened.doc);
      setDocTitle(title);
      setDocId(documentId);
      setNumPages(opened.numPages);
      setAnnotations([]);
      void loadStoredAnnotations(documentId, title)
        .then((stored) => {
          if (annotationGeneration !== annotationsGenerationRef.current) return;
          annotationsHydratedRef.current = true;
          setAnnotations((current) => mergeTextAnnotations(current, stored));
        })
        .catch(() => {
          if (annotationGeneration !== annotationsGenerationRef.current) return;
          annotationsHydratedRef.current = true;
          setAnnotations([]);
        });
      setBookmarks(getStoredBookmarks(documentId, title));
      bookmarksHydratedRef.current = true;
      setBasePageSize(opened.basePageSize);
      setBaseAspectRatio(opened.baseAspectRatio);
      setPasswordModal(EMPTY_PASSWORD_MODAL);
      setSearchQuery('');
      setActiveSearchPage(null);
      setSearchSeed(null);
      setIsSearchOpen(false);
      setIsSidebarOpen(false);
      setIsImmersive(false);
      setDocumentError(null);

      setDetectedDocIsRtl(false);
      void (async () => {
        let pageText = '';
        try {
          for (let page = 1; page <= Math.min(3, opened.doc.numPages); page++) {
            if (generation !== loadGenerationRef.current) return;
            const pdfPage = await opened.doc.getPage(page);
            const textContent = await pdfPage.getTextContent();
            pageText +=
              ' ' +
              textContent.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ')
                .slice(0, 6000);
          }
        } catch {
          /* Image-only PDFs default to LTR. */
        }
        if (generation === loadGenerationRef.current) setDetectedDocIsRtl(detectIsArabicScript(pageText));
      })();

      if (opened.basePageSize.width && opened.basePageSize.height && typeof window !== 'undefined') {
        const fit = computeOptimalPageScale(
          opened.basePageSize.width,
          opened.basePageSize.height,
          scrollContainerRef.current?.clientWidth || window.innerWidth,
          (scrollContainerRef.current?.clientHeight || window.innerHeight) - chromeInset,
          viewMode
        );
        lastFitScaleRef.current = fit;
        setFitScaleState(fit);
        setZoom(fit);
      }

      const savedPage = loadLastPage(documentId, title);
      const savedOffset = loadScrollOffset(documentId);
      const requestedPage =
        typeof startPage === 'number' && Number.isFinite(startPage) ? Math.round(startPage) : 0;
      const initialPage =
        requestedPage > 0 && requestedPage <= opened.numPages
          ? requestedPage
          : savedPage > 0 && savedPage <= opened.numPages
            ? savedPage
            : 1;
      pendingScrollPageRef.current = initialPage > 1 || savedOffset > 0 ? initialPage : null;
      pendingScrollOffsetRef.current = savedOffset > 0 ? savedOffset : null;
      setCurrentPage(initialPage);
      setFileSizeBytes(storageBuffer.byteLength);

      if (rememberDocThemeRef.current) {
        const savedDocTheme = loadDocumentTheme(documentId, title);
        if (savedDocTheme) {
          changeTheme(savedDocTheme, false);
        } else if (themeScheduleRef.current !== 'manual') {
          const scheduled = resolveScheduledTheme(
            themeScheduleRef.current,
            dayThemeRef.current,
            nightThemeRef.current,
            loadTheme()
          );
          changeTheme(scheduled, false);
        }
      }

      if (storageBuffer.byteLength > 0) {
        void saveDocumentToStorage(documentId, title, storageBuffer, opened.numPages, initialPage);
        void adoptLegacyDocumentRecord(title, documentId);
      } else {
        void updateDocumentPage(documentId, initialPage, savedOffset);
      }

      if (previousDoc && previousDoc !== opened.doc) {
        clearSearchTextCache(previousDoc);
        destroyDocumentSoon(previousDoc);
      }
      return true;
    } catch (error) {
      if (generation !== loadGenerationRef.current) return false;
      loadingTaskRef.current = null;
      setPasswordModal(EMPTY_PASSWORD_MODAL);
      setDocumentError(describeDocumentError(error, lang));
      console.error('Error loading PDF:', error);
      if (reportFailure) throw error;
      return false;
    } finally {
      if (generation === loadGenerationRef.current) {
        setIsLoading(false);
        setLoadProgress(null);
      }
    }
  };

  const loadDocumentRef = useRef(loadPdfData);
  useEffect(() => {
    loadDocumentRef.current = loadPdfData;
  });

  const openFile = useCallback(
    async (file: File) => {
      const fileGeneration = ++fileReadGenerationRef.current;
      try {
        const buffer = await file.arrayBuffer();
        if (fileGeneration !== fileReadGenerationRef.current) return false;
        return await loadDocumentRef.current(buffer, file.name);
      } catch (error) {
        if (fileGeneration !== fileReadGenerationRef.current) return false;
        setDocumentError(describeDocumentError(error, lang));
        console.error('Error reading file:', error);
        return false;
      }
    },
    [lang, setDocumentError]
  );

  const openFileRef = useRef(openFile);
  useEffect(() => {
    openFileRef.current = openFile;
  });

  useEffect(() => {
    if (!dragDropEnabled) return;

    const handleDragOver = (event: DragEvent) => event.preventDefault();
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        void openFileRef.current(file);
      } else {
        setDocumentError(langRef.current === 'ar' ? 'يرجى اختيار ملف PDF صالح.' : 'Please select a valid PDF file.');
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [dragDropEnabled, langRef, setDocumentError]);

  const openSample = useCallback(async () => {
    setIsLoading(true);
    setDocumentError(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample.pdf`);
      if (!response.ok) throw new Error(`Sample document returned ${response.status}`);
      const buffer = await response.arrayBuffer();
      return await loadDocumentRef.current(buffer, SAMPLE_DOCUMENT_NAME);
    } catch (error) {
      setDocumentError(describeDocumentError(error, lang));
      setIsLoading(false);
      console.error('Error loading sample:', error);
      return false;
    }
  }, [lang, setDocumentError, setIsLoading]);

  const loadDocumentBytes = useCallback(async (data: ArrayBuffer, name: string) => {
    return await loadDocumentRef.current(data, name);
  }, []);

  const openRecent = useCallback(
    async (recent: RecentDocItem) => {
      if (recent.name === SAMPLE_DOCUMENT_NAME) {
        return await openSample();
      }

      if (!recent.available) {
        setDocumentError(
          lang === 'ar'
            ? 'هذا المستند في مكتبتك لكن ملفه غير موجود على هذا الجهاز. أعد فتح ملف الـ PDF لاستعادته.'
            : 'This book is in your library but its PDF is not on this device. Open the PDF file again to restore it.'
        );
        return false;
      }

      setIsLoading(true);
      setDocumentError(null);
      let data: ArrayBuffer | null;
      try {
        data = await getDocumentFromStorage(recent.id);
      } catch {
        setIsLoading(false);
        setDocumentError(
          lang === 'ar'
            ? 'تعذر قراءة المستند المحفوظ. حاول مجدداً أو أعد استيراد الملف.'
            : 'Could not read the saved document. Try again or import the file again.'
        );
        return false;
      }
      if (!data) {
        setIsLoading(false);
        setDocumentError(
          lang === 'ar'
            ? 'هذا المستند لم يعد محفوظاً على هذا الجهاز.'
            : 'This document is no longer stored on this device.'
        );
        return false;
      }
      return await loadDocumentRef.current(data, recent.name);
    },
    [lang, openSample, setDocumentError, setIsLoading]
  );

  const handlePasswordSubmit = useCallback(
    (password: string) => {
      if (!passwordModal.callback) return;
      setIsLoading(true);
      passwordModal.callback(password);
    },
    [passwordModal, setIsLoading]
  );

  return {
    loadDocumentRef,
    closeDocument,
    handlePasswordCancel,
    handlePasswordSubmit,
    openFile,
    openSample,
    loadDocumentBytes,
    openRecent,
  };
}
