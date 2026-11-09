import React, { useRef, useState, useEffect } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  Cast,
  Check,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  Globe,
  HardDrive,
  Palette,
  ScanLine,
  Trash2,
  Upload,
  X,
  Settings2
} from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import type { RecentDocItem } from '../core/storage/documents';
import {
  getRecentDocumentsList,
  removeDocumentFromStorage,
  clearAllStoredDocuments
} from '../core/storage/documents';
import { OtiumLogo } from './OtiumLogo';
import { triggerHaptic } from '../core/utils/haptics';
import { isTauriRuntime, openExternalLink } from '../platform/runtime';
import { getCurrentVersion } from '../core/updates/currentVersion';
import { BrowserFullscreenButton } from './BrowserFullscreenButton';
import { APP_FILE_ACCEPT, listMedia, removeMedia, type MediaKind } from '../media/library';
import { formatTime } from '../media/media';
import { ConfirmDialog } from '../library/ConfirmDialog';
import { registerBackHandler } from '../core/navigation/backHandler';
import '../library/library.css';

type LibraryItem = RecentDocItem & { mediaKind?: MediaKind; position?: number };

interface WelcomeScreenProps {
  currentTheme: ThemeMode;
  currentLang: Language;
  onThemeChange: (theme: ThemeMode) => void;
  onToggleLanguage: () => void;
  onOpenSettings?: () => void;
  onOpenFile: (file: File) => void;
  onOpenRecent: (item: LibraryItem) => void;
  onOpenScanner?: () => void;
  onOpenBeam?: () => void;
  onOpenSample?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  currentTheme,
  currentLang,
  onThemeChange,
  onToggleLanguage,
  onOpenSettings,
  onOpenFile,
  onOpenRecent,
  onOpenScanner,
  onOpenBeam,
  onOpenSample: _onOpenSample
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeButton = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [recents, setRecents] = useState<LibraryItem[]>([]);
  const [libraryError, setLibraryError] = useState('');
  const [libraryLoadFailed, setLibraryLoadFailed] = useState(false);
  const [showTopThemeMenu, setShowTopThemeMenu] = useState(false);
  const [deleting, setDeleting] = useState<LibraryItem | 'all' | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const t = getTranslations(currentLang);

  useEffect(() => {
    if (!showTopThemeMenu) return;
    const close = () => {
      setShowTopThemeMenu(false);
      themeButton.current?.focus();
      return true;
    };
    const unregister = registerBackHandler(close);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', escape);
    return () => {
      unregister();
      document.removeEventListener('keydown', escape);
    };
  }, [showTopThemeMenu]);

  const loadRecents = async () => {
    const [docs, media] = await Promise.allSettled([getRecentDocumentsList(), listMedia()]);
    setLibraryLoadFailed(docs.status === 'rejected' || media.status === 'rejected');
    setRecents(previous => [
      ...(docs.status === 'fulfilled' ? docs.value : previous.filter(item => !item.mediaKind)),
      ...(media.status === 'fulfilled' ? media.value : previous.filter(item => !!item.mediaKind))
    ].sort((a, b) => b.lastOpened - a.lastOpened));
  };

