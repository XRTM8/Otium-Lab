import React, { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { TeacherDock, type InkTool } from './TeacherDock';
import { useTeaching } from './teachingContextValue';
import { useAnnotationDelivery } from './useAnnotationDelivery';
import type { ReaderController } from '../app/useReaderController';
import { EMPTY_INK, inkHistory, mergeInk, readInk, writeInk, type InkMark } from '../core/annotations/ink';
import { beamService } from '../board/beam/beamService';
import { mergeTextAnnotations } from '../core/annotations/textSync';
import type { AnnotationRect, TextAnnotation } from '../core/types';
import { InkContext } from './documentInkContext';

export { DocumentInkLayer } from './DocumentInkLayer';

interface DocSyncState {
  docId: string;
  loadedId: string;
  status: 'loading' | 'saved' | 'saving' | 'error';
  message: string;
}

export function DocumentInkProvider({ reader, children }: { reader: ReaderController; children: React.ReactNode }) {
  const { receiveBeamSelection, mergeRemoteAnnotations } = reader;
  const docKey = reader.docId ?? '';
  const [history, dispatch] = useReducer(inkHistory, EMPTY_INK);
  const teaching = useTeaching();
  const toolScope = `${teaching.target}:${teaching.layout}:${docKey}`;
  const [toolState, setToolState] = useState<{ scope: string; tool: InkTool }>({ scope: toolScope, tool: 'hand' });
  const [docSync, setDocSync] = useState<DocSyncState>({ docId: docKey, loadedId: '', status: 'loading', message: '' });
  const [exportState, setExportState] = useState<{ exporting: boolean; message: string }>({ exporting: false, message: '' });

  const tool = toolState.scope === toolScope ? toolState.tool : 'hand';
  const setTool = useCallback((next: InkTool) => {
    setToolState({ scope: toolScope, tool: next });
  }, [toolScope]);

  const activeSync = docSync.docId === docKey ? docSync : { docId: docKey, loadedId: '', status: 'loading' as const, message: '' };
  const loadedId = activeSync.loadedId;
  const status = activeSync.status;
  const syncMessage = activeSync.message;

  const { color, width: size, stylusOnly: stylus } = teaching.prefs;
  const { delivery, send, acknowledge } = useAnnotationDelivery(reader);

  const saveQueue = useRef(Promise.resolve());
  const documentRef = useRef(reader.docId);
  const marksRef = useRef(history.present);
  const sharedMarks = useRef<InkMark[]>([]);
  const annotationsRef = useRef(reader.annotations);
  const sharedAnnotations = useRef<TextAnnotation[]>([]);

  useLayoutEffect(() => {
    annotationsRef.current = reader.annotations;
  }, [reader.annotations]);

  useLayoutEffect(() => {
    documentRef.current = reader.docId;
    marksRef.current = history.present;
  }, [reader.docId, history.present]);

  const ready = !!reader.doc && loadedId === reader.docId;
  const ar = reader.lang === 'ar';
  const change = (marks: InkMark[]) => dispatch({ type: 'change', marks });
  const selectionBroadcast = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (selectionBroadcast.current) clearTimeout(selectionBroadcast.current);
  }, [reader.docId, reader.beamRoom]);

  const publishSelection = useCallback((selection: { page: number; rects: AnnotationRect[] } | null) => {
    if (selectionBroadcast.current) clearTimeout(selectionBroadcast.current);
    if (!reader.docId || !reader.beamRoom || !reader.beamPeerConnected) return;
    const sendSelection = () => {
      selectionBroadcast.current = null;
      void beamService.broadcast({
        type: 'BEAM_SELECTION',
        roomCode: reader.beamRoom!,
        selection: { documentId: reader.docId!, page: selection?.page || 1, rects: selection?.rects || [] },
        timestamp: Date.now(),
      });
    };
    if (!selection) sendSelection();
    else selectionBroadcast.current = setTimeout(sendSelection, 90);
  }, [reader.docId, reader.beamRoom, reader.beamPeerConnected]);

  useEffect(() => {
    publishSelection(null);
  }, [teaching.target, teaching.layout, publishSelection]);

  useEffect(() => {
    if (teaching.target !== 'document' || !ready) return;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]') || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [teaching.target, ready]);

  useEffect(() => {
    let alive = true;
    const currentId = reader.docId;
    if (!currentId) return;
    void saveQueue.current
      .catch(() => {})
      .then(() => readInk(currentId))
      .then((marks) => {
        if (!alive) return;
        sharedMarks.current = marks;
        dispatch({ type: 'load', marks });
        setDocSync({ docId: currentId, loadedId: currentId, status: 'saved', message: '' });
      })
      .catch(() => {
        if (alive) {
          setDocSync({ docId: currentId, loadedId: '', status: 'error', message: 'load-error' });
        }
      });
    return () => {
      alive = false;
    };
  }, [reader.docId]);

  useEffect(() => {
    sharedAnnotations.current = [];
  }, [reader.docId]);

  useEffect(() => {
    if (!reader.docId || !reader.beamRoom || !reader.beamPeerConnected) return;
    const documentId = reader.docId;
    const roomCode = reader.beamRoom;
    const unsubscribe = beamService.subscribe((msg) => {
      if (msg.type === 'BEAM_SELECTION' && msg.selection?.documentId === documentId) {
        if (msg.selection.page <= reader.numPages) receiveBeamSelection(msg.selection.page, msg.selection.rects);
        return;
      }
      if (msg.annotationSync?.documentId !== documentId) return;
      if (msg.type === 'BEAM_TEXT_ANNOTATIONS_REQUEST') {
        send({ type: 'BEAM_TEXT_ANNOTATIONS', roomCode, annotationSync: { documentId, upsert: annotationsRef.current }, timestamp: Date.now() });
      } else if (msg.type === 'BEAM_TEXT_ANNOTATIONS') {
        acknowledge(msg);
        const merged = mergeTextAnnotations(annotationsRef.current, msg.annotationSync.upsert, msg.annotationSync.deleted);
        sharedAnnotations.current = merged;
        annotationsRef.current = merged;
        mergeRemoteAnnotations(msg.annotationSync.upsert || [], msg.annotationSync.deleted || []);
      }
    });
    send({ type: 'BEAM_TEXT_ANNOTATIONS', roomCode, annotationSync: { documentId, upsert: annotationsRef.current }, timestamp: Date.now() });
    void beamService.broadcast({ type: 'BEAM_TEXT_ANNOTATIONS_REQUEST', roomCode, annotationSync: { documentId }, timestamp: Date.now() });
    return unsubscribe;
  }, [reader.docId, reader.beamRoom, reader.beamPeerConnected, reader.numPages, receiveBeamSelection, mergeRemoteAnnotations, send, acknowledge]);

  useEffect(() => {
    const previous = new Map(sharedAnnotations.current.map((a) => [a.id, a]));
    const current = new Set(reader.annotations.map((a) => a.id));
    const upsert = reader.annotations.filter((a) => JSON.stringify(previous.get(a.id)) !== JSON.stringify(a));
    const deleted = [...previous.keys()].filter((id) => !current.has(id));
    sharedAnnotations.current = reader.annotations;
    if (!reader.docId || !reader.beamRoom || !reader.beamPeerConnected || (!upsert.length && !deleted.length)) return;
    send({
      type: 'BEAM_TEXT_ANNOTATIONS',
      roomCode: reader.beamRoom,
      annotationSync: { documentId: reader.docId, upsert, deleted },
      timestamp: Date.now(),
    });
  }, [reader.annotations, reader.docId, reader.beamRoom, reader.beamPeerConnected, send]);

  useEffect(() => {
    if (!ready || !reader.docId || !reader.beamPeerConnected || !reader.beamRoom) return;
    const roomCode = reader.beamRoom;
    const documentId = reader.docId;
    const unsubscribe = beamService.subscribe((msg) => {
      if (!msg.ink || msg.ink.documentId !== documentId) return;
      if (msg.type === 'BEAM_INK_REQUEST') {
        send({ type: 'BEAM_INK_UPDATE', roomCode, ink: { documentId, upsert: marksRef.current }, timestamp: Date.now() });
      } else if (msg.type === 'BEAM_INK_UPDATE') {
        acknowledge(msg);
        const marks = mergeInk(marksRef.current, msg.ink.upsert, msg.ink.deleted);
        if (JSON.stringify(marks) === JSON.stringify(marksRef.current)) return;
        sharedMarks.current = marks;
        marksRef.current = marks;
        dispatch({ type: 'remote', upsert: msg.ink.upsert, deleted: msg.ink.deleted });
      }
    });
    send({ type: 'BEAM_INK_UPDATE', roomCode, ink: { documentId, upsert: marksRef.current }, timestamp: Date.now() });
    void beamService.broadcast({ type: 'BEAM_INK_REQUEST', roomCode, ink: { documentId }, timestamp: Date.now() });
    return unsubscribe;
  }, [ready, reader.docId, reader.beamPeerConnected, reader.beamRoom, send, acknowledge]);

  useEffect(() => {
    if (!ready) return;
    const previous = new Map(sharedMarks.current.map((mark) => [mark.id, mark]));
    const current = new Set(history.present.map((mark) => mark.id));
    const upsert = history.present.filter((mark) => JSON.stringify(previous.get(mark.id)) !== JSON.stringify(mark));
    const deleted = [...previous.keys()].filter((id) => !current.has(id));
    sharedMarks.current = history.present;
    if ((!upsert.length && !deleted.length) || !reader.beamPeerConnected || !reader.beamRoom || !reader.docId) return;
    send({ type: 'BEAM_INK_UPDATE', roomCode: reader.beamRoom, ink: { documentId: reader.docId, upsert, deleted }, timestamp: Date.now() });
  }, [history.revision, history.present, ready, reader.beamPeerConnected, reader.beamRoom, reader.docId, send]);

  useEffect(() => {
    if (!ready || !history.revision) return;
    const id = loadedId;
    let alive = true;
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => {
        if (alive && documentRef.current === id) {
          setDocSync({ docId: id, loadedId: id, status: 'saving', message: '' });
        }
        return writeInk(id, history.present);
      });
    void saveQueue.current
      .then(() => {
        if (alive && documentRef.current === id) {
          setDocSync({ docId: id, loadedId: id, status: 'saved', message: '' });
        }
      })
      .catch(() => {
        if (alive && documentRef.current === id) {
          setDocSync({ docId: id, loadedId: id, status: 'error', message: 'save-error' });
        }
      });
    return () => {
      alive = false;
    };
  }, [history.revision, history.present, ready, loadedId]);

  const exportPdf = async () => {
    if (!reader.doc || exportState.exporting) return;
    setExportState({ exporting: true, message: '' });
    try {
      const { exportInkPdf } = await import('../core/annotations/inkExport');
      await exportInkPdf(
        reader.doc,
        history.present,
        reader.docTitle || 'Otium',
        (page) => setExportState({ exporting: true, message: ar ? `تجهيز شرح الصفحة ${page}…` : `Preparing page ${page}…` }),
        reader.annotations
      );
      setExportState({ exporting: false, message: ar ? 'تم تجهيز نسخة PDF المشروحة' : 'Annotated PDF ready' });
    } catch (error) {
      setExportState({ exporting: false, message: error instanceof Error ? error.message : (ar ? 'تعذر التصدير' : 'Export failed') });
    }
  };

  const documentStatus =
    status === 'error' || reader.annotationSaveStatus === 'error'
      ? 'error'
      : status === 'saving' || reader.annotationSaveStatus === 'saving'
        ? 'saving'
        : status;

  const rawMessage = exportState.message || syncMessage;
  const displayMessage =
    rawMessage === 'load-error'
      ? (ar ? 'تعذر تحميل الشرح. أعد فتح الملف قبل التعديل.' : 'Could not load annotations. Reopen before editing.')
      : rawMessage === 'save-error'
        ? (ar ? 'لم يُحفظ آخر تعديل. صدّر نسخة قبل الإغلاق.' : 'Save failed. Export a copy before closing.')
        : rawMessage;

  return (
    <InkContext.Provider
      value={{
        ready,
        tool: teaching.target === 'document' && !teaching.presentation ? tool : 'hand',
        color,
        size,
        stylus,
        marks: ready ? history.present : [],
        change,
        setTool,
        publishSelection,
      }}
    >
      {children}
      {/* Phone keeps its document annotation dock (including text selection),
          while the desktop dock appears only in the board workspace. */}
      {(teaching.mobile || teaching.layout !== 'document') && (
        <TeacherDock
          reader={reader}
          ink={{
            ready,
            tool,
            setTool,
            canUndo: !!history.past.length,
            canRedo: !!history.future.length,
            undo: () => dispatch({ type: 'undo' }),
            redo: () => dispatch({ type: 'redo' }),
            clear: () => change([]),
            status: documentStatus,
            delivery,
            exporting: exportState.exporting,
            exportPdf: () => void exportPdf(),
            message: displayMessage,
          }}
        />
      )}
    </InkContext.Provider>
  );
}
