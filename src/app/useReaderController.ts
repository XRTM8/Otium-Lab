import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  FontFamilyId,
  ReadingDirection,
  TextAnnotation,
  ViewMode,
} from '../core/types';
import type { Language } from '../core/i18n/translations';
import { validSelectionRects } from '../core/annotations/textSync';
import { renameStoredDocument } from '../core/storage/documents';
import { executeBackStep } from '../core/navigation/backHandler';
import { applyFontFamily, getSavedFont, saveFont } from '../core/settings/fonts';
import {
  loadLanguage,
  loadMobileNavVisible,
  loadReadingDirection,
  loadViewMode,
  saveLanguage,
  saveMobileNavVisible,
  saveReadingDirection,
  saveViewMode,
} from '../core/settings/preferences';
import { computeOptimalPageScale, measureRefreshRate } from '../core/reader/device';
import { syncNativeImmersive } from '../platform/ui';
import { stopTts } from '../platform/tts';
import { beamService } from '../board/beam/beamService';
import { useAutoBeamDocument } from '../board/beam/useAutoBeamDocument';
import {
  EMPTY_PASSWORD_MODAL,
  observeDocumentFullscreen,
  type PasswordModalState,
  type ReaderCapabilities,
  toggleDocumentFullscreen,
} from './readerControllerHelpers';
import { useReaderThemeAndWake } from './useReaderThemeAndWake';
import { useReaderViewportAndZoom } from './useReaderViewportAndZoom';
import { useReaderNavigation } from './useReaderNavigation';
import { useReaderBookmarksAndAnnotations } from './useReaderBookmarksAndAnnotations';
import { useReaderDocumentLoader } from './useReaderDocumentLoader';
import { useReaderBeamSync } from './useReaderBeamSync';
import { useReaderKeyboardShortcuts } from './useReaderKeyboardShortcuts';

export type { ReaderCapabilities } from './readerControllerHelpers';

