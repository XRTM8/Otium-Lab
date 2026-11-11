import React from 'react';
import {
  BookOpen,
  Check,
  Columns,
  LayoutTemplate,
  Moon,
  Palette,
  Sparkles,
  Sun,
} from 'lucide-react';
import { DeviceUsageSetting } from '../DeviceUsageSetting';
import { FONTS_LIST } from '../../core/settings/fonts';
import type { FontFamilyId, ThemeMode, ViewMode } from '../../core/types';
import type { getTranslations } from '../../core/i18n/translations';
import type { ThemeScheduleMode } from '../../core/settings/preferences';

const THEME_DOT_COLORS: Record<ThemeMode, string> = {
  paper: '#d4c5a9',
  midnight: '#38bdf8',
  amoled: '#10b981',
  forest: '#34d399',
  nordic: '#60a5fa',
  parchment: '#d97706',
  amber: '#f59e0b',
  eink: '#9ca3af',
  pure: '#f8fafc',
  sakura: '#f472b6',
};

const ALL_THEMES: ThemeMode[] = [
  'paper',
  'amber',
  'amoled',
  'eink',
  'midnight',
  'pure',
  'parchment',
  'sakura',
  'forest',
  'nordic',
];

const QUICK_THEMES: ThemeMode[] = [
  'paper',
  'midnight',
  'amoled',
  'forest',
  'nordic',
  'parchment',
  'amber',
  'eink',
  'pure',
  'sakura',
];

