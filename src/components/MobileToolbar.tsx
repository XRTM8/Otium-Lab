import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Cast,
  Columns,
  Layers,
  MoreHorizontal,
  Palette,
  ScanLine,
  Scroll,
  Search,
  Settings2,
  Presentation,
  X
} from 'lucide-react';
import type { ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import { OtiumLogo } from './OtiumLogo';
import { MobileToolbarBottomBar, MobileToolbarJumpModal } from './MobileToolbarJumpAndBottom';

interface MobileToolbarProps {
  title: string;
  currentPage: number;
  totalPages: number;
  theme: ThemeMode;
  viewMode: ViewMode;
  currentLang: Language;
  readingDirection?: 'rtl' | 'ltr';
  isBookmarked: boolean;
  /** Settings → Reading can hide the bottom bar for a bare page. */
  showBottomBar?: boolean;
  /** A single tap on the page hides every chrome surface for immersive reading. */
  immersive?: boolean;
  onPageChange: (page: number) => void;
  /** Go to the logical previous page (handles dual/rtl correctly via the controller). */
  onPrevPage?: () => void;
  /** Go to the logical next page (handles dual/rtl correctly via the controller). */
  onNextPage?: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBookmark: () => void;
  onToggleSearch: () => void;
  onOpenSidebar: () => void;
  onOpenScanner?: () => void;
  onOpenBeam?: () => void;
  onToggleBoard?: () => void;
  isBoardOpen?: boolean;
  isBeaming?: boolean;
  beamRoom?: string | null;
  beamRole?: 'receiver' | 'sender' | null;
  onDisconnectBeam?: () => void;
  onOpenSettings: () => void;
  onCloseDocument: () => void;
}

const THEMES: { id: ThemeMode; dot: string }[] = [
  { id: 'paper', dot: '#d4c5a9' },
  { id: 'amber', dot: '#f59e0b' },
  { id: 'amoled', dot: '#10b981' },
  { id: 'eink', dot: '#9ca3af' },
  { id: 'midnight', dot: '#38bdf8' },
  { id: 'pure', dot: '#ffffff' },
  { id: 'parchment', dot: '#d97706' },
  { id: 'sakura', dot: '#f472b6' },
  { id: 'forest', dot: '#34d399' },
  { id: 'nordic', dot: '#60a5fa' }
];

const VIEW_MODES: ViewMode[] = ['continuous', 'dual', 'single'];

/** Touch-first chrome. The shared reader supplies all reading behaviour. */
export const MobileToolbar: React.FC<MobileToolbarProps> = ({
  title,
  currentPage,
  totalPages,
  theme,
  viewMode,
  currentLang,
  readingDirection = 'ltr',
  isBookmarked,
  showBottomBar = true,
  immersive = false,
  onPageChange,
  onPrevPage,
  onNextPage,
  onThemeChange,
  onViewModeChange,
  onToggleBookmark,
  onToggleSearch,
  onOpenSidebar,
  onOpenScanner,
  onOpenBeam,
  onToggleBoard,
  isBoardOpen = false,
  isBeaming = false,
  beamRoom,
  beamRole,
  onDisconnectBeam,
  onOpenSettings,
  onCloseDocument
}) => {
  const [menuState, setMenuState] = useState<{ open: boolean; immersive: boolean }>({ open: false, immersive });
  const showMenu = menuState.open && !immersive && menuState.immersive === immersive;
  const setShowMenu = (next: boolean | ((open: boolean) => boolean)) => {
    setMenuState((prev) => {
      const current = prev.open && !immersive && prev.immersive === immersive;
      const open = typeof next === 'function' ? next(current) : next;
      return { open, immersive };
    });
  };
  const [showJump, setShowJump] = useState(false);
  const [compactLandscape, setCompactLandscape] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(orientation: landscape) and (max-height: 540px)').matches : false
  );
  const t = getTranslations(currentLang);
  const ar = currentLang === 'ar';
  // The interface language can differ from the PDF's reading direction.
  const contentIsRtl = readingDirection === 'rtl';
  const viewModeLabel = ar
    ? { continuous: 'مستمر', dual: 'صفحتين', single: 'مفردة' }[viewMode]
    : { continuous: 'Scroll', dual: 'Spread', single: 'Single' }[viewMode];

  useEffect(() => {
    if (!showMenu) return;
    const timer = window.setTimeout(() => setMenuState({ open: false, immersive }), 8000);
    const handleBack = (e: Event) => {
      e.preventDefault();
      setMenuState({ open: false, immersive });
    };
    window.addEventListener('otium:back', handleBack);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('otium:back', handleBack);
    };
  }, [showMenu, immersive]);

  // Landscape phones have very little height: shrink the chrome and drop the
  // duplicate actions that also live in the overflow menu.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(orientation: landscape) and (max-height: 540px)');
    const update = () => setCompactLandscape(query.matches);
    update();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    const legacyQuery = query as MediaQueryList & {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
    if (typeof legacyQuery.addListener === 'function') {
      legacyQuery.addListener(update);
      return () => legacyQuery.removeListener?.(update);
    }
  }, []);

  const topOffset = compactLandscape
    ? 'max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.35rem))'
    : 'max(0.85rem, calc(env(safe-area-inset-top, 0px) + 0.65rem))';
  const bottomOffset = compactLandscape
    ? 'max(0.4rem, calc(env(safe-area-inset-bottom, 0px) + 0.3rem))'
    : 'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.55rem))';

  const viewModeIcon =
    viewMode === 'continuous' ? (
      <Scroll className="w-4 h-4" />
    ) : viewMode === 'dual' ? (
      <BookOpen className="w-4 h-4" />
    ) : (
      <Columns className="w-4 h-4" />
    );

  return (
    <>
      <div
        dir="ltr"
        data-position="top"
        data-immersive={immersive ? 'true' : 'false'}
        aria-hidden={immersive}
        inert={immersive || undefined}
        style={{
          top: topOffset,
          paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))'
        }}
        className="mobile-chrome-shell fixed inset-x-0 z-40 flex justify-center px-2 pointer-events-none"
      >
        <div
          className={`chrome-surface mobile-chrome-bar flex w-full max-w-lg items-center gap-1 rounded-2xl px-1.5 py-1.5 text-ink ${
            immersive ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          <button
            type="button"
            onClick={onCloseDocument}
            title={t.closeDoc}
            aria-label={t.closeDoc}
            className="fluid-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line-subtle bg-hover-subtle text-ink-muted active:bg-hover"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="shrink-0 px-0.5 text-accent">
            <OtiumLogo size={20} />
          </div>

          <button
            type="button"
            onClick={() => setShowMenu((open) => !open)}
            title={ar ? 'أدوات ومعلومات المستند' : 'Document Info & Tools'}
            dir="auto"
            className="fluid-press flex-1 min-w-0 truncate text-start px-2 py-1 rounded-lg text-[11px] font-medium text-ink-muted hover:text-ink hover:bg-hover-subtle cursor-pointer"
          >
            <bdi>{title}</bdi>
          </button>

          {/* Active Beam Pill */}
          {onToggleBoard && <button type="button" onClick={onToggleBoard} aria-pressed={isBoardOpen} aria-label={ar ? 'إظهار أو إغلاق السبورة' : 'Toggle whiteboard'} className="toolbar-icon min-h-11 min-w-11"><Presentation size={19} /></button>}
          {isBeaming && beamRoom && onOpenBeam && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <button
                type="button"
                onClick={onOpenBeam}
                className="hover:underline cursor-pointer"
                title={ar
                  ? `متصل بالقاعة ${beamRoom} (${beamRole === 'receiver' ? 'مستقبِل' : 'متحكّم'})`
                  : `Connected to ${beamRoom} (${beamRole === 'receiver' ? 'Receiver' : 'Remote'})`}
              >
                {beamRoom}
              </button>
              {onDisconnectBeam && (
                <button
                  type="button"
                  onClick={onDisconnectBeam}
                  className="p-0.5 rounded-full hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ml-0.5 cursor-pointer"
                  title={ar ? 'قطع الاتصال' : 'Disconnect'}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onToggleSearch}
            title={t.searchTooltip}
            aria-label={t.searchTooltip}
            className="fluid-press p-2 rounded-xl text-ink-muted hover:bg-hover active:bg-hover-strong shrink-0"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowMenu((open) => !open)}
            title={t.moreTools}
            aria-label={t.moreTools}
            className={`fluid-press p-2 rounded-xl shrink-0 ${
              showMenu ? 'bg-hover-strong text-ink' : 'text-ink-muted hover:bg-hover'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showMenu && !immersive && (
        <div
          dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
          style={{ top: compactLandscape ? 'max(2.9rem, calc(env(safe-area-inset-top, 0px) + 2.5rem))' : undefined }}
          className="fixed inset-x-2 top-16 z-50 mx-auto max-w-lg rounded-2xl chrome-surface p-3 text-ink space-y-3 fluid-pop shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] uppercase text-ink-faint ${currentLang === 'ar' ? 'font-sans' : 'font-mono tracking-wider'}`}>
              {t.moreTools}
            </span>
            <button
              type="button"
              onClick={() => setShowMenu(false)}
              className="p-1 rounded-full text-ink-muted hover:text-ink hover:bg-hover"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                onToggleBookmark();
                setShowMenu(false);
              }}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border text-[10px] transition-colors ${
                isBookmarked
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'bg-hover-subtle text-ink-muted border-line-subtle'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-highlight' : ''}`} />
              <span className="truncate">{ar ? 'إشارة' : 'Mark'}</span>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange(VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length])}
              className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-hover-subtle border border-line-subtle text-ink-muted text-[10px]"
            >
              {viewModeIcon}
              <span className="truncate">{viewModeLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenSidebar();
                setShowMenu(false);
              }}
              className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-hover-subtle border border-line-subtle text-ink-muted text-[10px]"
            >
              <Layers className="w-4 h-4" />
              <span className="truncate">{t.pagesTab}</span>
            </button>

            {onOpenScanner && (
              <button
                type="button"
                onClick={() => {
                  onOpenScanner();
                  setShowMenu(false);
                }}
                className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-accent/15 border border-accent/30 text-accent text-[10px] active:scale-95 transition-all cursor-pointer"
              >
                <ScanLine className="w-4 h-4 text-accent" />
                <span className="truncate font-semibold">{ar ? 'الماسح' : 'Scanner'}</span>
              </button>
            )}

            {onOpenBeam && (
              <button
                type="button"
                onClick={() => {
                  onOpenBeam();
                  setShowMenu(false);
                }}
                className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border text-[10px] active:scale-95 transition-all cursor-pointer ${
                  isBeaming
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 ring-1 ring-emerald-500/30'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <Cast className="w-4 h-4" />
                <span className="truncate font-semibold">
                  {isBeaming ? (beamRoom || (ar ? 'متصل' : 'Connected')) : (ar ? 'بث للسبورة' : 'Beam')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                setShowMenu(false);
              }}
              className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-hover-subtle border border-line-subtle text-ink-muted hover:text-ink text-[10px]"
            >
              <Settings2 className="w-4 h-4" />
              <span className="truncate">{ar ? 'إعدادات' : 'Settings'}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-line">
            <div className="flex items-center justify-between text-[10px] text-ink-muted font-mono mb-1.5">
              <div className="flex items-center gap-1.5">
                <Palette className="w-3 h-3" />
                <span>{t.readingThemesTitle}</span>
              </div>
              <span className="text-[9px] opacity-70">10</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {THEMES.map((item) => {
                const selected = item.id === theme;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onThemeChange(item.id)}
                    className={`flex items-center gap-1.5 p-1.5 rounded-xl border text-[10px] transition-colors ${
                      selected
                        ? 'border-accent bg-accent/20 text-ink'
                        : 'border-line-subtle bg-hover-subtle text-ink-muted'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
                      style={{ backgroundColor: item.dot }}
                    />
                    <span className="truncate">{t.themes[item.id]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showJump && !immersive && (
        <MobileToolbarJumpModal
          ar={ar}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
          onClose={() => setShowJump(false)}
        />
      )}

      {showBottomBar && (
        <MobileToolbarBottomBar
          ar={ar}
          contentIsRtl={contentIsRtl}
          immersive={immersive}
          bottomOffset={bottomOffset}
          currentPage={currentPage}
          totalPages={totalPages}
          isBookmarked={isBookmarked}
          prevPageLabel={t.prevPage}
          nextPageLabel={t.nextPage}
          addBookmarkLabel={t.addBookmark}
          removeBookmarkLabel={t.removeBookmark}
          searchTooltipLabel={t.searchTooltip}
          onPageChange={onPageChange}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
          onOpenJump={() => setShowJump(true)}
          onToggleBookmark={onToggleBookmark}
          onToggleSearch={onToggleSearch}
        />
      )}
    </>
  );
};
