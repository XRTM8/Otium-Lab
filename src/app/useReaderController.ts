import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  FontFamilyId,
  ReadingDirection,
  ViewMode,
} from '../core/types';
import type { Language } from '../core/i18n/translations';
import { applyFontFamily, getSavedFont } from '../core/settings/fonts';
import {
  loadLanguage,
  loadMobileNavVisible,
  loadReadingDirection,
  loadViewMode,
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
  type PasswordModalState,
  type ReaderCapabilities,
} from './readerControllerHelpers';
import { useReaderThemeAndWake } from './useReaderThemeAndWake';
import { useReaderViewportAndZoom } from './useReaderViewportAndZoom';
import { useReaderNavigation } from './useReaderNavigation';
import { useReaderBookmarksAndAnnotations } from './useReaderBookmarksAndAnnotations';
import { useReaderDocumentLoader } from './useReaderDocumentLoader';
import { useReaderBeamSync } from './useReaderBeamSync';
import { useReaderKeyboardShortcuts } from './useReaderKeyboardShortcuts';
import { useReaderBackNavigation } from './useReaderBackNavigation';
import { useReaderBeamState } from './useReaderBeamState';
import { useReaderDocumentActions } from './useReaderDocumentActions';

export type { ReaderCapabilities } from './readerControllerHelpers';

function useOverlayFlag(onOpen: () => void) {
  const [value, setRaw] = useState(false);
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  const setValue = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === 'function' ? next(ref.current) : next;
      setRaw(resolved);
      if (resolved) onOpen();
    },
    [onOpen]
  );
  return [value, setValue] as const;
}

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

  const exitImmersive = useCallback(() => setIsImmersive(false), []);
  const [isSidebarOpen, setIsSidebarOpen] = useOverlayFlag(exitImmersive);
  const [isSearchOpen, setIsSearchOpen] = useOverlayFlag(exitImmersive);
  const [isSettingsOpen, setIsSettingsOpen] = useOverlayFlag(exitImmersive);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchPage, setActiveSearchPage] = useState<number | null>(null);
  const [searchSeed, setSearchSeed] = useState<{ query: string; id: number } | null>(null);
  const [passwordModal, setPasswordModal] = useState<PasswordModalState>(EMPTY_PASSWORD_MODAL);
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);

  const {
    beamState,
    beamPeerConnected,
    beamSelection,
    receiveBeamSelection,
  } = useReaderBeamState(docId);

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

  useEffect(() => {
    return () => {
      stopTts();
      cancelPendingPageSave();
    };
  }, [cancelPendingPageSave]);

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
    changeLanguage,
    changeFont,
    handleSearchQueryChange,
    openSearchWithText,
    closeSearch,
    changeMobileNavVisibility,
    resetDefaults,
    renameCurrentDocument,
  } = useReaderDocumentActions({
    docId,
    setLang,
    setFontFamily,
    setDocTitle,
    setSearchQuery,
    setActiveSearchPage,
    setSearchSeed,
    setIsSearchOpen,
    setShowMobileNavBar,
    changeTheme,
    changeThemeSchedule,
    changeDayTheme,
    changeNightTheme,
    changeRememberDocTheme,
    changeViewMode,
  });

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

  const { isFullscreen, handleToggleFullscreen } = useReaderBackNavigation({
    doc,
    passwordModalOpen: passwordModal.isOpen,
    isImmersive,
    isSettingsOpen,
    isSearchOpen,
    isSidebarOpen,
    handlePasswordCancel,
    setIsImmersive,
    setIsSettingsOpen,
    setIsSearchOpen,
    setIsSidebarOpen,
    setSearchQuery,
    setActiveSearchPage,
    closeDocument,
  });

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