export function useReaderController(capabilities: ReaderCapabilities) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docTitle, setDocTitle] = useState('');
  /** SHA-256 content identity used for every persisted reading record. */
  const [docId, setDocId] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [dualFlipKey, setDualFlipKey] = useState(0);
  const [dualFlipDir, setDualFlipDir] = useState<'forward' | 'backward'>('forward');
  const [arrivalGlowKey, setArrivalGlowKey] = useState<number>(0);
  const [baseAspectRatio, setBaseAspectRatio] = useState(0.707);
  const [basePageSize, setBasePageSize] = useState({ width: 595, height: 842 });
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [lang, setLang] = useState<Language>(loadLanguage);
  const langRef = useRef(lang);
  useLayoutEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const [fontFamily, setFontFamily] = useState<FontFamilyId>(getSavedFont);
  const [showMobileNavBar, setShowMobileNavBar] = useState<boolean>(loadMobileNavVisible);
  const [isImmersive, setIsImmersive] = useState(false);
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>(loadReadingDirection);
  const [detectedDocIsRtl, setDetectedDocIsRtl] = useState<boolean>(false);
  const docIsRtl = readingDirection === 'rtl' ? true : readingDirection === 'ltr' ? false : detectedDocIsRtl;

  const changeReadingDirection = useCallback((dir: ReadingDirection) => {
    setReadingDirection(dir);
    saveReadingDirection(dir);
  }, []);

  const [isSidebarOpen, setIsSidebarOpenRaw] = useState(false);
  const [isSearchOpen, setIsSearchOpenRaw] = useState(false);
  const [isSettingsOpen, setIsSettingsOpenRaw] = useState(false);
  const isSidebarOpenRef = useRef(isSidebarOpen);
  const isSearchOpenRef = useRef(isSearchOpen);
  const isSettingsOpenRef = useRef(isSettingsOpen);
  useLayoutEffect(() => {
    isSidebarOpenRef.current = isSidebarOpen;
    isSearchOpenRef.current = isSearchOpen;
    isSettingsOpenRef.current = isSettingsOpen;
  }, [isSidebarOpen, isSearchOpen, isSettingsOpen]);

  const setIsSidebarOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(isSidebarOpenRef.current) : next;
    setIsSidebarOpenRaw(value);
    if (value) setIsImmersive(false);
  }, []);

  const setIsSearchOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(isSearchOpenRef.current) : next;
    setIsSearchOpenRaw(value);
    if (value) setIsImmersive(false);
  }, []);

  const setIsSettingsOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(isSettingsOpenRef.current) : next;
    setIsSettingsOpenRaw(value);
    if (value) setIsImmersive(false);
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchPage, setActiveSearchPage] = useState<number | null>(null);
  const [searchSeed, setSearchSeed] = useState<{ query: string; id: number } | null>(null);
  const [passwordModal, setPasswordModal] = useState<PasswordModalState>(EMPTY_PASSWORD_MODAL);
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);

  const [beamState, setBeamState] = useState<{ room: string | null; role: 'receiver' | 'sender' | null }>({
    room: beamService.getConnectedRoom(),
    role: beamService.getRole(),
  });
  const [beamPeerConnected, setBeamPeerConnected] = useState(beamService.getPeerState().connected);
  const beamSelectionKey = `${docId ?? ''}:${beamPeerConnected ? 1 : 0}`;
  const [beamSelectionState, setBeamSelectionState] = useState<{
    key: string;
    value: TextAnnotation | null;
  }>({ key: beamSelectionKey, value: null });
  const beamSelection = beamSelectionState.key === beamSelectionKey ? beamSelectionState.value : null;
  const beamSelectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const receiveBeamSelection = useCallback(
    (page: number, rects: import('../core/types').AnnotationRect[]) => {
      if (beamSelectionTimer.current) clearTimeout(beamSelectionTimer.current);
      if (!Number.isInteger(page) || page < 1 || !validSelectionRects(rects)) return;
      const value: TextAnnotation | null = rects.length
        ? { id: '__beam_selection', pageNumber: page, rects, type: 'highlight', color: '#38bdf8', text: '', createdAt: Date.now() }
        : null;
      setBeamSelectionState({ key: beamSelectionKey, value });
      beamSelectionTimer.current = setTimeout(() => {
        setBeamSelectionState((prev) => (prev.key === beamSelectionKey ? { key: beamSelectionKey, value: null } : prev));
      }, 6000);
    },
    [beamSelectionKey]
  );

  useEffect(() => {
    return () => {
      if (beamSelectionTimer.current) clearTimeout(beamSelectionTimer.current);
    };
  }, [beamSelectionKey]);

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const docIdRef = useRef('');
  const pendingScrollPageRef = useRef<number | null>(null);
  const pendingScrollOffsetRef = useRef<number | null>(null);
  const pageSaveTimerRef = useRef<number | null>(null);
  const lastSavedPageRef = useRef<{ title: string; page: number } | null>(null);
  const currentPageRef = useRef(currentPage);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    measureRefreshRate();
  }, []);

  // Android chrome floats above the reader: reserve for top bar + bottom nav.
  const chromeInset = capabilities.keyboard ? 0 : 96;

  const {
    theme,
    themeSchedule,
    dayTheme,
    nightTheme,
    rememberDocTheme,
    keepScreenAwake,
    rememberDocThemeRef,
    themeScheduleRef,
    dayThemeRef,
    nightThemeRef,
    changeTheme,
    changeThemeSchedule,
    changeDayTheme,
    changeNightTheme,
    changeRememberDocTheme,
    changeKeepScreenAwake,
  } = useReaderThemeAndWake({ doc, docIdRef });

  const autoBeam = useAutoBeamDocument({
    doc,
    docId,
    title: docTitle,
    page: currentPage,
    total: numPages,
    theme,
    viewMode,
    room: beamState.room,
    role: beamState.role,
    peerConnected: beamPeerConnected,
    loading: isLoading,
  });

  useEffect(() => beamService.onPeerChange((peer) => setBeamPeerConnected(peer.connected)), []);
  useEffect(() => beamService.onStateChange((state) => setBeamState(state)), []);

  useEffect(() => {
    syncNativeImmersive(!capabilities.keyboard || isImmersive);
  }, [isImmersive, capabilities.keyboard]);

  useEffect(() => {
    return () => {
      syncNativeImmersive(false);
    };
  }, []);

  const viewportActionsRef = useRef({
    scrollToRenderedPage: (_pageNumber: number, _offsetRatio?: number) => {},
    goToNextPage: () => {},
    goToPrevPage: () => {},
  });

  const {
    zoom,
    setZoom,
    setFitScaleState,
    lastFitScaleRef,
    scrollContainerRef,
    getFitScale,
    getMinZoom,
    getMaxZoom,
    minZoom,
    maxZoom,
    captureZoomAnchor,
    clearZoomAnchor,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    resetWheelTurnAccum,
  } = useReaderViewportAndZoom({
    doc,
    viewMode,
    basePageSize,
    chromeInset,
    keyboardCapable: capabilities.keyboard,
    currentPageRef,
    docIdRef,
    pageSaveTimerRef,
    actionsRef: viewportActionsRef,
  });

  const {
    scrollToRenderedPage,
    scrollToPage,
    handlePageVisible,
    goToNextPage,
    goToPrevPage,
    cancelPendingPageSave,
  } = useReaderNavigation({
    doc,
    docId,
    numPages,
    currentPage,
    viewMode,
    scrollContainerRef,
    pendingScrollPageRef,
    pendingScrollOffsetRef,
    pageSaveTimerRef,
    lastSavedPageRef,
    setCurrentPage,
    setDualFlipDir,
    setDualFlipKey,
    setArrivalGlowKey,
    resetWheelTurnAccum,
  });

  useLayoutEffect(() => {
    viewportActionsRef.current = { scrollToRenderedPage, goToNextPage, goToPrevPage };
  }, [scrollToRenderedPage, goToNextPage, goToPrevPage]);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => observeDocumentFullscreen(setIsFullscreen), []);

  useEffect(() => {
    return () => {
      stopTts();
      cancelPendingPageSave();
    };
  }, [cancelPendingPageSave]);

  const changeLanguage = useCallback(() => {
    setLang((current) => {
      const next = current === 'ar' ? 'en' : 'ar';
      saveLanguage(next);
      return next;
    });
  }, []);

  const changeFont = useCallback((nextFont: FontFamilyId) => {
    setFontFamily(nextFont);
    saveFont(nextFont);
  }, []);

  const changeViewMode = useCallback(
    (nextMode: ViewMode) => {
      if (!['single', 'dual', 'continuous'].includes(nextMode)) return;
      if (nextMode === 'continuous' && currentPage > 1) {
        pendingScrollPageRef.current = currentPage;
      }
      setViewMode(nextMode);
      saveViewMode(nextMode);
      if (beamService.getRole() === 'sender') beamService.sendViewMode(nextMode);
      if (basePageSize.width && basePageSize.height && typeof window !== 'undefined') {
        const fit = computeOptimalPageScale(
          basePageSize.width,
          basePageSize.height,
          scrollContainerRef.current?.clientWidth || window.innerWidth,
          (scrollContainerRef.current?.clientHeight || window.innerHeight) - chromeInset,
          nextMode
        );
        lastFitScaleRef.current = fit;
        setFitScaleState(fit);
        setZoom(fit);
      }
    },
    [basePageSize, chromeInset, currentPage, lastFitScaleRef, scrollContainerRef, setFitScaleState, setZoom]
  );

  const {
    annotations,
    setAnnotations,
    annotationSaveStatus,
    bookmarks,
    setBookmarks,
    annotationsGenerationRef,
    annotationsHydratedRef,
    bookmarksHydratedRef,
    mergeRemoteAnnotations,
    toggleBookmark,
    addAnnotation,
    deleteAnnotation,
    updateAnnotationNote,
    exportBackup,
    importBackup,
  } = useReaderBookmarksAndAnnotations({
    docId,
    currentPage,
    changeTheme,
    changeViewMode,
    changeFont,
    setLang,
  });

  const {
    loadDocumentRef,
    closeDocument,
    handlePasswordCancel,
    handlePasswordSubmit,
    openFile,
    openSample,
    loadDocumentBytes,
    openRecent,
  } = useReaderDocumentLoader({
    dragDropEnabled: capabilities.dragDrop,
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
  });

  const handleBackStep = useCallback((): boolean => {
    if (executeBackStep()) return true;

    if (typeof window !== 'undefined') {
      const backEvent = new CustomEvent('otium:back', { cancelable: true });
      window.dispatchEvent(backEvent);
      if (backEvent.defaultPrevented) return true;
    }

    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      selection.removeAllRanges();
      return true;
    }
    if (passwordModal.isOpen) {
      handlePasswordCancel();
      return true;
    }
    if (isImmersive) {
      setIsImmersive(false);
      return true;
    }
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return true;
    }
    if (isSearchOpen) {
      setIsSearchOpen(false);
      setSearchQuery('');
      setActiveSearchPage(null);
      return true;
    }
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
      return true;
    }
    if (doc) {
      closeDocument();
      return true;
    }
    return false;
  }, [
    closeDocument,
    doc,
    handlePasswordCancel,
    isImmersive,
    isSearchOpen,
    isSettingsOpen,
    isSidebarOpen,
    passwordModal.isOpen,
    setIsSearchOpen,
    setIsSettingsOpen,
    setIsSidebarOpen,
  ]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__OTIUM_HANDLE_BACK__ = handleBackStep;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (handleBackStep()) event.preventDefault();
    };
    window.addEventListener('keydown', handleEscape);

    let isPopping = false;
    const handlePopState = () => {
      if (isPopping) return;
      isPopping = true;
      const stepped = handleBackStep();
      if (stepped) {
        window.history.pushState(null, '', window.location.href);
      }
      setTimeout(() => {
        isPopping = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.href);

    return () => {
      delete (window as unknown as Record<string, unknown>).__OTIUM_HANDLE_BACK__;
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handleBackStep]);

  useReaderBeamSync({
    doc,
    docTitle,
    currentPage,
    numPages,
    lang,
    isLoading,
    docId,
    beamState,
    beamSelection,
    scrollContainerRef,
    scrollToPage,
    goToNextPage,
    goToPrevPage,
    changeTheme,
    changeViewMode,
    loadDocumentRef,
    setIsLoading,
    setDocumentError,
  });

  const handleToggleFullscreen = useCallback(() => {
    toggleDocumentFullscreen();
  }, []);

  const numberJumpDisplay = useReaderKeyboardShortcuts({
    enabled: capabilities.keyboard,
    numPages,
    currentPage,
    viewMode,
    theme,
    docIsRtl,
    scrollContainerRef,
    lastFitScaleRef,
    setZoom,
    getMinZoom,
    getMaxZoom,
    getFitScale,
    scrollToPage,
    goToNextPage,
    goToPrevPage,
    changeTheme,
    changeViewMode,
    toggleBookmark,
    handleToggleFullscreen,
    setIsSearchOpen,
    setIsSidebarOpen,
  });

  const handleSearchQueryChange = useCallback((query: string, page: number | null) => {
    setSearchQuery(query);
    setActiveSearchPage(page);
  }, []);

  const openSearchWithText = useCallback(
    (text: string) => {
      const query = text.replace(/\s+/g, ' ').trim().slice(0, 96);
      setIsSearchOpen(true);
      setSearchSeed(query ? { query, id: Date.now() } : null);
    },
    [setIsSearchOpen]
  );

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setActiveSearchPage(null);
    setSearchSeed(null);
  }, [setIsSearchOpen]);

  const changeMobileNavVisibility = useCallback((visible: boolean) => {
    setShowMobileNavBar(visible);
    saveMobileNavVisible(visible);
  }, []);

  const resetDefaults = useCallback(() => {
    changeFont('tajawal');
    changeViewMode('continuous');
    changeTheme('paper');
    changeThemeSchedule('manual');
    changeDayTheme('paper');
    changeNightTheme('amoled');
    changeRememberDocTheme(true);
    setShowMobileNavBar(true);
    saveMobileNavVisible(true);
  }, [
    changeDayTheme,
    changeFont,
    changeNightTheme,
    changeRememberDocTheme,
    changeTheme,
    changeThemeSchedule,
    changeViewMode,
  ]);

  const renameCurrentDocument = useCallback(
    (newTitle: string) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      setDocTitle(trimmed);
      if (docId) {
        void renameStoredDocument(docId, trimmed);
      }
    },
    [docId]
  );

  return {
    doc,
    docTitle,
    docId,
    numPages,
    currentPage,
    zoom,
    minZoom,
    maxZoom,
    getFitScale,
    setZoom,
    captureZoomAnchor,
    clearZoomAnchor,
    theme,
    themeSchedule,
    dayTheme,
    nightTheme,
    rememberDocTheme,
    keepScreenAwake,
    arrivalGlowKey,
    viewMode,
    lang,
    fontFamily,
    showMobileNavBar,
    isImmersive,
    setIsImmersive,
    baseAspectRatio,
    basePageSize,
    isSidebarOpen,
    isSearchOpen,
    isSettingsOpen,
    isFullscreen,
    isLoading,
    loadProgress,
    documentError,
    searchQuery,
    activeSearchPage,
    searchSeed,
    annotations,
    annotationSaveStatus,
    beamSelection,
    receiveBeamSelection,
    mergeRemoteAnnotations,
    bookmarks,
    passwordModal,
    dualFlipKey,
    dualFlipDir,
    fileSizeBytes,
    numberJumpDisplay,
    renameDocument: renameCurrentDocument,
    scrollContainerRef,
    openFile,
    openSample,
    openRecent,
    closeDocument,
    setDocumentError,
    clearDocumentError: () => setDocumentError(null),
    handlePageVisible,
    scrollToPage,
    goToNextPage,
    goToPrevPage,
    changeTheme,
    changeThemeSchedule,
    changeDayTheme,
    changeNightTheme,
    changeRememberDocTheme,
    changeKeepScreenAwake,
    changeLanguage,
    changeFont,
    changeViewMode,
    changeMobileNavVisibility,
    toggleBookmark,
    addAnnotation,
    deleteAnnotation,
    updateAnnotationNote,
    exportBackup,
    importBackup,
    handlePasswordSubmit,
    handlePasswordCancel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleToggleFullscreen,
    handleSearchQueryChange,
    openSearchWithText,
    closeSearch,
    setIsSidebarOpen,
    setIsSearchOpen,
    setIsSettingsOpen,
    resetDefaults,
    docIsRtl,
    readingDirection,
    changeReadingDirection,
    loadDocumentBytes,
    beamRoom: beamState.room,
    beamPeerConnected,
    autoBeam,
    beamRole: beamState.role,
    disconnectBeam: () => beamService.disconnect(),
  };
}

export type ReaderController = ReturnType<typeof useReaderController>;
