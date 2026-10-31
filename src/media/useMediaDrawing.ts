import { useEffect, useRef, useState } from 'react';
import { loadDrawing, saveDrawing } from './library';
import type { InkStroke, MediaDrawing } from './drawing';
type History = { past: InkStroke[][]; present: InkStroke[]; future: InkStroke[][] };
const empty: History = { past: [], present: [], future: [] };
export function useMediaDrawing(id: string, saved: boolean, persistent: boolean, page: number) {
  const [pages, setPages] = useState<Record<number, History>>({});
  const [status, setStatus] = useState<'loading' | 'saved' | 'saving' | 'session' | 'error'>(persistent && saved ? 'loading' : 'session');
  const [message, setMessage] = useState('');
  const [restored, setRestored] = useState(!(persistent && saved));
  const drawing = useRef<MediaDrawing>({}), history = useRef<Record<number, History>>({});
  const queue = useRef(Promise.resolve()), sequence = useRef(0), mounted = useRef(false);
  useEffect(() => {
    let cancelled = false; mounted.current = true;
    if (persistent && saved) void loadDrawing(id).then(value => {
      if (cancelled) return;
      drawing.current = value;
      const initial = Object.fromEntries(Object.entries(value).map(([key, present]) => [key, { past: [], present, future: [] }]));
      history.current = initial; setPages(initial); setRestored(true); setStatus('saved');
    }).catch(() => { if (!cancelled) { setStatus('error'); setMessage('تعذر تحميل الشرح؛ أعد فتح الملف لحماية النسخة المحفوظة.'); } });
    return () => { cancelled = true; mounted.current = false; };
  }, [id, persistent, saved]);
  const apply = (next: History) => {
    if (!restored) return;
    history.current = { ...history.current, [page]: next }; setPages(history.current);
    drawing.current = { ...drawing.current, [page]: next.present };
    if (!persistent || !saved) return;
    const snapshot = drawing.current, ticket = ++sequence.current;
    setStatus('saving'); setMessage('');
    queue.current = queue.current.catch(() => {}).then(() => saveDrawing(id, snapshot)).then(() => {
      if (mounted.current && ticket === sequence.current) setStatus('saved');
    }).catch(error => {
      if (mounted.current && ticket === sequence.current) { setStatus('error'); setMessage(error instanceof Error ? error.message : 'تعذر حفظ الشرح.'); }
    });
  };
  const current = pages[page] ?? empty;
  return { strokes: current.present, status, message, ready: restored,
    change: (present: InkStroke[]) => apply({ past: [...current.past.slice(-19), current.present], present, future: [] }),
    undo: () => { if (current.past.length) apply({ past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] }); },
    redo: () => { if (current.future.length) apply({ past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) }); },
    canUndo: !!current.past.length, canRedo: !!current.future.length,
    resetSession: () => { if (!persistent) { history.current = {}; drawing.current = {}; setPages({}); } }
  };
}