  useEffect(() => {
    loadRecents();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkMobile = () => {
      const isTouch =
        window.matchMedia('(max-width: 768px)').matches ||
        window.matchMedia('(pointer: coarse)').matches ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      setIsMobileDevice(isTouch);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const paged = (item: LibraryItem) => !item.mediaKind || item.mediaKind === 'presentation';
  const progressLabel = (item: LibraryItem) => {
    if (paged(item)) return t.pageOf(item.lastPage, item.totalPages);
    const names = currentLang === 'ar'
      ? { video: 'فيديو', audio: 'صوت', image: 'صورة', text: 'نص', presentation: 'شرائح' }
      : { video: 'Video', audio: 'Audio', image: 'Image', text: 'Text', presentation: 'Slides' };
    return `${names[item.mediaKind!]}${item.position ? ` · ${formatTime(item.position)}` : ''}`;
  };

  // All 10 Themes with pure, simple color names (Zero AI Slop)
  const allThemes: { id: ThemeMode; label: string; dot: string }[] = [
    { id: 'paper', label: t.themes.paper, dot: '#d4c5a9' },
    { id: 'amber', label: t.themes.amber, dot: '#f59e0b' },
    { id: 'amoled', label: t.themes.amoled, dot: '#10b981' },
    { id: 'eink', label: t.themes.eink, dot: '#9ca3af' },
    { id: 'midnight', label: t.themes.midnight, dot: '#38bdf8' },
    { id: 'pure', label: t.themes.pure, dot: '#ffffff' },
    { id: 'parchment', label: t.themes.parchment, dot: '#d97706' },
    { id: 'sakura', label: t.themes.sakura, dot: '#f472b6' },
    { id: 'forest', label: t.themes.forest, dot: '#34d399' },
    { id: 'nordic', label: t.themes.nordic, dot: '#60a5fa' }
  ];

  const activeThemeMeta = allThemes.find((th) => th.id === currentTheme) || allThemes[0];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      onOpenFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpenFile(file);
    }
    e.target.value = '';
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    const now = new Date();

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    const timeStr = date.toLocaleTimeString(currentLang === 'ar' ? 'ar-u-nu-latn' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    if (isToday) return t.todayAt(timeStr);
    if (isYesterday) return t.yesterdayAt(timeStr);

    return date.toLocaleDateString(currentLang === 'ar' ? 'ar-u-nu-latn' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
      className="relative min-h-screen w-full flex flex-col items-center justify-start p-5 pt-16 sm:pt-16 pb-16 bg-[var(--app-bg)] text-ink select-none overflow-y-auto overflow-x-hidden transition-colors duration-500"
    >
      {/* Subtle Optical Atmosphere (Frosted Glass Vignette - Clean, No Neon Blobs) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,var(--surface-hover-strong),transparent_75%)] pointer-events-none opacity-80" />

      {/* Top Floating Glass Island with interactive press & elevation */}
      <div
        dir="ltr"
        style={{
          top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.6rem))'
        }}
        className="absolute inset-x-0 z-30 flex items-center justify-between px-4 sm:px-8 pointer-events-none"
      >
        {/* Left Utilities: Fullscreen, Language, Settings */}
        <div className="pointer-events-auto flex items-center gap-2">
          <BrowserFullscreenButton ar={currentLang === 'ar'} />
          <button
            onClick={onToggleLanguage}
            title={currentLang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
            className="fluid-press group flex items-center gap-1.5 px-3 py-1.5 rounded-full chrome-surface text-xs text-ink cursor-pointer hover:border-line-strong hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
          >
            <Globe className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink transition-colors" />
            <span className={`text-[11px] font-semibold ${currentLang === 'ar' ? 'font-mono tracking-wider' : 'font-sans'}`}>
              {currentLang === 'ar' ? 'EN' : 'عربي'}
            </span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title={t.settingsTitle}
              className="fluid-press group flex items-center gap-1.5 px-3 py-1.5 rounded-full chrome-surface text-xs text-ink cursor-pointer hover:border-line-strong hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
            >
              <Settings2 className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink transition-colors" />
              <span className="text-[11px] font-medium hidden sm:inline">
                {t.settingsTitle}
              </span>
            </button>
          )}
        </div>

        {/* Right: Theme Picker Capsule Button with Direct Dropdown Beneath It */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="relative">
            <button
              ref={themeButton}
              aria-expanded={showTopThemeMenu}
              aria-controls="home-reading-themes"
              onClick={() => {
                triggerHaptic('light');
                setShowTopThemeMenu((prev) => !prev);
              }}
              title={t.themeLabel}
              className={`fluid-press group flex items-center gap-2 px-3.5 py-1.5 rounded-full chrome-surface text-xs cursor-pointer hover:border-line-strong hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 ${
                showTopThemeMenu ? 'border-accent/60 shadow-md ring-1 ring-accent/25' : ''
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full ring-2 ring-line-strong transition-all duration-300 group-hover:scale-110"
                style={{ backgroundColor: activeThemeMeta.dot }}
              />
              <span className="font-semibold text-[11px] text-ink">
                {activeThemeMeta.label}
              </span>
              <Palette className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink transition-colors" />
              <ChevronDown
                className={`w-3 h-3 text-ink-muted transition-transform duration-300 ${
                  showTopThemeMenu ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Compact Dropdown Menu directly under the top button like before */}
            {showTopThemeMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowTopThemeMenu(false)}
                />
                <div
                  id="home-reading-themes"
                  dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
                  className="chrome-surface absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-2.5 z-50 text-ink fluid-pop shadow-2xl border border-line"
                >
                  <div className="flex items-center justify-between px-1.5 pb-2 text-[10px] font-semibold uppercase text-ink-faint border-b border-line-subtle mb-1.5">
                    <span className={currentLang === 'ar' ? 'font-sans' : 'font-mono tracking-wider'}>{t.readingThemesTitle}</span>
                    <span className="font-mono text-[9px] opacity-70">10</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {allThemes.map((th) => {
                      const isSelected = currentTheme === th.id;
                      return (
                        <button
                          key={th.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onThemeChange(th.id);
                            setShowTopThemeMenu(false);
                          }}
                          className={`fluid-press group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                            isSelected
                              ? 'bg-hover-strong text-ink font-semibold border border-line shadow-xs'
                              : 'hover:bg-hover-subtle text-ink-muted hover:text-ink border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-3.5 h-3.5 rounded-full border border-black/25 shadow-xs shrink-0 transition-transform duration-200 group-hover:scale-115 ${
                                isSelected ? 'ring-2 ring-accent ring-offset-1 ring-offset-[var(--surface-1)]' : ''
                              }`}
                              style={{ backgroundColor: th.dot }}
                            />
                            <span className="text-[11px] font-medium truncate group-hover:text-ink transition-colors">{th.label}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0 animate-in zoom-in-75 duration-150" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Stage */}
      <div className="relative max-w-xl w-full flex flex-col items-center text-center space-y-5 z-10 pt-2 sm:pt-4">

        {/* Brand Header: Sovereign Otium Emblem */}
        <div className="flex flex-col items-center space-y-3">
          <div className="p-4 rounded-3xl bg-surface/80 border border-line/50 shadow-xl backdrop-blur-xs transition-all duration-300 hover:scale-105 pointer-events-none select-none">
            <OtiumLogo theme={currentTheme} size={46} />
          </div>

          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink font-sans transition-all duration-300">
              Otium
            </h1>
            <p className="text-xs sm:text-sm font-medium text-ink-muted">
              {currentLang === 'ar'
                ? 'قارئ هادئ ومستقل للوسائط والمستندات'
                : 'A calm sovereign reader and media workspace'}
            </p>
          </div>
        </div>

        {/* Quick Resume Hero: Frosted Glass Banner with interactive elevation */}
        {recents.length > 0 && recents[0]?.available && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              triggerHaptic('medium');
              onOpenRecent(recents[0]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenRecent(recents[0]);
              }
            }}
            className="fluid-press w-full p-3.5 px-4 rounded-2xl chrome-surface hover:border-accent hover:-translate-y-0.5 shadow-lg hover:shadow-xl flex items-center justify-between gap-3 text-start cursor-pointer group transition-all duration-200"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0 group-hover:scale-105 group-hover:bg-accent/25 transition-all">
                <BookOpen className="w-5 h-5 text-accent" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent font-mono">
                  {recents[0].mediaKind
                    ? (currentLang === 'ar' ? 'متابعة العرض' : 'Resume viewing')
                    : (currentLang === 'ar' ? 'متابعة القراءة' : 'Resume Reading')}
                </span>
                <span className="text-xs sm:text-sm font-bold text-ink truncate group-hover:text-accent transition-colors">
                  <bdi>{recents[0].name}</bdi>
                </span>
                <span className="text-[11px] text-ink-muted font-mono">
                  {progressLabel(recents[0])}
                  {paged(recents[0]) && recents[0].totalPages > 0 && (
                    <span className="ml-1 text-accent font-semibold">
                      ({Math.min(100, Math.round((recents[0].lastPage / recents[0].totalPages) * 100))}%)
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-on-accent text-xs font-semibold shrink-0 group-hover:bg-accent-strong shadow-xs group-hover:shadow-md transition-all">
              <span>{currentLang === 'ar' ? 'متابعة' : 'Resume'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 rtl:rotate-[-90deg] group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        )}

        {/* Master Frosted Translucent Glass Dropzone with Magnetic Hover & Rotation */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            triggerHaptic('light');
            fileInputRef.current?.click();
          }}
          className={`w-full p-8 sm:p-10 rounded-3xl border transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-3.5 backdrop-blur-xs shadow-xl group relative overflow-hidden ${
            isDragging
              ? 'border-accent bg-surface/75 scale-[1.01] shadow-2xl'
              : 'border-line/40 bg-surface/65 hover:bg-surface/85 hover:border-accent/60 hover:-translate-y-1 hover:shadow-2xl'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-surface/80 border border-line flex items-center justify-center text-accent shadow-md backdrop-blur-xs group-hover:scale-110 group-hover:rotate-[-6deg] group-hover:border-accent/50 transition-all duration-300">
            <Upload className="w-6 h-6 group-hover:translate-y-[-2px] transition-transform" />
          </div>

          <div className="space-y-1">
            <div className="text-sm sm:text-base font-bold text-ink group-hover:text-accent transition-colors">
              {currentLang === 'ar' ? 'فتح أو سحب مستند' : 'Open or drop a document'}
            </div>
            <div className="text-xs text-ink-muted">
              {currentLang === 'ar'
                ? `${isMobileDevice ? 'اختر' : 'اسحب أو اختر'} PDF أو PPTX أو صورة أو فيديو أو صوت`
                : `${isMobileDevice ? 'Choose' : 'Drop or choose'} PDF, PPTX, image, video or audio`}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={APP_FILE_ACCEPT}
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Companion Frosted Glass Actions: Camera Scanner & Smart Beam */}
        {(onOpenScanner || onOpenBeam) && (
          <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
            {onOpenBeam && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenBeam();
                }}
                title={currentLang === 'ar' ? 'بث إلى السبورة الذكية أو فتح كشاشة استقبال' : 'Smart Beam to Board or Receiver Mode'}
                className="fluid-press group px-4 py-2.5 text-xs sm:text-sm rounded-2xl chrome-surface flex items-center gap-2 hover:border-accent/50 hover:text-accent hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer shadow-sm"
              >
                <Cast className="w-4 h-4 text-accent group-hover:scale-110 transition-transform" />
                <span className="font-semibold">{currentLang === 'ar' ? 'بث واستقبال السبورة' : 'Smart Beam & Board'}</span>
              </button>
            )}

            {onOpenScanner && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenScanner();
                }}
                title={currentLang === 'ar' ? 'مسح كتاب أو مستند ورقي ضوئياً إلى ملف PDF' : 'Scan document with camera to PDF'}
                className="fluid-press group px-4 py-2.5 text-xs sm:text-sm rounded-2xl chrome-surface flex items-center gap-2 hover:border-accent/50 hover:text-accent hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer shadow-sm"
              >
                <ScanLine className="w-4 h-4 text-accent group-hover:scale-110 transition-transform" />
                <span className="font-semibold">{currentLang === 'ar' ? 'الماسح بالكاميرا' : 'Scan with Camera'}</span>
              </button>
            )}
          </div>
        )}

        {/* Recent Files Frosted Glass Shelf */}
        {(libraryError || libraryLoadFailed) && (
          <div role="alert" className="w-full text-xs text-danger-ink space-y-2">
            <p>{libraryError || (currentLang === 'ar' ? 'تعذر تحميل جزء من المكتبة. ملفاتك لم تُحذف؛ حاول مجدداً.' : 'Part of your library could not be loaded. Your files have not been deleted; try again.')}</p>
            <button type="button" className="btn-secondary min-h-11 px-4 rounded-xl cursor-pointer" onClick={() => void loadRecents()}>
              {currentLang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
            </button>
          </div>
        )}

        {recents.length > 0 && (
          <div className="w-full text-start pt-4 border-t border-line/40 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-ink-muted px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 opacity-80" />
                <span>{t.savedDocs}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface/50 border border-line text-ink-muted font-mono">
                  {recents.length}
                </span>
              </span>
              <button
                onClick={() => setDeleting('all')}
                className="hover:text-danger-ink transition-colors flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink-muted cursor-pointer"
                title={t.clearAll}
              >
                <Trash2 className="w-3 h-3" />
                <span>{t.clearAll}</span>
              </button>
            </div>

            {/* Frosted Glass Document Tiles with tactile elevation */}
            <div className="space-y-2 max-h-[240px] sm:max-h-[280px] overflow-y-auto overflow-x-hidden p-1 scrollbar-thin scrollbar-thumb-line-strong scrollbar-track-transparent overscroll-contain transition-all">
              {recents.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  aria-label={`${currentLang === 'ar' ? 'فتح' : 'Open'} ${r.name}`}
                  tabIndex={0}
                  onClick={() => {
                    if (!r.available) {
                      fileInputRef.current?.click();
                      return;
                    }
                    onOpenRecent(r);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    if (!r.available) {
                      fileInputRef.current?.click();
                      return;
                    }
                    onOpenRecent(r);
                  }}
                  className={`fluid-press relative overflow-hidden flex items-center justify-between p-3.5 ps-4 rounded-2xl bg-surface/75 hover:bg-surface/95 backdrop-blur-xs cursor-pointer border border-line/45 hover:border-line-strong hover:-translate-y-1 shadow-xs hover:shadow-xl group transition-all duration-200 ${
                    r.available ? '' : 'border-dashed'
                  }`}
                >
                  {/* Subtle Spine Accent on Leading Edge expanding on hover */}
                  <div className="absolute inset-y-0 start-0 w-[3px] group-hover:w-[5px] bg-accent/40 group-hover:bg-accent transition-all duration-200" />
                  <div className="flex items-center gap-3 min-w-0 pr-1">
                    <div className="w-9 h-9 rounded-xl border border-line bg-surface/50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <OtiumLogo theme={currentTheme} size={22} />
                    </div>
                    <div className="flex flex-col min-w-0 gap-1 text-start">
                      <span className="truncate font-semibold text-xs sm:text-sm text-ink group-hover:text-accent transition-colors">
                        <bdi>{r.name}</bdi>
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-ink-muted font-mono">
                        <span className="font-sans font-medium text-ink-muted">
                          {progressLabel(r)}
                          {paged(r) && r.totalPages > 0 && (
                            <span className="text-[10px] text-accent font-mono ml-1 mr-1">
                              ({Math.min(100, Math.round((r.lastPage / r.totalPages) * 100))}%)
                            </span>
                          )}
                        </span>
                        <span className="text-ink-faint hidden sm:inline">•</span>
                        <span className="flex items-center gap-1 font-sans text-ink-muted">
                          <Calendar className="w-3 h-3 text-ink-faint shrink-0" />
                          <span>{formatDate(r.lastOpened)}</span>
                        </span>
                        {r.available ? (
                          <>
                            <span className="text-ink-faint hidden sm:inline">•</span>
                            <span dir="ltr" className="inline-flex items-center gap-1 font-mono text-ink-muted">
                              <HardDrive className="w-3 h-3 text-ink-faint shrink-0" />
                              <span>{formatSize(r.sizeBytes)}</span>
                            </span>
                          </>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-sans text-[10px] text-accent">
                            <Upload className="h-3 w-3 shrink-0" />
                            <span>{currentLang === 'ar' ? 'أعد استيراد الملف' : 'Re-import file'}</span>
                          </span>
                        )}
                      </div>

                      {paged(r) && r.totalPages > 0 && (
                        <div className="w-full h-0.5 bg-line/40 rounded-full overflow-hidden mt-1.5">
                          <div
                            className="h-full bg-accent transition-all duration-300 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.round((r.lastPage / r.totalPages) * 100))}%`
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 px-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(r);
                      }}
                      title={t.deleteTooltip}
                      aria-label={`${currentLang === 'ar' ? 'حذف من المكتبة:' : 'Delete from library:'} ${r.name}`}
                      className="fluid-press p-2 rounded-xl opacity-100 text-ink-faint hover:text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 cursor-pointer transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Frosted Glass Dock with micro-elevation */}
        {!isTauriRuntime() && (
          <div className="w-full pt-6 pb-2 border-t border-line/40 flex flex-col items-center gap-2 text-ink select-none animate-in fade-in duration-300">
            <a
              href="https://github.com/XRTM8/Otium-Lab"
              onClick={(e) => {
                e.preventDefault();
                void openExternalLink('https://github.com/XRTM8/Otium-Lab');
              }}
              target="_blank"
              rel="noopener noreferrer"
              className="group fluid-press px-4 py-2 rounded-full chrome-surface hover:border-accent/50 hover:-translate-y-0.5 shadow-sm hover:shadow-md flex items-center gap-2 text-xs font-semibold text-ink hover:text-accent transition-all duration-200"
              title={currentLang === 'ar' ? `نسخة تجريبية مبنية على v${getCurrentVersion()}` : `Preview based on v${getCurrentVersion()}`}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <Download className="w-3.5 h-3.5 text-accent" />
              <span>
                {currentLang === 'ar' ? 'Otium Lab 13 · نسخة تجريبية' : 'Otium Lab 13 · Experimental'}
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-semibold">
                v{getCurrentVersion()}
              </span>
              <ExternalLink className="w-3 h-3 text-ink-muted group-hover:text-accent opacity-70 group-hover:opacity-100 transition-opacity" />
            </a>

            <a
              href="https://instagram.com/ma.xrt"
              onClick={(e) => {
                e.preventDefault();
                void openExternalLink('https://instagram.com/ma.xrt');
              }}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
              title="Instagram: @ma.xrt"
            >
              <svg
                className="w-3 h-3 text-pink-500/80 group-hover:text-pink-500 transition-colors"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              <span className="font-medium text-[11px] text-ink-muted group-hover:text-ink transition-colors">MA.XRT</span>
              <span className="text-[10px] text-ink-faint">• Instagram</span>
            </a>
          </div>
        )}

      </div>

      {deleting && (
        <ConfirmDialog
          title={currentLang === 'ar' ? 'حذف من مكتبة الجهاز؟' : 'Delete from this device library?'}
          confirmLabel={currentLang === 'ar' ? 'حذف' : 'Delete'}
          cancelLabel={currentLang === 'ar' ? 'إلغاء' : 'Cancel'}
          busy={deletingBusy}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setDeletingBusy(true);
            try {
              if (deleting === 'all') {
                await clearAllStoredDocuments();
                await removeMedia();
              } else if (deleting.id.startsWith('media:')) {
                await removeMedia(deleting.id);
              } else {
                await removeDocumentFromStorage(deleting.id);
              }
              setLibraryError('');
              setDeleting(null);
            } catch {
              setLibraryError(currentLang === 'ar' ? 'تعذر إكمال الحذف؛ حاول مجدداً.' : 'Could not complete deletion. Try again.');
              setDeleting(null);
            } finally {
              await loadRecents();
              setDeletingBusy(false);
            }
          }}
        >
          <p>{currentLang === 'ar' ? 'سيُحذف الملف المحفوظ وشرحه من مكتبة هذا الجهاز.' : 'This removes the cached file and its saved ink from this device library.'}</p>
          <strong>{deleting === 'all' ? t.clearAll : deleting.name}</strong>
        </ConfirmDialog>
      )}
    </div>
  );
};
