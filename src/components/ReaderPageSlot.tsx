import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextAnnotation, ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { PdfPage } from './PdfPage';
import { ErrorBoundary } from './ErrorBoundary';

export interface PageSlotProps {
  pageNum: number;
  isNear: boolean;
  doc: PDFDocumentProxy;
  scale: number;
  theme: ThemeMode;
  annotations: TextAnnotation[];
  onDeleteAnnotation: (id: string) => void;
  baseAspectRatio: number;
  basePageWidth?: number;
  basePageHeight?: number;
  searchQuery?: string;
  isCurrentSearchPage?: boolean;
  lang: Language;
  renderPriority: number;
}

const PageSlotView: React.FC<PageSlotProps> = ({
  pageNum,
  isNear,
  doc,
  scale,
  theme,
  annotations,
  onDeleteAnnotation,
  baseAspectRatio,
  basePageWidth = 595,
  basePageHeight = 842,
  searchQuery,
  isCurrentSearchPage,
  lang,
  renderPriority
}) => {
  const standardWidth = Math.round(basePageWidth * scale);
  const standardHeight = Math.round(basePageHeight * scale);

  return (
    <div
      id={`pdf-page-${pageNum}`}
      dir="ltr"
      data-page-slot={pageNum}
      style={{
        width: `${standardWidth}px`,
        height: `${standardHeight}px`,
        contain: 'layout paint'
      }}
      className="pdf-page-frame my-4 sm:my-5 mx-auto flex items-center justify-center"
    >
      {isNear ? (
        <ErrorBoundary
          resetKey={`${pageNum}-${scale}`}
          fallback={(err, reset) => (
            <div
              style={{ width: `${standardWidth}px`, height: `${standardHeight}px` }}
              className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-danger-ink/30 bg-surface/50 rounded-xl select-none"
            >
              <AlertTriangle className="w-8 h-8 text-danger-ink mb-2 opacity-80" />
              <span className="text-xs font-semibold text-ink mb-1">
                {lang === 'ar' ? `تعذر عرض الصفحة ${pageNum}` : `Failed to render page ${pageNum}`}
              </span>
              <p className="text-[10px] text-ink-muted mb-3 max-w-[220px] truncate">
                {err.message || (lang === 'ar' ? 'خطأ غير متوقع' : 'Unexpected error')}
              </p>
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-medium cursor-pointer active:scale-95 transition-transform"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
              </button>
            </div>
          )}
        >
          <PdfPage
            doc={doc}
            pageNumber={pageNum}
            scale={scale}
            theme={theme}
            annotations={annotations}
            onDeleteAnnotation={onDeleteAnnotation}
            baseAspectRatio={baseAspectRatio}
            searchQuery={searchQuery}
            isCurrentSearchPage={isCurrentSearchPage}
            lang={lang}
            renderPriority={renderPriority}
          />
        </ErrorBoundary>
      ) : (
        <div
          style={{ width: `${standardWidth}px`, height: `${standardHeight}px` }}
          className="flex items-center justify-center rounded-sm border border-dashed border-line-subtle bg-hover-subtle font-mono text-xs opacity-25 select-none"
        >
          <span>{lang === 'ar' ? `صفحة ${pageNum}` : `Page ${pageNum}`}</span>
        </div>
      )}
    </div>
  );
};

export const PageSlot = React.memo(PageSlotView);
