import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FolderOpen, Palette, Maximize, EyeOff, Hand, PenLine, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReaderController } from '../app/useReaderController';
import type { ThemeMode } from '../core/types';
import { OtiumLogo } from '../components/OtiumLogo';
import { registerBackHandler } from '../core/navigation/backHandler';
import { useTeaching } from '../components/TeachingContext';
import { APP_FILE_ACCEPT, type MediaProgress } from './library';
import type { ActiveMedia } from './useAppMedia';
import { fitSize } from './media';
import { openPptx, type Deck } from './pptx';
import { Pptx } from './SlideView';
import { Player } from './Player';
import { Ink } from './Ink';
import './media.css';

export function MediaWorkspace({ source, reader, onClose, onOpen, onProgress }: {
  source: ActiveMedia; reader: ReaderController; onClose: () => void; onOpen: (file: File) => void; onProgress: (value: MediaProgress) => void;
}) {
  const ar = reader.lang === 'ar', label = (a: string, e: string) => ar ? a : e;
  const { setLayout } = useTeaching();
  const stage = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(''), [text, setText] = useState(''), [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState(''), [draw, setDraw] = useState(false), [hidden, setHidden] = useState(false);
  const [page, setPage] = useState(Math.max(1, source.item.lastPage)), [revision, setRevision] = useState(0), [color, setColor] = useState('#e11d48');
  const [dimensions, setDimensions] = useState({ width: 1600, height: 900 }), [space, setSpace] = useState({ width: 800, height: 450 });
  const position = useRef(source.item.position);
  const kind = source.item.mediaKind;
  const total = deck?.slides.length ?? 1;
  const themes: ThemeMode[] = ['paper', 'amoled', 'eink', 'midnight', 'amber', 'sakura', 'forest', 'nordic', 'parchment', 'pure'];
  useEffect(() => {
    setLayout('document');
    const controller = new AbortController();
    let objectUrl = '';
    void (async () => {
      try {
        if (kind === 'presentation') {
          const value = await openPptx(await source.file.arrayBuffer(), controller.signal);
          if (!controller.signal.aborted) { setDeck(value); setDimensions({ width: value.width, height: value.height }); setPage(valuePage => Math.min(valuePage, value.slides.length)); }
        } else if (kind === 'text') {
          const value = await source.file.text(); if (!controller.signal.aborted) setText(value);
        } else { objectUrl = URL.createObjectURL(source.file); setUrl(objectUrl); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'تعذر فتح الملف.'); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, kind, setLayout]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setSpace({ width, height }); });
    observer.observe(stage.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { onProgress({ lastPage: page, totalPages: total, position: position.current }); }, [page, total, onProgress]);
  useEffect(() => registerBackHandler(() => { if (hidden) setHidden(false); else onClose(); return true; }), [hidden, onClose]);
  const size = fitSize(space, dimensions);
  return <section className={`otium-media-viewer ${hidden ? 'media-focused' : ''}`} dir={ar ? 'rtl' : 'ltr'} aria-label={label('عارض الملفات', 'File viewer')}>
    {!hidden && <header className="chrome-surface flex items-center gap-2 px-3 py-2 border-b border-line">
      <button type="button" className="toolbar-icon flex gap-1 min-h-11 px-2" onClick={onClose}><ArrowLeft size={18} /><span>{label('المكتبة', 'Library')}</span></button>
      <OtiumLogo size={22} theme={reader.theme} />
      <strong className="flex-1 min-w-0 truncate text-xs sm:text-sm" dir="auto">{source.item.name}</strong>
      <span className="text-[10px] text-accent">{label('تجريبي', 'Preview')}</span>
      <button type="button" className="toolbar-icon min-h-11 min-w-11" aria-label={label('فتح ملف', 'Open file')} onClick={() => input.current?.click()}><FolderOpen size={19} /></button>
      <button type="button" className="toolbar-icon min-h-11 min-w-11" aria-label={label('تغيير الثيم', 'Change theme')} onClick={() => reader.changeTheme(themes[(themes.indexOf(reader.theme) + 1) % themes.length])}><Palette size={19} /></button>
      <button type="button" className="toolbar-icon min-h-11 min-w-11" aria-label={label('ملء الشاشة', 'Fullscreen')} onClick={() => void reader.handleToggleFullscreen()}><Maximize size={19} /></button>
    </header>}
    <input hidden ref={input} type="file" accept={APP_FILE_ACCEPT} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { setDraw(true); onOpen(file); } }} />
    {!hidden && <p className="media-notice text-ink-muted" role="status">{label('عرض محلي تجريبي؛ بث هذه الصيغ للهاتف أو الشاشة غير متاح بعد.', 'Local preview; beaming these file types is not available yet.')}
      {kind === 'presentation' && ` ${label('معاينة الشرائح تقريبية وقد تختلف التنسيقات المعقدة.', 'Complex slide formatting may differ.')}`}
      {!source.saved && ` ${label('تعذر حفظ الملف في المكتبة؛ أعد اختياره بعد الإغلاق.', 'This file was not cached; reselect it after closing.')}`}</p>}
    {error && <p role="alert" className="media-notice text-danger-ink">{error}</p>}
    <div className="media-stage" ref={stage}>
      {kind === 'text' ? <pre className="media-text" dir="auto">{text}</pre> : <div className="media-surface" style={{ width: size.width, height: size.height }}>
        {(kind === 'video' || kind === 'audio') && url && <Player url={url} audio={kind === 'audio'} frozen={draw} initialTime={source.item.position}
          onSize={(width, height) => setDimensions(previous => previous.width === width && previous.height === height ? previous : { width, height })} onError={setError}
          onPosition={value => { position.current = value; onProgress({ lastPage: page, totalPages: total, position: value }); }} />}
        {kind === 'image' && url && <img src={url} alt={source.item.name} onLoad={event => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError(label('تعذر فتح الصورة.', 'Could not decode this image.'))} />}
        {deck && <Pptx deck={deck} page={page} onError={setError} />}
        <Ink key={`${page}:${revision}:${dimensions.width}:${dimensions.height}`} enabled={draw} color={color} width={dimensions.width} height={dimensions.height} />
      </div>}
    </div>
    {!hidden && <footer className="media-bottom chrome-surface border-t border-line">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {kind !== 'text' && <>
          <button type="button" className="toolbar-icon min-h-11 px-3 flex items-center gap-2" aria-pressed={!draw} onClick={() => { setDraw(false); setRevision(value => value + 1); }}><Hand size={20} />{label('تصفح', 'Navigate')}</button>
          <button type="button" className="toolbar-icon min-h-11 px-3 flex items-center gap-2" aria-pressed={draw} onClick={() => setDraw(true)}><PenLine size={20} />{label('شرح مؤقت', 'Temporary ink')}</button>
          {draw && <><input type="color" aria-label={label('لون القلم', 'Ink color')} value={color} onChange={event => setColor(event.target.value)} /><button className="toolbar-icon min-h-11 min-w-11" aria-label={label('مسح الشرح المؤقت', 'Clear temporary ink')} onClick={() => setRevision(value => value + 1)}><Trash2 size={19} /></button></>}
        </>}
        {deck && <div className="flex items-center gap-2" dir="ltr"><button className="toolbar-icon min-h-11 min-w-11" aria-label={label('الشريحة السابقة', 'Previous slide')} disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={21} /></button><span>{page} / {total}</span><button className="toolbar-icon min-h-11 min-w-11" aria-label={label('الشريحة التالية', 'Next slide')} disabled={page >= total} onClick={() => setPage(value => value + 1)}><ChevronRight size={21} /></button></div>}
        <button type="button" className="toolbar-icon min-h-11 px-3 flex items-center gap-2" onClick={() => setHidden(true)}><EyeOff size={20} />{label('إخفاء', 'Hide')}</button>
      </div>
    </footer>}
    {hidden && <button type="button" className="media-restore chrome-surface min-h-11 px-4 rounded-2xl" onClick={() => setHidden(false)}>{label('إظهار الأدوات', 'Show controls')}{deck ? ` · ${page} / ${total}` : ''}</button>}
  </section>;
}
