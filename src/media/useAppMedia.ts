import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderController } from '../app/useReaderController';
import type { RecentDocItem } from '../core/storage/documents';
import { describeFile, validateFile } from './media';
import { registerIncomingDocumentHandler } from '../platform/incomingDocument';
import { loadMedia, mediaKind, newMediaItem, storeMedia, updateMedia, type MediaLibraryItem, type MediaProgress } from './library';
export type ActiveMedia = { file: File; item: MediaLibraryItem; saved: boolean };
export function useAppMedia(reader: ReaderController) {
  const [active, setActive] = useState<ActiveMedia | null>(null);
  const [pending, setPending] = useState(false);
  const [nativePending, setNativePending] = useState(false);
  const nativeRequest = useRef<{ id?: string; ticket: number } | null>(null);
  const current = useRef<ActiveMedia | null>(null), progress = useRef<MediaProgress>({ lastPage: 1, totalPages: 1, position: 0 });
  const generation = useRef(0);
  const dirty = useRef(false);
  const { openFile: openPdf, openRecent: openRecentPdf, closeDocument, setDocumentError } = reader;
  const commit = useCallback((value: ActiveMedia | null) => { current.current = value; setActive(value); dirty.current = false; if (value) progress.current = value.item; }, []);
  const persist = useCallback(async () => {
    if (!current.current?.saved || !dirty.current) return;
    const source = current.current, snapshot = progress.current;
    dirty.current = false;
    try { await updateMedia(source.item.id, snapshot); }
    catch { if (current.current === source) dirty.current = true; }
  }, []);
  const incomingActions = useRef({ reader, persist, commit });
  useEffect(() => { incomingActions.current = { reader, persist, commit }; });
  useEffect(() => registerIncomingDocumentHandler(async incoming => {
    const ticket = nativeRequest.current?.id === incoming.id && nativeRequest.current ? nativeRequest.current.ticket : ++generation.current;
    if (ticket !== generation.current) return false;
    const actions = incomingActions.current;
    await actions.persist();
    if (ticket !== generation.current) return false;
    const opened = await actions.reader.loadDocumentBytes(incoming.data, incoming.name);
    if (ticket !== generation.current) return false;
    if (opened) actions.commit(null);
    return opened;
  }, message => incomingActions.current.reader.setDocumentError(message), (reading, id) => {
    if (reading) {
      if (!nativeRequest.current || nativeRequest.current.id !== id) nativeRequest.current = { id, ticket: ++generation.current };
      setNativePending(true);
    } else {
      if (id && nativeRequest.current?.id !== id) return;
      nativeRequest.current = null; setNativePending(false);
    }
  }), []);
  useEffect(() => {
    const timer = window.setInterval(() => { void persist(); }, 5000);
    const flush = () => { void persist(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => { window.clearInterval(timer); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', flush); void persist(); };
  }, [persist]);
  const close = useCallback(async () => { const ticket = ++generation.current; await persist(); if (ticket !== generation.current) return; current.current = null; setActive(null); setPending(false); }, [persist]);
  const open = useCallback(async (file: File) => {
    if (describeFile(file.name).kind !== 'pdf') {
      const problem = validateFile(file);
      if (problem || !mediaKind(file)) { setDocumentError(problem || 'هذه الصيغة غير مدعومة بعد.'); return; }
    }
    const ticket = ++generation.current;
    setPending(true);
    try {
      await persist();
      if (ticket !== generation.current) return;
      if (describeFile(file.name).kind === 'pdf') {
        const opened = await openPdf(file);
        if (ticket === generation.current && opened !== false) commit(null);
      } else {
        const item = newMediaItem(file);
        const saved = await storeMedia(file, item).catch(() => false);
        if (ticket !== generation.current) return;
        closeDocument(); commit({ file, item, saved });
      }
    } catch (error) { if (ticket === generation.current) setDocumentError(error instanceof Error ? error.message : 'تعذر فتح الملف.'); }
    finally { if (ticket === generation.current) setPending(false); }
  }, [persist, commit, openPdf, closeDocument, setDocumentError]);
  const openRecent = useCallback(async (item: RecentDocItem) => {
    const ticket = ++generation.current; setPending(true);
    try {
      await persist();
      if (ticket !== generation.current) return;
      if (!item.id.startsWith('media:')) {
        const opened = await openRecentPdf(item);
        if (ticket === generation.current && opened !== false) commit(null);
        return;
      }
      const stored = await loadMedia(item.id);
      if (ticket !== generation.current) return;
      closeDocument(); commit({ ...stored, saved: true });
    } catch (error) { if (ticket === generation.current) setDocumentError(error instanceof Error ? error.message : 'تعذر فتح الملف المحفوظ.'); }
    finally { if (ticket === generation.current) setPending(false); }
  }, [persist, commit, closeDocument, openRecentPdf, setDocumentError]);
  const updateProgress = useCallback((value: MediaProgress) => {
    if (value.lastPage !== progress.current.lastPage || value.totalPages !== progress.current.totalPages || value.position !== progress.current.position) {
      progress.current = value; dirty.current = true;
    }
  }, []);
  return { active, pending: pending || nativePending, open, openRecent, close, updateProgress };
}
