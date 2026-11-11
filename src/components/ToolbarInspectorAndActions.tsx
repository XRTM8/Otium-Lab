import React from 'react';
import {
  Cast,
  Check,
  Edit2,
  Maximize2,
  Minimize2,
  Palette,
  PenTool,
  ScanLine,
  Settings2,
  X,
} from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { getTranslations } from '../core/i18n/translations';

interface ToolbarDocumentInspectorProps {
  title: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  theme: ThemeMode;
  ar: boolean;
  t: ReturnType<typeof getTranslations>;
  showInspector: boolean;
  isRenaming: boolean;
  renameText: string;
  fileSizeBytes?: number;
  pageDimensions?: { width: number; height: number };
  annotationsCount?: number;
  bookmarksCount?: number;
  onToggleInspector: () => void;
  onCloseInspector: () => void;
  onStartRenaming: () => void;
  onStopRenaming: () => void;
  onRenameTextChange: (value: string) => void;
  onRenameTitle?: (newTitle: string) => void;
}

export const ToolbarDocumentInspector: React.FC<ToolbarDocumentInspectorProps> = ({
  title,
  currentPage,
  totalPages,
  zoom,
  theme,
  ar,
  t,
  showInspector,
  isRenaming,
  renameText,
  fileSizeBytes,
  pageDimensions,
  annotationsCount,
  bookmarksCount,
  onToggleInspector,
  onCloseInspector,
  onStartRenaming,
  onStopRenaming,
  onRenameTextChange,
  onRenameTitle,
}) => (
  <div className="relative hidden sm:block">
    <button
      type="button"
      onClick={onToggleInspector}
      title={ar ? 'معلومات المستند والتقدم' : 'Document Info & Progress'}
      dir="auto"
      className={`max-w-[100px] md:max-w-[160px] xl:max-w-[220px] shrink-0 truncate rounded-lg px-2 py-1 text-xs font-medium transition-all cursor-pointer ${
        showInspector
          ? 'bg-hover text-ink font-semibold'
          : 'text-ink-muted hover:bg-hover-subtle hover:text-ink'
      }`}
    >
      <bdi>{title}</bdi>
    </button>

    {showInspector && (
      <>
        <div className="fixed inset-0 z-40" onClick={onCloseInspector} />
        <div
          dir={ar ? 'rtl' : 'ltr'}
          className="chrome-surface absolute start-0 top-full z-50 mt-2 w-64 rounded-2xl p-3.5 text-ink shadow-2xl fluid-pop select-none text-start"
        >
          <div className="flex items-start justify-between gap-2 border-b border-line pb-2.5">
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] uppercase text-ink-faint ${ar ? 'font-sans' : 'font-mono tracking-wider'}`}>
                {ar ? 'المستند الحالي' : 'Current Document'}
              </div>
              {isRenaming ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="text"
                    value={renameText}
                    onChange={(e) => onRenameTextChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (renameText.trim() && onRenameTitle) {
                          onRenameTitle(renameText.trim());
                        }
                        onStopRenaming();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        onRenameTextChange(title);
                        onStopRenaming();
                      }
                    }}
                    autoFocus
                    className="w-full text-xs font-medium text-ink bg-hover px-1.5 py-0.5 rounded outline-none border border-line-strong"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (renameText.trim() && onRenameTitle) {
                        onRenameTitle(renameText.trim());
                      }
                      onStopRenaming();
                    }}
                    className="toolbar-icon h-5 w-5 text-accent shrink-0"
                    title={ar ? 'حفظ الاسم' : 'Save name'}
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-0.5 group">
                  <span className="truncate font-semibold text-xs text-ink" title={title}>
                    <bdi>{title}</bdi>
                  </span>
                  {onRenameTitle && (
                    <button
                      type="button"
                      onClick={onStartRenaming}
                      className="opacity-50 hover:opacity-100 p-0.5 text-ink-muted hover:text-ink shrink-0"
                      title={ar ? 'إعادة تسمية العرض' : 'Rename title'}
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onCloseInspector}
              className="toolbar-icon h-6 w-6 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-2.5 space-y-2 text-[11px] font-mono">
            <div className="flex items-center justify-between text-ink-muted">
              <span className="font-sans font-medium">{ar ? 'تقدّم القراءة:' : 'Progress:'}</span>
              <span className="text-accent font-semibold">
                {Math.min(100, Math.round((currentPage / Math.max(1, totalPages)) * 100))}%
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${Math.min(100, Math.round((currentPage / Math.max(1, totalPages)) * 100))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-ink-muted pt-1">
              <span className="font-sans">{ar ? 'الصفحات:' : 'Pages:'}</span>
              <span>{currentPage} / {totalPages}</span>
            </div>

            {fileSizeBytes ? (
              <div className="flex items-center justify-between text-ink-muted">
                <span className="font-sans">{ar ? 'حجم الملف:' : 'File size:'}</span>
                <span dir="ltr">
                  {fileSizeBytes < 1024 * 1024
                    ? `${Math.round(fileSizeBytes / 1024)} KB`
                    : `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                </span>
              </div>
            ) : null}

            {pageDimensions ? (
              <div className="flex items-center justify-between text-ink-muted">
                <span className="font-sans">{ar ? 'أبعاد الصفحة:' : 'Dimensions:'}</span>
                <span dir="ltr">{Math.round(pageDimensions.width)} × {Math.round(pageDimensions.height)} pt</span>
              </div>
            ) : null}

            {typeof annotationsCount === 'number' ? (
              <div className="flex items-center justify-between text-ink-muted">
                <span className="font-sans">{ar ? 'الملاحظات والتظليلات:' : 'Notes & Highlights:'}</span>
                <span>{annotationsCount}</span>
              </div>
            ) : null}

            {typeof bookmarksCount === 'number' ? (
              <div className="flex items-center justify-between text-ink-muted">
                <span className="font-sans">{ar ? 'الإشارات المرجعية:' : 'Bookmarks:'}</span>
                <span>{bookmarksCount}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-ink-muted">
              <span className="font-sans">{ar ? 'نسبة العرض:' : 'Zoom:'}</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>

            <div className="flex items-center justify-between text-ink-muted">
              <span className="font-sans">{ar ? 'الثيم النشط:' : 'Theme:'}</span>
              <span className="font-sans">{t.themes[theme]}</span>
            </div>
          </div>
        </div>
      </>
    )}
  </div>
);

