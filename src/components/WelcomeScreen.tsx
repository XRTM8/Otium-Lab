import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Cast, ScanLine, Upload, Search, Star, FileText, Presentation, Film, Music2, Image, ArrowUpRight, Settings2, Globe, Palette, Plus, Trash2, X, LayoutGrid, List, Download, RefreshCw, ArrowLeft } from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import type { RecentDocItem } from '../core/storage/documents';
import { getRecentDocumentsList, removeDocumentFromStorage, clearAllStoredDocuments } from '../core/storage/documents';
import { APP_FILE_ACCEPT, listMedia, removeMedia } from '../media/library';
import { formatTime } from '../media/media';
import { openExternalLink } from '../platform/runtime';
import { OtiumLogo } from './OtiumLogo';
import { BrowserFullscreenButton } from './BrowserFullscreenButton';
import { ConfirmDialog } from '../library/ConfirmDialog';
import { formatBytes, kindOf, readFavorites, writeFavorites, selectFiles, type FileKind, type LibraryItem, type LibrarySort } from '../library/model';
import '../library/library.css';
interface WelcomeScreenProps {
  currentTheme: ThemeMode; currentLang: Language; onThemeChange: (theme: ThemeMode) => void; onToggleLanguage: () => void;
  onOpenSettings?: () => void; onOpenFile: (file: File) => void; onOpenSample?: () => void; onOpenRecent: (doc: RecentDocItem) => void;
  onOpenScanner?: () => void; onOpenBeam?: () => void;
}
const themes: ThemeMode[] = ['paper', 'amoled', 'eink', 'midnight', 'amber', 'sakura', 'forest', 'nordic', 'parchment', 'pure'];
const icons = { pdf: FileText, presentation: Presentation, video: Film, audio: Music2, image: Image, text: FileText };
export function WelcomeScreen({ currentTheme, currentLang, onThemeChange, onToggleLanguage, onOpenSettings, onOpenFile, onOpenRecent, onOpenScanner, onOpenBeam }: WelcomeScreenProps) {
  const ar = currentLang === 'ar', label = (a: string, e: string) => ar ? a : e, t = getTranslations(currentLang);
  const input = useRef<HTMLInputElement>(null), search = useRef<HTMLInputElement>(null);
  const loadGeneration = useRef(0);
  const [items, setItems] = useState<LibraryItem[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [kind, setKind] = useState<'all' | FileKind>('all'), [sort, setSort] = useState<LibrarySort>('recent');
  const [favorites, setFavorites] = useState(readFavorites), [onlyFavorites, setOnlyFavorites] = useState(false), [list, setList] = useState(false);
  const [dragging, setDragging] = useState(false), [removing, setRemoving] = useState<LibraryItem | 'all' | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const ticket = ++loadGeneration.current;
    setLoading(true);
    const results = await Promise.allSettled([getRecentDocumentsList(), listMedia()]);
    if (ticket !== loadGeneration.current) return;
    setItems(results.flatMap(result => result.status === 'fulfilled' ? result.value : []).sort((a, b) => b.lastOpened - a.lastOpened));
    setError(results.some(result => result.status === 'rejected') ? (ar ? 'تعذر قراءة جزء من المكتبة. ملفاتك لم تُحذف؛ حاول مجدداً.' : 'Part of the library could not be read. Your files were not deleted. Please retry.') : '');
    setLoading(false);
  }, [ar]);
  useEffect(() => { void load(); return () => { loadGeneration.current++; }; }, [load]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, []);
  const names = { all: label('الكل', 'All files'), pdf: 'PDF', presentation: label('الشرائح', 'Slides'), video: label('الفيديو', 'Video'), audio: label('الصوت', 'Audio'), image: label('الصور', 'Images'), text: label('النصوص', 'Text') };
  const visible = selectFiles(items, query, kind, favorites, onlyFavorites, sort), recent = items.find(item => item.available);
  const progress = (item: LibraryItem) => {
    const type = kindOf(item);
    return type === 'pdf' || type === 'presentation' ? `${item.lastPage} / ${item.totalPages || '—'}` : item.position ? formatTime(item.position) : names[type];
  };
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
    setFavorites(next); if (!writeFavorites(next)) setError(label('تعذر حفظ المفضلة؛ ستبقى لهذه الجلسة.', 'Favorites could not be saved; they remain available this session.'));
  };
  const open = (item: LibraryItem) => {
    if (!item.available) { setError(label('اختر الملف الأصلي لاستعادة القراءة والملاحظات.', 'Select the original file to restore reading and notes.')); input.current?.click(); }
    else onOpenRecent(item);
  };
  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try {
      if (removing === 'all') { await clearAllStoredDocuments(); await removeMedia(); setFavorites([]); writeFavorites([]); }
      else { if (removing.id.startsWith('media:')) await removeMedia(removing.id); else await removeDocumentFromStorage(removing.id); const next = favorites.filter(id => id !== removing.id); setFavorites(next); writeFavorites(next); }
      setRemoving(null); await load();
    } catch { setError(label('تعذر إكمال الحذف. حاول مجدداً.', 'Deletion could not complete. Please retry.')); }
    finally { setBusy(false); }
  };
  return <div className="lab-home" dir={ar ? 'rtl' : 'ltr'} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onOpenFile(file); }}>
    <header className="lab-topbar">
      <a className="lab-brand" href="#" aria-label="Otium Lab"><OtiumLogo theme={currentTheme} size={32} /><span>Otium <b>Lab</b><small>{label('مساحة للتعلّم والعرض', 'A space to learn and present')}</small></span><em>04</em></a>
      <div className="lab-header-actions">
        <BrowserFullscreenButton ar={ar} />
        <label className="lab-theme"><Palette size={17} /><select aria-label={label('الثيم', 'Theme')} value={currentTheme} onChange={event => onThemeChange(event.target.value as ThemeMode)}>{themes.map(theme => <option key={theme} value={theme}>{t.themes[theme]}</option>)}</select></label>
        <button className="lab-icon" aria-label={label('تغيير اللغة', 'Change language')} onClick={onToggleLanguage}><Globe size={18} /><span>{ar ? 'EN' : 'عربي'}</span></button>
        {onOpenSettings && <button className="lab-icon" aria-label={label('الإعدادات', 'Settings')} onClick={onOpenSettings}><Settings2 size={20} /></button>}
      </div>
    </header>
    <main className="lab-main">
      <section className="lab-hero">
        <div className="lab-intro"><span className="lab-eyebrow">{label('ابدأ من هنا', 'YOUR NEXT SESSION')}</span><h1>{label('اقرأ، شاهد، واشرح.', 'Read. Watch. Make it clear.')}</h1><p>{label('ملفات الدرس وأدوات الشرح في مساحة هادئة، على هاتفك أو شاشتك.', 'Your lesson files and annotation tools, together on your phone or display.')}</p>
          <div className="lab-hero-actions"><button className="lab-primary" onClick={() => input.current?.click()}><Plus size={20} />{label('فتح ملف', 'Open file')}</button>{onOpenBeam && <button className="lab-secondary" onClick={onOpenBeam}><Cast size={19} />{label('ربط شاشة', 'Connect display')}</button>}</div>
          <span className="lab-formats">PDF · PPTX · {label('فيديو وصوت وصور ونصوص', 'Video, audio, images and text')}</span>
        </div>
        {recent ? <button className="lab-resume" onClick={() => open(recent)}><span className="lab-eyebrow">{label('تابع من حيث توقفت', 'PICK UP WHERE YOU LEFT OFF')}</span><BookOpen size={28} /><strong dir="auto">{recent.name}</strong><span className="lab-resume-meta"><bdi>{progress(recent)}</bdi><span>{label('متابعة', 'Continue')}<ArrowUpRight size={17} /></span></span></button> : <button className="lab-drop" onClick={() => input.current?.click()}><Upload size={32} /><strong>{label('ملفك الأول يبدأ درساً جديداً', 'A new file. A new session.')}</strong><span>{label('اختر ملفاً من جهازك، أو أسقطه هنا.', 'Choose a file from your device, or drop it here.')}</span></button>}
      </section>
      <input hidden ref={input} type="file" accept={APP_FILE_ACCEPT} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onOpenFile(file); }} />
      <section className="lab-library" aria-labelledby="lab-library-title">
        <div className="lab-section-heading"><div><h2 id="lab-library-title">{label('مكتبتك', 'Your library')}<span>{items.length}</span></h2><p>{label('ملفات محفوظة على هذا الجهاز', 'Files stored on this device')}</p></div><div className="lab-library-actions">{onOpenScanner && <button className="lab-secondary" onClick={onOpenScanner}><ScanLine size={18} />{label('مسح مستند', 'Scan document')}</button>}<button className="lab-icon" aria-label={label('تحديث المكتبة', 'Refresh library')} disabled={loading} onClick={() => void load()}><RefreshCw size={18} /></button></div></div>
        {items.length > 0 && <><div className="lab-search-row"><label className="lab-search"><Search size={19} /><input ref={search} aria-label={label('البحث في الملفات', 'Search files')} placeholder={label('ابحث باسم الملف…', 'Search by filename…')} value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label={label('مسح البحث', 'Clear search')} onClick={() => setQuery('')}><X size={16} /></button>}</label>
          <select className="lab-sort" aria-label={label('ترتيب الملفات', 'Sort files')} value={sort} onChange={event => setSort(event.target.value as LibrarySort)}><option value="recent">{label('الأحدث استخداماً', 'Recently opened')}</option><option value="name">{label('الاسم', 'Name')}</option><option value="size">{label('الحجم', 'Size')}</option></select>
          <button className="lab-icon" aria-label={list ? label('عرض شبكة', 'Grid view') : label('عرض قائمة', 'List view')} aria-pressed={list} onClick={() => setList(value => !value)}>{list ? <LayoutGrid size={19} /> : <List size={19} />}</button>
        </div>
        <div className="lab-filters" aria-label={label('تصفية المكتبة', 'Library filters')}><button aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(value => !value)}><Star size={15} />{label('المفضلة', 'Favorites')}</button><span className="lab-filter-divider" />{(['all','pdf','presentation','video','audio','image','text'] as const).map(value => <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{names[value]}</button>)}</div>
        </>}
        {error && <div role="alert" className="lab-alert">{error}<button onClick={() => void load()} aria-label={label("إعادة المحاولة", "Retry")}><RefreshCw size={17} /></button><button aria-label={label('إغلاق التنبيه', 'Dismiss message')} onClick={() => setError('')}><X size={17} /></button></div>}
        {loading && !items.length ? <div className="lab-empty" role="status">{label('جارٍ استعادة المكتبة…', 'Restoring your library…')}</div> : visible.length ? <div className={`lab-files ${list ? 'lab-files-list' : ''}`}>
          {visible.map(item => { const type = kindOf(item), Icon = icons[type], starred = favorites.includes(item.id); return <article className="lab-file" key={item.id}>
            <button className="lab-file-open" onClick={() => open(item)} aria-label={`${label('فتح', 'Open')} ${item.name}`}><span className={`lab-file-icon lab-kind-${type}`}><Icon size={25} /></span><span className="lab-file-copy"><strong dir="auto">{item.name}</strong><span>{names[type]}<i>·</i><bdi>{formatBytes(item.sizeBytes)}</bdi></span></span><ArrowLeft className="lab-open-arrow" size={18} /></button>
            <div className="lab-file-footer"><span className="lab-file-progress" dir="auto">{item.available ? progress(item) : label('أعد اختيار الأصل', 'Reselect original')}</span><div><button className="lab-icon" aria-pressed={starred} aria-label={`${starred ? label('إزالة من المفضلة', 'Remove favorite') : label('إضافة للمفضلة', 'Add favorite')}: ${item.name}`} onClick={() => toggleFavorite(item.id)}><Star size={17} fill={starred ? 'currentColor' : 'none'} /></button><button className="lab-icon" aria-label={`${label('حذف من المكتبة', 'Remove from library')}: ${item.name}`} onClick={() => setRemoving(item)}><Trash2 size={16} /></button></div></div>
          </article>; })}
        </div> : <div className={`lab-empty ${!items.length ? "lab-empty-first" : ""}`}><Search size={30} /><h3>{items.length ? label('لا توجد ملفات مطابقة', 'No matching files') : label('مساحة جاهزة لأفكارك', 'Room for your next idea')}</h3><p>{items.length ? label('غيّر البحث أو التصفية لتجد ملفك.', 'Try a different search or filter.') : label('افتح ملفاً ليظهر هنا، وتابع منه في أي وقت.', 'Open a file to keep it here and continue anytime.')}</p>{items.length ? <button className="lab-secondary" onClick={() => { setQuery(''); setKind('all'); setOnlyFavorites(false); }}>{label('إعادة ضبط التصفية', 'Reset filters')}</button> : null}</div>}
        {items.length > 0 && <div className="lab-library-foot"><span>{label('معروض', 'Showing')} {visible.length} / {items.length}</span><button onClick={() => setRemoving('all')}><Trash2 size={14} />{label('مسح المكتبة', 'Clear library')}</button></div>}
      </section>
      <footer className="lab-home-footer"><span>Otium Lab 04 <i>·</i> {label('نسخة تجريبية', 'Experimental')}</span><a href="https://github.com/XRTM8/Otium-Lab/releases" onClick={event => { event.preventDefault(); void openExternalLink("https://github.com/XRTM8/Otium-Lab/releases"); }} target="_blank" rel="noopener noreferrer"><Download size={15} />{label('تحميل التطبيق', 'Get the app')}</a><a href="https://github.com/XRTM8/Otium-Lab" onClick={event => { event.preventDefault(); void openExternalLink("https://github.com/XRTM8/Otium-Lab"); }} target="_blank" rel="noopener noreferrer">{label('حول المختبر', 'About the lab')}<ArrowUpRight size={14} /></a></footer>
    </main>
    {dragging && <div className="lab-drag-overlay"><Upload size={46} /><strong>{label('أفلت الملف لفتحه', 'Drop to open')}</strong></div>}
    {removing && <ConfirmDialog title={label('حذف من مكتبة الجهاز؟', 'Remove from this library?')} confirmLabel={busy ? label('جارٍ الحذف…', 'Removing…') : label('حذف', 'Remove')} cancelLabel={label('إلغاء', 'Cancel')} busy={busy} onClose={() => setRemoving(null)} onConfirm={() => void remove()}><p>{removing === 'all' ? label('ستُحذف الملفات المحفوظة وشرح الصور والشرائح من هذه المكتبة. ملفاتك الأصلية خارج التطبيق تبقى محفوظة.', 'Cached files and saved image and slide annotations will be removed. Original files outside the app are kept.') : label('سيُحذف هذا الملف وشرحه المحفوظ من مكتبة التطبيق. احتفظ بنسخة من الشرح قبل الحذف.', 'This cached file and its saved media annotations will be removed. Keep a copy of your ink before removing it.')}</p>{removing !== 'all' && <strong dir="auto">{removing.name}</strong>}</ConfirmDialog>}
  </div>;
}
