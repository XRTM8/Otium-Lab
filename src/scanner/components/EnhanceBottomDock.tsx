import React from 'react';
import {
  Camera,
  CopyCheck,
  Crop,
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  Palette,
  Plus,
  RotateCw,
  Share2,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type { PdfCompressionPreset } from '../core/pdf';
import type { FilterType, ScannedPage } from '../core/types';
import { OtiumLogo } from './OtiumLogo';

export interface EnhanceBottomDockProps {
  safeIndex: number;
  pages: ScannedPage[];
  activeFilter: FilterType;
  isExtractingText: boolean;
  compressionPreset: PdfCompressionPreset;
  pdfGenerating: boolean;
  onEditCrop?: (index: number) => void;
  onRotateCurrentPage: () => void;
  onExtractTextFromPage: () => void;
  onRetakePage: (index: number) => void;
  onDuplicatePage?: (index: number) => void;
  onFilterSelect: (filter: FilterType) => void;
  onApplyFilterToAll: () => void;
  onSelectPageIndex: (idx: number) => void;
  onAddMorePages: () => void;
  onOpenAdvancedOptions: () => void;
  onOpenInOtium: () => void;
  onSharePdf: () => void;
  onDownloadJpg: () => void;
  onOpenMoreActions: () => void;
  triggerHaptic: (duration?: number) => void;
}

export const EnhanceBottomDock: React.FC<EnhanceBottomDockProps> = ({
  safeIndex,
  pages,
  activeFilter,
  isExtractingText,
  compressionPreset,
  pdfGenerating,
  onEditCrop,
  onRotateCurrentPage,
  onExtractTextFromPage,
  onRetakePage,
  onDuplicatePage,
  onFilterSelect,
  onApplyFilterToAll,
  onSelectPageIndex,
  onAddMorePages,
  onOpenAdvancedOptions,
  onOpenInOtium,
  onSharePdf,
  onDownloadJpg,
  onOpenMoreActions,
  triggerHaptic,
}) => (
  <div className="relative z-20 flex flex-col gap-2 px-3 pt-2 pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))] glass-panel border-t border-white/[0.08] font-arabic shrink-0">
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
      <button
        onClick={() => {
          triggerHaptic(15);
          onEditCrop?.(safeIndex);
        }}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-accent/15 text-accent border border-accent/30 text-xs font-bold active:scale-95 shrink-0"
        title="تعديل القص / Crop"
      >
        <Crop className="w-3.5 h-3.5" />
        <span>تعديل القص</span>
      </button>

      <button
        onClick={onRotateCurrentPage}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl glass-button text-gray-200 text-xs font-semibold active:scale-95 shrink-0"
        title="تدوير 90°"
      >
        <RotateCw className="w-3.5 h-3.5" />
        <span>تدوير</span>
      </button>

      <button
        onClick={onExtractTextFromPage}
        disabled={isExtractingText}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl glass-button text-gray-200 text-xs font-medium active:scale-95 shrink-0"
        title="استخراج وقراءة نصوص الصفحة (OCR)"
      >
        <FileText className="w-3.5 h-3.5 text-accent" />
        <span>{isExtractingText ? 'جاري القراءة...' : 'استخراج النص'}</span>
      </button>

      <button
        onClick={() => {
          triggerHaptic(15);
          onRetakePage(safeIndex);
        }}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl glass-button text-gray-200 text-xs font-medium active:scale-95 shrink-0"
        title="إعادة التقاط الصفحة بالكاميرا"
      >
        <Camera className="w-3.5 h-3.5 text-accent" />
        <span>إعادة التقاط</span>
      </button>

      {onDuplicatePage && (
        <button
          onClick={() => {
            triggerHaptic(15);
            onDuplicatePage(safeIndex);
          }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl glass-button text-gray-200 text-xs font-medium active:scale-95 shrink-0"
          title="مضاعفة هذه الصفحة"
        >
          <CopyCheck className="w-3.5 h-3.5" />
          <span>مضاعفة</span>
        </button>
      )}

      <div className="h-4 w-px bg-white/20 mx-1 shrink-0" />

      {(
        [
          { id: 'magic', label: 'ورق ناصع', icon: Sparkles },
          { id: 'clean', label: 'تنقية نصوص', icon: FileText },
          { id: 'vibrant', label: 'ملون فائق', icon: Palette },
          { id: 'bw', label: 'أبيض وأسود' },
          { id: 'grayscale', label: 'رمادي' },
          { id: 'vintage', label: 'أوراق قديمة' },
          { id: 'original', label: 'الأصلي' },
        ] as const
      ).map((item) => {
        const isActive = activeFilter === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onFilterSelect(item.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
              isActive
                ? 'bg-accent text-on-accent font-semibold shadow-md ring-1 ring-accent/40'
                : 'glass-button text-gray-300'
            }`}
          >
            {'icon' in item && item.icon && <item.icon className="w-3.5 h-3.5" />}
            <span>{item.label}</span>
          </button>
        );
      })}

      {pages.length > 1 && (
        <button
          onClick={onApplyFilterToAll}
          className="text-[10px] text-accent font-semibold underline underline-offset-2 ml-1 active:opacity-60 whitespace-nowrap shrink-0"
          title="تطبيق الفلتر على جميع الصفحات"
        >
          تطبيق على الكل
        </button>
      )}
    </div>

    {pages.length > 1 && (
      <div className="flex items-center gap-2 overflow-x-auto py-0.5 px-0.5 scrollbar-none">
        {pages.map((p, idx) => (
          <button
            key={p.id}
            onClick={() => {
              triggerHaptic(10);
              onSelectPageIndex(idx);
            }}
            className={`relative flex-shrink-0 w-10 h-14 rounded-lg overflow-hidden border-2 transition-all ${
              idx === safeIndex ? 'border-accent scale-105 shadow-md ring-2 ring-accent/40' : 'border-white/20 opacity-60'
            }`}
          >
            <img src={p.thumbnailDataUrl} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
            <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[8px] px-1 rounded text-white font-bold">
              {idx + 1}
            </span>
          </button>
        ))}

        <button
          onClick={() => {
            triggerHaptic(15);
            onAddMorePages();
          }}
          className="flex-shrink-0 w-10 h-14 rounded-lg border-2 border-dashed border-accent/50 flex flex-col items-center justify-center text-accent active:scale-95 glass-button"
          title="مسح صفحة إضافية"
        >
          <Plus className="w-4 h-4 mb-0.5" />
          <span className="text-[8px] font-semibold">إضافة</span>
        </button>
      </div>
    )}

    <div className="flex items-center justify-between px-1 text-xs text-gray-400 gap-2">
      <button
        onClick={() => {
          triggerHaptic(15);
          onOpenAdvancedOptions();
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-gray-200 text-xs font-semibold active:scale-95 transition-all shadow-sm shrink-0"
        title="خيارات حجم وضغط الـ PDF ومقاس A4 وثنية الكتب"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="whitespace-nowrap">خيارات PDF (A4)</span>
      </button>

      <span className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0">
        <span>الحجم التقريبي:</span>
        <span dir="ltr" className="text-accent font-bold font-mono inline-block">
          {compressionPreset === 'compact'
            ? `${Math.round(pages.length * 35)} KB`
            : compressionPreset === 'balanced'
              ? `${(pages.length * 0.18).toFixed(1)} MB`
              : `${(pages.length * 0.85).toFixed(1)} MB`}
        </span>
      </span>
    </div>

    <div className="flex items-center gap-1.5 mt-0.5">
      <button
        onClick={onOpenInOtium}
        disabled={pdfGenerating}
        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-accent hover:opacity-95 text-on-accent font-black text-xs active:scale-95 transition-all shadow-lg shadow-accent/25 disabled:opacity-50 cursor-pointer"
        title="فتح المستند في قارئ أو تيوم مباشرة"
      >
        <OtiumLogo size={16} className="text-current shrink-0" />
        <span className="font-bold text-xs truncate">فتح في القارئ</span>
      </button>

      <button
        onClick={onSharePdf}
        disabled={pdfGenerating}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl glass-button text-gray-200 hover:text-white font-bold text-xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        title="مشاركة وتصدير مستند الـ PDF"
      >
        <Share2 className="w-4 h-4 text-accent shrink-0" />
        <span className="text-xs truncate">مشاركة وتصدير</span>
      </button>

      <button
        onClick={onDownloadJpg}
        disabled={pdfGenerating}
        className="p-2.5 rounded-xl glass-button text-gray-200 hover:text-white active:scale-95 transition-transform shrink-0 disabled:opacity-50 cursor-pointer"
        title="حفظ الصفحة كصورة JPG"
      >
        <ImageIcon className="w-4 h-4 text-gray-300" />
      </button>

      <button
        onClick={onOpenMoreActions}
        className="p-2.5 rounded-xl glass-button text-gray-200 active:scale-95 transition-transform shrink-0"
        title="المزيد من الخيارات (طباعة، واتساب، تنزيل)"
      >
        <MoreHorizontal className="w-4 h-4 text-gray-300" />
      </button>
    </div>
  </div>
);