export const FontsTabPanel: React.FC<{
  ar: boolean;
  t: ReturnType<typeof getTranslations>;
  currentFont: FontFamilyId;
  onFontChange: (font: FontFamilyId) => void;
}> = ({ ar, t, currentFont, onFontChange }) => (
  <div className="space-y-3 animate-in fade-in-50 duration-150">
    <div className="flex items-center justify-between text-xs text-ink-muted px-1 font-mono">
      <span>{t.fontsTitle}</span>
      <span className="text-highlight text-[11px] font-sans">
        {FONTS_LIST.length} {ar ? 'خطوط ممتازة' : 'premium fonts'}
      </span>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {FONTS_LIST.map((font) => {
        const isSelected = currentFont === font.id;
        return (
          <button
            key={font.id}
            onClick={() => onFontChange(font.id)}
            style={{ fontFamily: font.cssFamily }}
            className={`relative flex cursor-pointer flex-col rounded-2xl border p-3 text-right transition-all ${
              isSelected
                ? 'border-accent/45 bg-accent/10 text-ink shadow-sm ring-1 ring-accent/25'
                : 'border-line-subtle bg-hover-subtle text-ink-muted hover:border-line hover:bg-hover'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-sm font-bold">{font.name}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-hover text-ink-muted font-sans border border-line-subtle">
                  {font.badge}
                </span>
                {isSelected && (
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-on-accent">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-ink-muted opacity-90 truncate w-full mt-0.5">
              {font.sampleAr}
            </p>
            <span className="text-[10px] text-ink-faint font-mono mt-1 opacity-60">
              {font.subname}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export const ReadingTabPanel: React.FC<{
  ar: boolean;
  t: ReturnType<typeof getTranslations>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  mobile: boolean;
  mobileNavVisible: boolean;
  onMobileNavVisibleChange?: (visible: boolean) => void;
  smartBoardEnabled: boolean;
  onSmartBoardEnabledChange?: (enabled: boolean) => void;
  theme?: ThemeMode;
  onThemeChange?: (theme: ThemeMode) => void;
  themeSchedule: ThemeScheduleMode;
  onThemeScheduleChange?: (mode: ThemeScheduleMode) => void;
  dayTheme: ThemeMode;
  onDayThemeChange?: (theme: ThemeMode) => void;
  nightTheme: ThemeMode;
  onNightThemeChange?: (theme: ThemeMode) => void;
  keepScreenAwake: boolean;
  onKeepScreenAwakeChange?: (enabled: boolean) => void;
  rememberDocTheme: boolean;
  onRememberDocThemeChange?: (enabled: boolean) => void;
}> = ({
  ar,
  t,
  viewMode,
  onViewModeChange,
  mobile,
  mobileNavVisible,
  onMobileNavVisibleChange,
  smartBoardEnabled,
  onSmartBoardEnabledChange,
  theme,
  onThemeChange,
  themeSchedule,
  onThemeScheduleChange,
  dayTheme,
  onDayThemeChange,
  nightTheme,
  onNightThemeChange,
  keepScreenAwake,
  onKeepScreenAwakeChange,
  rememberDocTheme,
  onRememberDocThemeChange,
}) => (
  <div className="space-y-4 animate-in fade-in-50 duration-150">
    <div className="space-y-2">
      <label className="text-xs font-semibold text-ink-muted block">
        {t.defaultReadingMode}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          onClick={() => onViewModeChange('continuous')}
          className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
            viewMode === 'continuous'
              ? 'bg-accent/15 border-accent/50 text-accent'
              : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
          }`}
        >
          <LayoutTemplate className="w-5 h-5" />
          <span className="font-medium">{ar ? 'التمرير المستمر' : 'Continuous'}</span>
          <span className="text-[10px] text-ink-faint">{ar ? 'تصفح عمودي سلس' : 'Smooth vertical flow'}</span>
        </button>

        <button
          onClick={() => onViewModeChange('dual')}
          className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
            viewMode === 'dual'
              ? 'bg-accent/15 border-accent/50 text-accent'
              : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="font-medium">{ar ? 'صفحتين متجاورة' : 'Two pages'}</span>
          <span className="text-[10px] text-ink-faint">{ar ? 'كتاب مفتوح هادئ' : 'Open-book spread'}</span>
        </button>

        <button
          onClick={() => onViewModeChange('single')}
          className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
            viewMode === 'single'
              ? 'bg-accent/15 border-accent/50 text-accent'
              : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
          }`}
        >
          <Columns className="w-5 h-5" />
          <span className="font-medium">{ar ? 'صفحة واحدة' : 'Single page'}</span>
          <span className="text-[10px] text-ink-faint">{ar ? 'تركيز عالي' : 'Focused reading'}</span>
        </button>
      </div>
    </div>

    {mobile && onMobileNavVisibleChange && (
      <button
        type="button"
        role="switch"
        aria-checked={mobileNavVisible}
        onClick={() => onMobileNavVisibleChange(!mobileNavVisible)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line-subtle bg-hover-subtle p-3 text-start transition-colors active:bg-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-ink">
            {ar ? 'شريط التنقل السفلي' : 'Bottom navigation bar'}
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">
            {ar
              ? 'أرقام الصفحات والأزرار السريعة أسفل الشاشة. أخفِه لتبقى الصفحة نظيفة؛ تبقى لوحة الصفحات في قائمة الأدوات.'
              : 'Page numbers and quick actions at the bottom. Hide it for a bare page; the pages panel stays in the tools menu.'}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
            mobileNavVisible
              ? 'border-accent/50 bg-accent'
              : 'border-line-strong bg-hover-strong'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
              mobileNavVisible ? 'start-6' : 'start-0.5'
            }`}
          />
        </span>
      </button>
    )}

    <DeviceUsageSetting ar={ar} />
    {onSmartBoardEnabledChange && (
      <button
        type="button"
        role="switch"
        aria-checked={smartBoardEnabled}
        onClick={() => onSmartBoardEnabledChange(!smartBoardEnabled)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line-subtle bg-hover-subtle p-3 text-start transition-colors active:bg-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-ink">
            {ar ? 'السبورة الذكية' : 'Smart whiteboard'}
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">
            {ar ? 'إظهار السبورة والتقسيم على هذا الجهاز، بما فيه Android. يبقى اختيارك محفوظاً.' : 'Enable the whiteboard and split workspace on this device, including Android. Your choice is saved.'}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
            smartBoardEnabled
              ? 'border-accent/50 bg-accent'
              : 'border-line-strong bg-hover-strong'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
              smartBoardEnabled ? 'start-6' : 'start-0.5'
            }`}
          />
        </span>
      </button>
    )}

    {/* Visual Comfort & Theme Intelligence */}
    <div className="space-y-3 pt-3 border-t border-line-subtle">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-accent" />
        <span className="text-xs font-bold text-ink">
          {ar ? 'الراحة البصرية وبيئة القراءة' : 'Visual Comfort & Reading Environment'}
        </span>
      </div>

      {/* Theme Scheduling Mode */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-ink-muted">
          {ar ? 'جدولة الثيم الذكية' : 'Theme Schedule'}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'manual' as const, label: ar ? 'يدوي' : 'Manual', desc: ar ? 'اختيارك الثابت' : 'Fixed choice' },
            { id: 'system' as const, label: ar ? 'مزامنة النظام' : 'Follow System', desc: ar ? 'تلقائي مع جهازك' : 'With device OS' },
            { id: 'sunset' as const, label: ar ? 'حماية الغروب' : 'Sunset Shield', desc: ar ? 'ليلي في المساء' : 'Night at sunset' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onThemeScheduleChange?.(item.id)}
              className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                themeSchedule === item.id
                  ? 'bg-accent/15 border-accent/50 text-accent font-semibold'
                  : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
              }`}
            >
              <span className="text-xs">{item.label}</span>
              <span className="text-[9px] text-ink-faint mt-0.5">{item.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active Theme Selector (when Manual) */}
      {theme && onThemeChange && themeSchedule === 'manual' && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-ink-muted">
            {ar ? 'الثيم النشط الحالي' : 'Active Theme'}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {QUICK_THEMES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onThemeChange(id)}
                className={`p-2 rounded-xl border flex items-center gap-2 text-start transition-all cursor-pointer ${
                  theme === id
                    ? 'bg-accent/15 border-accent/50 text-accent font-semibold'
                    : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 border border-black/20"
                  style={{ backgroundColor: THEME_DOT_COLORS[id] }}
                />
                <span className="text-[11px] truncate">{t.themes[id]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day / Night Theme Selection when scheduled */}
      {themeSchedule && themeSchedule !== 'manual' && (
        <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-hover-subtle border border-line-subtle text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-ink-muted text-[11px] font-medium">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>{ar ? 'الثيم النهاري' : 'Day Theme'}</span>
            </div>
            <select
              value={dayTheme || 'paper'}
              onChange={(e) => onDayThemeChange?.(e.target.value as ThemeMode)}
              className="w-full py-1.5 px-2 rounded-lg bg-surface border border-line text-ink text-xs focus:outline-none focus:border-accent cursor-pointer"
            >
              {ALL_THEMES.map((id) => (
                <option key={id} value={id}>
                  {t.themes[id]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-ink-muted text-[11px] font-medium">
              <Moon className="w-3.5 h-3.5 text-accent" />
              <span>{ar ? 'الثيم الليلي' : 'Night Theme'}</span>
            </div>
            <select
              value={nightTheme || 'amoled'}
              onChange={(e) => onNightThemeChange?.(e.target.value as ThemeMode)}
              className="w-full py-1.5 px-2 rounded-lg bg-surface border border-line text-ink text-xs focus:outline-none focus:border-accent cursor-pointer"
            >
              {ALL_THEMES.map((id) => (
                <option key={id} value={id}>
                  {t.themes[id]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Keep Screen Awake While Reading Toggle */}
      {onKeepScreenAwakeChange && (
        <button
          type="button"
          role="switch"
          aria-checked={keepScreenAwake}
          onClick={() => onKeepScreenAwakeChange(!keepScreenAwake)}
          className="flex w-full items-center gap-3 rounded-2xl border border-line-subtle bg-hover-subtle p-3 text-start transition-colors active:bg-hover cursor-pointer"
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-ink">
              {ar ? 'إبقاء الشاشة مضاءة أثناء القراءة' : 'Keep Screen Awake While Reading'}
            </div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">
              {ar
                ? 'يمنع انطفاء الشاشة أو بهتان إضاءتها أثناء القراءة بهدوء، ويحرر القفل تلقائياً عند إغلاق الكتاب.'
                : 'Prevents display sleep or dimming while reading, releasing automatically when closed.'}
            </p>
          </div>
          <span
            aria-hidden="true"
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
              keepScreenAwake
                ? 'border-accent/50 bg-accent'
                : 'border-line-strong bg-hover-strong'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                keepScreenAwake ? 'start-6' : 'start-0.5'
              }`}
            />
          </span>
        </button>
      )}

      {/* Remember Theme Per Book Toggle */}
      {onRememberDocThemeChange && (
        <button
          type="button"
          role="switch"
          aria-checked={rememberDocTheme}
          onClick={() => onRememberDocThemeChange(!rememberDocTheme)}
          className="flex w-full items-center gap-3 rounded-2xl border border-line-subtle bg-hover-subtle p-3 text-start transition-colors active:bg-hover cursor-pointer"
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-ink">
              {ar ? 'تذكر بيئة القراءة لكل كتاب' : 'Remember Theme Per Book'}
            </div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">
              {ar
                ? 'يحفظ الثيم المختار لكل كتاب بمفرده، فتعود لكل رواية أو بحث بنفس مظهر القراءة المفضل له.'
                : 'Remembers your chosen theme for each book independently, so each document reopens with its preferred atmosphere.'}
            </p>
          </div>
          <span
            aria-hidden="true"
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
              rememberDocTheme
                ? 'border-accent/50 bg-accent'
                : 'border-line-strong bg-hover-strong'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                rememberDocTheme ? 'start-6' : 'start-0.5'
              }`}
            />
          </span>
        </button>
      )}
    </div>

    <div className="p-3 rounded-2xl bg-hover-subtle border border-line-subtle flex items-start gap-2.5 text-xs text-ink-muted">
      <Sparkles className="w-4 h-4 text-highlight shrink-0 mt-0.5" />
      <p className="leading-relaxed text-[11px] text-ink-muted">
        {ar
          ? 'تم تصميم قارئ Otium ليكون هادئاً بدون تشتيت، ويُطبَّق نوع الخط المختار فوراً على كافة واجهات القراءة.'
          : 'Otium is designed to stay quiet and distraction-free. Your selected font is applied instantly across the app.'}
      </p>
    </div>
  </div>
);
