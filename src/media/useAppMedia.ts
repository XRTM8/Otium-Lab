import { useCallback, useRef, useState } from 'react';
import type { ReaderController } from '../app/useReaderController';
import type { RecentDocItem } from '../core/storage/documents';
import { describeFile, validateFile } from './media';
import { loadMedia, mediaKind, newMediaItem, storeMedia, updateMedia, type MediaLibraryItem, type MediaProgress } from './library';
export type ActiveMedia = { file: File; item: MediaLibraryItem; saved: boolean };
export function useAppMedia(reader: ReaderController) {
  const [active, setActive] = useState<ActiveMedia | null>(null);
  const [pending, setPending] = useState(false);
  const current = useRef<ActiveMedia | null>(null), progress = useRef<MediaProgress>({ lastPage: 1, totalPages: 1, position: 0 });
  const generation = useRef(0);
  const { openFile: openPdf, openRecent: openRecentPdf, closeDocument, setDocumentError } = reader;
  const commit = useCallback((value: ActiveMedia | null) => { current.current = value; setActive(value); if (value) progress.current = value.item; }, []);
  const persist = useCallback(async () => { if (current.current?.saved) await updateMedia(current.current.item.id, progress.current).catch(() => {}); }, []);
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
        await openRecentPdf(item);
        if (ticket === generation.current) commit(null);
        return;
      }
      const stored = await loadMedia(item.id);
      if (ticket !== generation.current) return;
      closeDocument(); commit({ ...stored, saved: true });
    } catch (error) { if (ticket === generation.current) setDocumentError(error instanceof Error ? error.message : 'تعذر فتح الملف المحفوظ.'); }
    finally { if (ticket === generation.current) setPending(false); }
  }, [persist, commit, closeDocument, openRecentPdf, setDocumentError]);
  const updateProgress = useCallback((value: MediaProgress) => { progress.current = value; }, []);
  return { active, pending, open, openRecent, close, updateProgress };
}
