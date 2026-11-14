import React, { useRef, useState, useEffect } from 'react';
import {
  Cast,
  Globe,
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
import {
  WelcomeFooterDock,
  WelcomeRecentsShelf,
} from './WelcomeRecentsShelf';
import { type WelcomeLibraryItem } from './welcomeRecentsHelpers';
import { WelcomeThemeMenu } from './WelcomeThemeMenu';
import { WelcomeHeroResumeCard } from './WelcomeHeroResumeCard';

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
  const [isDragging, setIsDragging] = useState(false);
  const [recents, setRecents] = useState<LibraryItem[]>([]);
  const [libraryError, setLibraryError] = useState('');
  const [libraryLoadFailed, setLibraryLoadFailed] = useState(false);
  const [deleting, setDeleting] = useState<LibraryItem | 'all' | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const t = getTranslations(currentLang);

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
        <WelcomeThemeMenu
          currentTheme={currentTheme}
          currentLang={currentLang}
          t={t}
          onThemeChange={onThemeChange}
        />
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
        <WelcomeHeroResumeCard
          heroRecent={recents[0]}
          currentLang={currentLang}
          t={t}
          onOpenRecent={onOpenRecent}
        />

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

        <WelcomeFooterDock currentLang={currentLang} buildLabel="Otium Lab 16" />

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
