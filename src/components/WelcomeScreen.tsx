import React, { useRef, useState, useEffect } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Cast,
  Check,
  ChevronDown,
  Globe,
  Palette,
  ScanLine,
  Upload,
  Settings2
} from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import {
  getRecentDocumentsList,
  removeDocumentFromStorage,
  clearAllStoredDocuments
} from '../core/storage/documents';
import { OtiumLogo } from './OtiumLogo';
import { triggerHaptic } from '../core/utils/haptics';
import { BrowserFullscreenButton } from './BrowserFullscreenButton';
import { APP_FILE_ACCEPT, listMedia, removeMedia } from '../media/library';
import { ConfirmDialog } from '../library/ConfirmDialog';
import { registerBackHandler } from '../core/navigation/backHandler';
import {
  WelcomeFooterDock,
  WelcomeRecentsShelf,
} from './WelcomeRecentsShelf';
import {
  formatLibraryProgressLabel,
  isPagedLibraryItem,
  type WelcomeLibraryItem,
} from './welcomeRecentsHelpers';

type LibraryItem = WelcomeLibraryItem;

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

  const [referenceNow] = useState(() => Date.now());

  const loadRecents = async () => {
    const [docs, media] = await Promise.allSettled([getRecentDocumentsList(), listMedia()]);
    setLibraryLoadFailed(docs.status === 'rejected' || media.status === 'rejected');
    setRecents(previous => [
      ...(docs.status === 'fulfilled' ? docs.value : previous.filter(item => !item.mediaKind)),
      ...(media.status === 'fulfilled' ? media.value : previous.filter(item => !!item.mediaKind))
    ].sort((a, b) => b.lastOpened - a.lastOpened));
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([getRecentDocumentsList(), listMedia()]).then(([docs, media]) => {
      if (cancelled) return;
      setLibraryLoadFailed(docs.status === 'rejected' || media.status === 'rejected');
      setRecents(previous => [
        ...(docs.status === 'fulfilled' ? docs.value : previous.filter(item => !item.mediaKind)),
        ...(media.status === 'fulfilled' ? media.value : previous.filter(item => !!item.mediaKind))
      ].sort((a, b) => b.lastOpened - a.lastOpened));
    });
    return () => {
      cancelled = true;
    };
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

  const paged = isPagedLibraryItem;
  const progressLabel = (item: LibraryItem) => formatLibraryProgressLabel(item, currentLang, t);

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

        <WelcomeRecentsShelf
          currentTheme={currentTheme}
          currentLang={currentLang}
          t={t}
          recents={recents}
          libraryError={libraryError}
          libraryLoadFailed={libraryLoadFailed}
          referenceNow={referenceNow}
          fileInputRef={fileInputRef}
          onRetryLoad={() => void loadRecents()}
          onOpenRecent={onOpenRecent}
          onRequestDelete={(target) => setDeleting(target)}
        />

        <WelcomeFooterDock currentLang={currentLang} buildLabel="Otium Lab 13" />

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
