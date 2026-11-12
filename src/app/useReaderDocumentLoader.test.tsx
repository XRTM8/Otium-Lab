// @vitest-environment happy-dom
import { act, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { BookmarkItem, TextAnnotation, ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { EMPTY_PASSWORD_MODAL } from './readerControllerHelpers';
import { useReaderDocumentLoader } from './useReaderDocumentLoader';

const pdfMocks = vi.hoisted(() => ({
  openPdf: vi.fn(),
  isPdfBuffer: vi.fn((buf: ArrayBuffer) => {
    const view = new Uint8Array(buf);
    return view.length >= 4 && view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 && view[3] === 0x46;
  }),
}));

vi.mock('../core/pdf/document', () => ({
  openPdf: pdfMocks.openPdf,
  isPdfBuffer: pdfMocks.isPdfBuffer,
}));

describe('useReaderDocumentLoader', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    pdfMocks.openPdf.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects non-PDF bytes cleanly, loads a valid PDF buffer, and resets state on closeDocument', async () => {
    const fakePage = {
      getViewport: vi.fn(() => ({ width: 595, height: 842 })),
      getTextContent: vi.fn(async () => ({ items: [{ str: 'Hello World' }] })),
    };
    const fakeDoc = {
      numPages: 3,
      getPage: vi.fn(async () => fakePage),
      destroy: vi.fn(async () => {}),
    } as unknown as PDFDocumentProxy;

    pdfMocks.openPdf.mockImplementation(() => ({
      loadingTask: { destroy: vi.fn(async () => {}) },
      promise: Promise.resolve({
        doc: fakeDoc,
        numPages: 3,
        basePageSize: { width: 595, height: 842 },
        baseAspectRatio: 595 / 842,
      }),
    }));

    const ref: {
      current: {
        loader: ReturnType<typeof useReaderDocumentLoader>;
        doc: PDFDocumentProxy | null;
        docTitle: string;
        numPages: number;
        documentError: string | null;
      } | null;
    } = { current: null };

    function Harness() {
      const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
      const [docTitle, setDocTitle] = useState('');
      const [docId, setDocId] = useState('');
      const [numPages, setNumPages] = useState(0);
      const [, setCurrentPage] = useState(1);
      const [, setAnnotations] = useState<TextAnnotation[]>([]);
      const [, setBookmarks] = useState<BookmarkItem[]>([]);
      const [, setBasePageSize] = useState({ width: 0, height: 0 });
      const [, setBaseAspectRatio] = useState(0);
      const [, setSearchQuery] = useState('');
      const [, setActiveSearchPage] = useState<number | null>(null);
      const [, setSearchSeed] = useState<{ query: string; id: number } | null>(null);
      const [, setIsSearchOpen] = useState(false);
      const [, setIsSidebarOpen] = useState(false);
      const [, setIsSettingsOpen] = useState(false);
      const [, setIsImmersive] = useState(false);
      const [documentError, setDocumentError] = useState<string | null>(null);
      const [, setIsLoading] = useState(false);
      const [, setLoadProgress] = useState<number | null>(null);
      const [, setDetectedDocIsRtl] = useState(false);
      const [, setFitScaleState] = useState(1);
      const [, setZoom] = useState(1);
      const [, setFileSizeBytes] = useState(0);
      const [passwordModal, setPasswordModal] = useState(EMPTY_PASSWORD_MODAL);
      const lang: Language = 'en';
      const langRef = useRef<Language>('en');
      const docRef = useRef<PDFDocumentProxy | null>(null);
      const docIdRef = useRef(docId);
      const annotationsGenerationRef = useRef(0);
      const annotationsHydratedRef = useRef(false);
      const bookmarksHydratedRef = useRef(false);
      const pendingScrollPageRef = useRef<number | null>(null);
      const pendingScrollOffsetRef = useRef<number | null>(null);
      const pageSaveTimerRef = useRef<number | null>(null);
      const currentPageRef = useRef(1);
      const scrollContainerRef = useRef<HTMLDivElement | null>(null);
      const lastFitScaleRef = useRef(1);
      const rememberDocThemeRef = useRef(true);
      const themeScheduleRef = useRef<'manual' | 'system' | 'sunset'>('manual');
      const dayThemeRef = useRef<ThemeMode>('paper');
      const nightThemeRef = useRef<ThemeMode>('midnight');

      useLayoutEffect(() => {
        docRef.current = doc;
        docIdRef.current = docId;
      }, [doc, docId]);

      const loader = useReaderDocumentLoader({
        dragDropEnabled: false,
        lang,
        langRef,
        viewMode: 'single',
        chromeInset: 0,
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
        changeTheme: vi.fn(),
      });
      useEffect(() => {
        ref.current = { loader, doc, docTitle, numPages, documentError };
        scrollContainerRef.current = host;
      });
      return <div />;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    const badBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    let badOk = true;
    await act(async () => {
      badOk = await ref.current!.loader.loadDocumentBytes(badBytes, 'broken.pdf');
    });
    expect(badOk).toBe(false);
    expect(ref.current!.documentError).toBeTruthy();

    const validBytes = new TextEncoder().encode('%PDF-1.4\n').buffer;
    let goodOk = false;
    await act(async () => {
      goodOk = await ref.current!.loader.loadDocumentBytes(validBytes, 'lecture.pdf');
    });
    expect(goodOk).toBe(true);
    expect(ref.current!.doc).toBe(fakeDoc);
    expect(ref.current!.docTitle).toBe('lecture.pdf');
    expect(ref.current!.numPages).toBe(3);

    await act(async () => {
      ref.current!.loader.closeDocument();
    });
    expect(ref.current!.doc).toBeNull();
    expect(ref.current!.numPages).toBe(0);
  });
});