interface ToolbarThemeAndActionsProps {
  t: ReturnType<typeof getTranslations>;
  ar: boolean;
  theme: ThemeMode;
  themes: { id: ThemeMode; label: string; dot: string }[];
  showThemeMenu: boolean;
  isFullscreen: boolean;
  isBoardOpen?: boolean;
  isBeaming?: boolean;
  beamRoom?: string | null;
  beamRole?: 'receiver' | 'sender' | null;
  onToggleThemeMenu: () => void;
  onCloseThemeMenu: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  onToggleFullscreen: () => void;
  onToggleBoard?: () => void;
  onOpenBeam?: () => void;
  onDisconnectBeam?: () => void;
  onOpenScanner?: () => void;
  onToggleSettings: () => void;
}

export const ToolbarThemeAndActions: React.FC<ToolbarThemeAndActionsProps> = ({
  t,
  ar,
  theme,
  themes,
  showThemeMenu,
  isFullscreen,
  isBoardOpen,
  isBeaming,
  beamRoom,
  beamRole,
  onToggleThemeMenu,
  onCloseThemeMenu,
  onThemeChange,
  onToggleFullscreen,
  onToggleBoard,
  onOpenBeam,
  onDisconnectBeam,
  onOpenScanner,
  onToggleSettings,
}) => (
  <>
    <div className="relative">
      <button
        type="button"
        onClick={onToggleThemeMenu}
        title={t.themeLabel}
        aria-label={t.themeLabel}
        aria-expanded={showThemeMenu}
        className={`toolbar-icon ${showThemeMenu ? 'bg-hover text-ink' : ''}`}
      >
        <Palette className="w-3.5 h-3.5" />
      </button>

      {showThemeMenu && (
        <>
          <div className="fixed inset-0 z-40 bg-transparent" onClick={onCloseThemeMenu} />
          <div className="chrome-surface absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-2.5 text-ink fluid-pop shadow-2xl border border-line">
            <div className="flex items-center justify-between px-1.5 pb-2 text-[10px] font-semibold uppercase text-ink-faint border-b border-line-subtle mb-2">
              <span className={ar ? 'font-sans' : 'font-mono tracking-wider'}>{t.readingThemesTitle}</span>
              <span className="font-mono text-[9px] opacity-70">10</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {themes.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    onThemeChange(entry.id);
                    onCloseThemeMenu();
                  }}
                  className={`group flex items-center justify-between rounded-xl px-2 py-1.5 text-xs transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                    theme === entry.id
                      ? 'bg-hover text-ink font-medium border border-line shadow-xs'
                      : 'text-ink-muted hover:bg-hover-subtle hover:text-ink border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full border border-black/20 transition-transform duration-200 group-hover:scale-115 ${
                        theme === entry.id ? 'ring-2 ring-accent ring-offset-1 ring-offset-[var(--surface-1)]' : ''
                      }`}
                      style={{ backgroundColor: entry.dot }}
                    />
                    <span className="truncate text-[11px] group-hover:text-ink">{entry.label}</span>
                  </div>
                  {theme === entry.id && <Check className="w-3.5 h-3.5 text-accent shrink-0 animate-in zoom-in-75 duration-150" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>

    <button
      type="button"
      onClick={onToggleFullscreen}
      title={t.fullscreen}
      aria-label={t.fullscreen}
      className="toolbar-icon"
    >
      {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
    </button>

    {onToggleBoard && (
      <button
        type="button"
        onClick={onToggleBoard}
        title={
          isBoardOpen
            ? ar ? 'إغلاق السبورة الذكية' : 'Close Smartboard'
            : ar ? 'السبورة الذكية وتعدد المهام (Otium Board)' : 'Smartboard & Multitasking'
        }
        aria-label={ar ? 'السبورة الذكية' : 'Smartboard'}
        className={`toolbar-icon transition-all ${
          isBoardOpen
            ? 'bg-accent/20 text-accent font-semibold ring-1 ring-accent/40 shadow-sm'
            : 'text-ink-muted hover:text-ink'
        }`}
      >
        <PenTool className="w-3.5 h-3.5" />
      </button>
    )}

    {onOpenBeam && (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenBeam}
          title={
            isBeaming
              ? ar
                ? `متصل بالقاعة ${beamRoom || ''} (${beamRole === 'receiver' ? 'مستقبِل' : 'متحكّم'})`
                : `Connected to ${beamRoom || ''} (${beamRole === 'receiver' ? 'Receiver' : 'Remote'})`
              : ar ? 'بث إلى السبورة الذكية (Smart Beam)' : 'Beam to Smartboard'
          }
          aria-label={ar ? 'بث إلى السبورة' : 'Smart Beam'}
          className={`toolbar-icon transition-all ${
            isBeaming
              ? 'bg-emerald-500/20 text-emerald-500 font-semibold ring-1 ring-emerald-500/40 shadow-sm'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Cast className="w-3.5 h-3.5" />
        </button>
        {isBeaming && beamRoom && (
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <button
              type="button"
              onClick={onOpenBeam}
              className="hover:underline cursor-pointer"
              title={ar ? 'إدارة الاتصال' : 'Manage Beam'}
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
      </div>
    )}

    {onOpenScanner && (
      <button
        type="button"
        onClick={onOpenScanner}
        title={ar ? 'المسح الضوئي بالكاميرا (Ctrl+Shift+S)' : 'Scan Document (Ctrl+Shift+S)'}
        aria-label={ar ? 'المسح الضوئي بالكاميرا' : 'Scan Document'}
        className="toolbar-icon text-accent hover:text-accent"
      >
        <ScanLine className="w-3.5 h-3.5" />
      </button>
    )}

    <button
      type="button"
      onClick={onToggleSettings}
      title={t.settingsTitle}
      aria-label={t.settingsTitle}
      className="toolbar-icon"
    >
      <Settings2 className="w-3.5 h-3.5" />
    </button>
  </>
);
