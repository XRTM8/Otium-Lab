import { localStorage } from '../lab/storage';
import React, { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  Type,
  X
} from 'lucide-react';
import type { FontFamilyId, ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { ThemeScheduleMode } from '../core/settings/preferences';
import { getTranslations } from '../core/i18n/translations';
import { useUpdateChecker } from '../core/updates/useUpdateChecker';
import type { RestoreSummary } from '../core/storage/backupFormat';
import { getStorageSummary, type StorageSummary } from '../core/storage/documents';
import type { SaveTextOutcome } from '../platform/saveFile';
import { getUpdateAdapter } from '../platform/updates';
import { isOcrLanguageCached, preloadOcrLanguage } from '../scanner/core/ocr/ocrEngine';
import type { CropMode } from '../scanner/core/types';
import { triggerHaptic } from '../core/utils/haptics';
import { FontsTabPanel, ReadingTabPanel } from './settings/FontsAndReadingTabs';
import { AboutTabPanel, DataTabPanel, ScannerTabPanel } from './settings/ScannerDataAboutTabs';

export type SettingsTab = 'fonts' | 'reading' | 'scanner' | 'data' | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFont?: FontFamilyId;
  onFontChange?: (font: FontFamilyId) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  lang?: Language;
  /** Touch shells expose mobile-only reading preferences. */
  mobile?: boolean;
  mobileNavVisible?: boolean;
  onMobileNavVisibleChange?: (visible: boolean) => void;
  theme?: ThemeMode;
  onThemeChange?: (theme: ThemeMode) => void;
  themeSchedule?: ThemeScheduleMode;
  onThemeScheduleChange?: (mode: ThemeScheduleMode) => void;
  dayTheme?: ThemeMode;
  onDayThemeChange?: (theme: ThemeMode) => void;
  nightTheme?: ThemeMode;
  onNightThemeChange?: (theme: ThemeMode) => void;
  rememberDocTheme?: boolean;
  onRememberDocThemeChange?: (enabled: boolean) => void;
  keepScreenAwake?: boolean;
  onKeepScreenAwakeChange?: (enabled: boolean) => void;
  smartBoardEnabled?: boolean;
  onSmartBoardEnabledChange?: (enabled: boolean) => void;
  onResetDefaults?: () => void;
  onExportBackup?: () => Promise<SaveTextOutcome>;
  onImportBackup?: (text: string) => Promise<RestoreSummary>;
  initialTab?: SettingsTab;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentFont = 'tajawal',
  onFontChange = () => {},
  viewMode = 'continuous',
  onViewModeChange = () => {},
  lang = 'ar',
  mobile = false,
  mobileNavVisible = true,
  onMobileNavVisibleChange,
  theme,
  onThemeChange,
  themeSchedule = 'manual',
  onThemeScheduleChange,
  dayTheme = 'paper',
  onDayThemeChange,
  nightTheme = 'amoled',
  onNightThemeChange,
  rememberDocTheme = true,
  onRememberDocThemeChange,
  keepScreenAwake = true,
  onKeepScreenAwakeChange,
  smartBoardEnabled = false,
  onSmartBoardEnabledChange,
  onResetDefaults = () => {},
  onExportBackup,
  onImportBackup,
  initialTab
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'fonts');

  // Scanner Preferences
  const [cropMode, setCropMode] = useState<CropMode>(() => {
    try {
      return (localStorage.getItem('otium_scan_crop_mode') as CropMode) || 'full';
    } catch {
      return 'full';
    }
  });

  const [ocrCached, setOcrCached] = useState(() => isOcrLanguageCached('ara+eng'));
  const [isDownloadingOcr, setIsDownloadingOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  const handleToggleCropMode = (mode: CropMode) => {
    setCropMode(mode);
    try {
      localStorage.setItem('otium_scan_crop_mode', mode);
    } catch {}
  };

  // Draggable handle & expandable sheet state scoped to modal open session
  const [sheetState, setSheetState] = useState({
    open: isOpen,
    expanded: false,
    dragOffset: 0,
    isDragging: false
  });
  const isExpanded = isOpen && sheetState.open ? sheetState.expanded : false;
  const dragOffset = isOpen && sheetState.open ? sheetState.dragOffset : 0;
  const isDragging = isOpen && sheetState.open ? sheetState.isDragging : false;
  const setIsExpanded = (next: boolean | ((prev: boolean) => boolean)) =>
    setSheetState((prev) => {
      const currentExpanded = isOpen && prev.open ? prev.expanded : false;
      const expanded = typeof next === 'function' ? next(currentExpanded) : next;
      return { ...prev, open: isOpen, expanded };
    });
  const setDragOffset = (nextOffset: number) =>
    setSheetState((prev) => ({ ...prev, open: isOpen, dragOffset: nextOffset }));
  const setIsDragging = (nextDragging: boolean) =>
    setSheetState((prev) => ({ ...prev, open: isOpen, isDragging: nextDragging }));
  const dragStartYRef = useRef(0);
  const currentDragOffsetRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const isDraggingActiveRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      isDraggingActiveRef.current = false;
    }
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragStartYRef.current = e.clientY;
    currentDragOffsetRef.current = 0;
    dragStartTimeRef.current = Date.now();
    isDraggingActiveRef.current = true;
    setIsDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingActiveRef.current) return;
    const deltaY = e.clientY - dragStartYRef.current;

    let effectiveOffset = deltaY;
    if (isExpanded) {
      if (deltaY < 0) {
        effectiveOffset = deltaY * 0.2; // Rubber banding against ceiling
      }
    } else {
      if (deltaY < 0) {
        effectiveOffset = deltaY * 0.4; // Soft resistance pulling up towards expand
      }
    }
    currentDragOffsetRef.current = effectiveOffset;
    setDragOffset(effectiveOffset);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingActiveRef.current) return;
    isDraggingActiveRef.current = false;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const deltaY = currentDragOffsetRef.current;
    const elapsed = Math.max(1, Date.now() - dragStartTimeRef.current);
    const velocity = deltaY / elapsed;

    // 1. Drag down or flick down -> dismiss or collapse
    if (deltaY > 110 || (deltaY > 40 && velocity > 0.4)) {
      if (isExpanded && deltaY < 180 && velocity < 0.75) {
        setIsExpanded(false);
        setDragOffset(0);
        triggerHaptic('light');
        return;
      }
      triggerHaptic('medium');
      onClose();
      return;
    }

    // 2. Drag up or flick up -> expand / maximize
    if (deltaY < -40 || (deltaY < -15 && velocity < -0.35)) {
      if (!isExpanded) {
        setIsExpanded(true);
        triggerHaptic('light');
      }
      setDragOffset(0);
      return;
    }

    // 3. Tap on handle (< 8px movement in short time) -> toggle expand
    if (Math.abs(deltaY) < 8 && elapsed < 350) {
      setIsExpanded((prev) => !prev);
      triggerHaptic('light');
      setDragOffset(0);
      return;
    }

    // Snap back smoothly
    setDragOffset(0);
  };

  const handleDownloadOcr = async () => {
    setIsDownloadingOcr(true);
    setOcrProgress(0);
    try {
      const ok = await preloadOcrLanguage('ara+eng', (prog) => {
        setOcrProgress(prog);
      });
      if (ok) {
        setOcrCached(true);
      }
    } catch {
    } finally {
      setIsDownloadingOcr(false);
    }
  };

  const [updateAdapter] = useState(getUpdateAdapter);
  const updates = useUpdateChecker(updateAdapter);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [dataBusy, setDataBusy] = useState<'export' | 'import' | null>(null);
  const [dataNotice, setDataNotice] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const t = getTranslations(lang);
  const ar = lang === 'ar';

  useEffect(() => {
    if (!isOpen || activeTab !== 'data') return;
    let alive = true;
    void getStorageSummary().then((summary) => {
      if (alive) setStorage(summary);
    });
    return () => {
      alive = false;
    };
  }, [activeTab, isOpen]);

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleExport = async () => {
    if (!onExportBackup || dataBusy) return;
    setDataBusy('export');
    setDataNotice(null);
    try {
      const outcome = await onExportBackup();
      if (outcome === 'unavailable') {
        setDataNotice({
          tone: 'error',
          text: ar ? 'تعذر حفظ الملف على هذا الجهاز.' : 'Could not save the file on this device.'
        });
      } else {
        setDataNotice({
          tone: 'success',
          text:
            outcome === 'native-picker'
              ? ar
                ? 'اختر مجلد الحفظ لإكمال التصدير.'
                : 'Choose a folder to finish exporting.'
              : ar
                ? 'تم تنزيل نسخة احتياطية بصيغة JSON.'
                : 'JSON backup downloaded.'
        });
      }
    } catch (error) {
      setDataNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setDataBusy(null);
    }
  };

  const handleImport = async (file: File) => {
    if (!onImportBackup || dataBusy) return;
    if (file.size > 15 * 1024 * 1024) {
      setDataNotice({
        tone: 'error',
        text: ar
          ? 'حجم ملف النسخة الاحتياطية كبير جداً (الحد الأقصى 15 ميجابايت).'
          : 'Backup file exceeds maximum permitted size (15MB).'
      });
      return;
    }
    setDataBusy('import');
    setDataNotice(null);
    try {
      const text = await file.text();
      const summary = await onImportBackup(text);
      const nextStorage = await getStorageSummary();
      setStorage(nextStorage);
      setDataNotice({
        tone: 'success',
        text: ar
          ? `تمت الاستعادة: ${summary.documents} مستند، ${summary.annotations} اقتباس، ${summary.bookmarks} إشارة.`
          : `Restored ${summary.documents} documents, ${summary.annotations} highlights and ${summary.bookmarks} bookmarks.`
      });
    } catch (error) {
      setDataNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setDataBusy(null);
    }
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'fonts', label: ar ? 'الخطوط' : 'Fonts' },
    { id: 'reading', label: ar ? 'العرض' : 'Reading' },
    { id: 'scanner', label: ar ? 'الماسح' : 'Scanner' },
    { id: 'data', label: ar ? 'البيانات' : 'Data' },
    { id: 'about', label: ar ? 'حول التطبيق' : 'About' }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.settingsTitle}
      dir={ar ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 select-none"
    >
      <div className="fixed inset-0 bg-scrim fluid-fade backdrop-blur-xs" onClick={onClose} />

      <div
        ref={modalRef}
        style={{
          transform: dragOffset !== 0 ? `translate3d(0, ${dragOffset}px, 0)` : undefined,
          opacity: dragOffset > 0 ? Math.max(0.35, 1 - dragOffset / 320) : 1,
          transition: isDragging
            ? 'none'
            : 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out, height 0.28s cubic-bezier(0.16, 1, 0.3, 1), max-height 0.28s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        className={`otium-panel relative z-10 flex w-full max-w-lg sm:max-w-xl flex-col overflow-hidden rounded-t-[32px] sm:rounded-3xl p-5 text-ink sm:p-6 shadow-2xl mobile-sheet sm:fluid-pop ${
          isExpanded
            ? 'h-[96vh] max-h-[96vh] sm:h-[720px] sm:max-h-[92vh]'
            : 'h-[82vh] max-h-[85vh] sm:h-[620px] sm:max-h-[88vh]'
        }`}
      >
        {/* Draggable Handle with extended touch hit-target */}
        <div
          role="slider"
          aria-label={ar ? 'مقبض سحب القائمة' : 'Sheet drag handle'}
          aria-valuenow={isExpanded ? 100 : 50}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full py-2.5 -mt-3.5 mb-1 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none group shrink-0"
          title={
            ar
              ? isExpanded
                ? 'اسحب للأسفل لتصغير أو إغلاق القائمة'
                : 'اسحب للأعلى للتكبير، أو للأسفل للإغلاق'
              : isExpanded
              ? 'Drag down to reduce or close'
              : 'Drag up to expand, down to close'
          }
        >
          <div
            className={`h-1.5 rounded-full transition-all duration-200 ${
              isDragging
                ? 'w-16 bg-accent scale-y-125'
                : isExpanded
                ? 'w-14 bg-accent/80 group-hover:bg-accent'
                : 'w-12 bg-line-strong/60 group-hover:w-14 group-hover:bg-line-strong'
            }`}
          />
        </div>

        <div className="flex items-center justify-between pb-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-sm sm:text-base font-bold text-ink ${ar ? '' : 'tracking-wide'}`}>
                {t.settingsTitle}
              </h2>
              <p className="text-[11px] text-ink-muted font-sans">
                {ar ? 'تخصيص الخطوط ونمط العرض لأفضل تجربة قراءة' : 'Tune typography and reading layout'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="fluid-press p-1.5 rounded-full hover:bg-hover text-ink-muted hover:text-ink cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-3 flex w-full shrink-0 gap-1 p-1 rounded-2xl bg-hover-subtle border border-line-subtle overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`fluid-press flex-1 min-w-[56px] py-2 px-1 text-[11px] sm:text-xs font-bold rounded-xl cursor-pointer text-center transition-all truncate whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-hover-strong text-ink border border-line-strong shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-hover border border-transparent'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 py-1 space-y-4">
          {activeTab === 'fonts' && (
            <FontsTabPanel ar={ar} t={t} currentFont={currentFont} onFontChange={onFontChange} />
          )}

          {activeTab === 'reading' && (
            <ReadingTabPanel
              ar={ar}
              t={t}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              mobile={mobile}
              mobileNavVisible={mobileNavVisible}
              onMobileNavVisibleChange={onMobileNavVisibleChange}
              smartBoardEnabled={smartBoardEnabled}
              onSmartBoardEnabledChange={onSmartBoardEnabledChange}
              theme={theme}
              onThemeChange={onThemeChange}
              themeSchedule={themeSchedule}
              onThemeScheduleChange={onThemeScheduleChange}
              dayTheme={dayTheme}
              onDayThemeChange={onDayThemeChange}
              nightTheme={nightTheme}
              onNightThemeChange={onNightThemeChange}
              keepScreenAwake={keepScreenAwake}
              onKeepScreenAwakeChange={onKeepScreenAwakeChange}
              rememberDocTheme={rememberDocTheme}
              onRememberDocThemeChange={onRememberDocThemeChange}
            />
          )}

          {activeTab === 'scanner' && (
            <ScannerTabPanel
              ar={ar}
              cropMode={cropMode}
              onToggleCropMode={handleToggleCropMode}
              ocrCached={ocrCached}
              isDownloadingOcr={isDownloadingOcr}
              ocrProgress={ocrProgress}
              onDownloadOcr={() => void handleDownloadOcr()}
            />
          )}

          {activeTab === 'data' && (
            <DataTabPanel
              ar={ar}
              storage={storage}
              dataBusy={dataBusy}
              dataNotice={dataNotice}
              importInputRef={importInputRef}
              onExportBackup={onExportBackup}
              onImportBackup={onImportBackup}
              onExport={() => void handleExport()}
              onImportFile={(file) => void handleImport(file)}
            />
          )}

          {activeTab === 'about' && (
            <AboutTabPanel ar={ar} lang={lang} hasUpdateAdapter={Boolean(updateAdapter)} updates={updates} />
          )}
        </div>

        <div className="pt-3 border-t border-line flex items-center justify-between shrink-0 mt-2 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]">
          <button
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors text-xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetDefaults}</span>
          </button>

          <button
            onClick={onClose}
            className="btn-primary px-5 py-2 text-xs"
          >
            {ar ? 'تم وحفظ' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
