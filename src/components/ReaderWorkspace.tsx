import React, { useMemo, useRef } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { TextAnnotation } from '../core/types';
import type { ReaderController } from '../app/useReaderController';
import { PdfPage } from './PdfPage';
import { ErrorBoundary } from './ErrorBoundary';
import { PageSlot } from './ReaderPageSlot';
import { useDocumentInteraction } from './documentInkContext';
import { useTeaching } from './teachingContextValue';
import { useChromeTap } from '../core/reader/useChromeTap';
import { useReaderWorkspaceSync } from './useReaderWorkspaceSync';
import { ReaderWorkspaceProgressBar, ReaderWorkspaceReadingPill } from './ReaderWorkspaceProgress';

interface ReaderWorkspaceProps {
  reader: ReaderController;
  compact?: boolean;
}

/**
 * The reading surface shared by both shells. It owns layout, page geometry and
 * gestures; toolbars and platform navigation stay in the shells.
 */
export const ReaderWorkspace: React.FC<ReaderWorkspaceProps> = ({ reader, compact = false }) => {
  const { mode: interactionMode } = useDocumentInteraction();
  const teaching = useTeaching();
  const chromeTap = useChromeTap(compact && interactionMode === 'hand', () => reader.setIsImmersive(value => !value));
  const {
    doc,
    numPages,
    currentPage,
    zoom,
    setZoom,
    theme,
    viewMode,
    lang,
    baseAspectRatio,
    basePageSize,
    annotations,
    deleteAnnotation,
    searchQuery,
    activeSearchPage,
    isImmersive,
    setIsImmersive,
    handlePageVisible,
    goToNextPage,
    goToPrevPage,
    scrollContainerRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    dualFlipKey,
    numberJumpDisplay,
    scrollToPage
  } = reader;

  const isRtl = lang === 'ar';
  const docIsRtl = reader.docIsRtl;
  const mousePan = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null);

  const {
    compactLandscape,
    showScrubberPill,
    settledPage,
    scrubState,
    handleScrubberPointerDown,
    handleScrubberPointerMove,
    handleScrubberPointerUp,
    handleScrubberPointerLeave,
  } = useReaderWorkspaceSync({
    compact,
    doc,
    numPages,
    currentPage,
    zoom,
    setZoom,
    viewMode,
    basePageSize,
    isImmersive,
    interactionMode,
    handlePageVisible,
    scrollContainerRef,
    scrollToPage,
  });

  const continuousPages = useMemo(
    () => Array.from({ length: numPages }, (_, index) => index + 1),
    [numPages]
  );

  const EMPTY_ANNOTATIONS = useMemo<TextAnnotation[]>(() => [], []);
  const annotationsByPage = useMemo(() => {
    const displayed = reader.beamSelection ? [...annotations, reader.beamSelection] : annotations;
    if (!displayed.length) return null;
    const map = new Map<number, TextAnnotation[]>();
    for (const a of displayed) {
      const list = map.get(a.pageNumber);
      if (list) {
        list.push(a);
      } else {
        map.set(a.pageNumber, [a]);
      }
    }
    return map;
  }, [annotations, reader.beamSelection]);

  if (!doc) return null;

  const pagedAnimation = dualFlipKey > 0 ? 'otiumPageIn 160ms cubic-bezier(.2,.8,.2,1) both' : undefined;
  const dualAnimation = pagedAnimation;

  // Odd pages sit on the right in Arabic / RTL books and on the left in Latin / LTR books.
  // Using docIsRtl guarantees English books in Arabic UI are never mirrored or reversed.
  const reverseSpread = docIsRtl && currentPage % 2 === 1;

  // Anchored scrolling (page search, outline, mode switch) must land below the
  // floating toolbar instead of underneath it.
  const topInset = compactLandscape
    ? 'max(3rem, calc(env(safe-area-inset-top, 0px) + 2.6rem))'
    : compact
      ? 'max(4.1rem, calc(env(safe-area-inset-top, 0px) + 3.6rem))'
      : 'max(4.5rem, calc(env(safe-area-inset-top, 0px) + 4.2rem))';
  const immersiveInset = compactLandscape
    ? 'max(0.35rem, calc(env(safe-area-inset-top, 0px) + 0.25rem))'
    : 'max(0.5rem, env(safe-area-inset-top, 0px))';
  const effectiveTopInset = isImmersive ? immersiveInset : teaching.reachMode ? `calc(${topInset} + 30dvh)` : teaching.presentation ? immersiveInset : teaching.readerTools ? topInset : 'max(3.3rem, env(safe-area-inset-top, 0px))';
  const legacyBottomInset = isImmersive
    ? 'max(0.5rem, env(safe-area-inset-bottom, 0px))'
    : compactLandscape
      ? 'max(3.2rem, calc(env(safe-area-inset-bottom, 0px) + 2.8rem))'
      : compact
        ? reader.showMobileNavBar
          ? 'max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 5rem))'
          : 'max(2.5rem, calc(env(safe-area-inset-bottom, 0px) + 2rem))'
        : undefined;
  const bottomInset = isImmersive ? immersiveInset : `max(var(--teacher-bottom-inset, 150px), ${legacyBottomInset || '0px'})`;

  return (
    <div className="relative flex-1 w-full h-full overflow-hidden flex flex-col">
      <ReaderWorkspaceProgressBar
        lang={lang}
        isRtl={isRtl}
        compact={compact}
        isImmersive={isImmersive}
        currentPage={currentPage}
        numPages={numPages}
        scrubState={scrubState}
        showScrubberPill={showScrubberPill}
        settledPage={settledPage}
        numberJumpDisplay={numberJumpDisplay}
        arrivalGlowKey={reader.arrivalGlowKey || 0}
        onScrubberPointerDown={handleScrubberPointerDown}
        onScrubberPointerMove={handleScrubberPointerMove}
        onScrubberPointerUp={handleScrubberPointerUp}
        onScrubberPointerLeave={handleScrubberPointerLeave}
        onExitImmersive={() => setIsImmersive(false)}
      />

      {viewMode !== 'continuous' && teaching.readerTools && (
        <>
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            tabIndex={isImmersive ? -1 : undefined}
            title={lang === 'ar' ? 'الصفحة السابقة' : 'Previous page'}
            aria-label={lang === 'ar' ? 'الصفحة السابقة' : 'Previous page'}
            className={`paged-arrow spring-press fixed top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full text-ink disabled:opacity-0 transition-opacity duration-300 ${
              docIsRtl ? 'right-2 sm:right-5' : 'left-2 sm:left-5'
            }`}
            style={
              isImmersive
                ? { opacity: 0, pointerEvents: 'none' }
                : undefined
            }
          >
            {docIsRtl ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            tabIndex={isImmersive ? -1 : undefined}
            title={lang === 'ar' ? 'الصفحة التالية' : 'Next page'}
            aria-label={lang === 'ar' ? 'الصفحة التالية' : 'Next page'}
            className={`paged-arrow spring-press fixed top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full text-ink disabled:opacity-0 transition-opacity duration-300 ${
              docIsRtl ? 'left-2 sm:left-5' : 'right-2 sm:right-5'
            }`}
            style={
              isImmersive
                ? { opacity: 0, pointerEvents: 'none' }
                : undefined
            }
          >
            {docIsRtl ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </>
      )}

      {/* Main scrollable document viewport */}
      <div
        ref={scrollContainerRef}
        dir="ltr"
        role="main"
        aria-label={lang === 'ar' ? 'مساحة قراءة المستند' : 'Document reading area'}
        data-reader-mode={interactionMode}
        {...chromeTap}
        onPointerDown={event => {
          if (interactionMode !== 'hand' || event.pointerType !== 'mouse' || event.button !== 0 ||
            (event.target as HTMLElement).closest('button, input, textarea, a, select')) return;
          const container = event.currentTarget;
          mousePan.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: container.scrollLeft, top: container.scrollTop };
          container.setPointerCapture(event.pointerId); container.style.cursor = 'grabbing'; event.preventDefault();
        }}
        onPointerMove={event => {
          const pan = mousePan.current;
          if (!pan || pan.pointer !== event.pointerId) return;
          event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x);
          event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y);
        }}
        onPointerUp={event => {
          mousePan.current = null;
          event.currentTarget.style.cursor = interactionMode === 'hand' ? 'grab' : '';
        }}
        onPointerCancel={() => { mousePan.current = null; }}
        onLostPointerCapture={() => { mousePan.current = null; }}
        onTouchStart={interactionMode === 'hand' ? handleTouchStart : undefined}
        onTouchMove={interactionMode === 'hand' ? handleTouchMove : undefined}
        onTouchEnd={interactionMode === 'hand' ? handleTouchEnd : undefined}
        onTouchCancel={interactionMode === 'hand' ? handleTouchCancel : undefined}
        style={{
          cursor: interactionMode === 'hand' ? 'grab' : undefined,
          paddingTop: effectiveTopInset,
          scrollPaddingTop: effectiveTopInset,
          paddingBottom: bottomInset,
          transition:
            'padding-top 280ms cubic-bezier(0.22, 1, 0.36, 1), padding-bottom 280ms cubic-bezier(0.22, 1, 0.36, 1)',
          ...(compact
            ? {
                paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
                paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))'
              }
            : {}),
          touchAction: 'pan-x pan-y'
        }}
        className="reader-viewport flex-1 w-full h-full overflow-y-auto overflow-x-auto overscroll-contain pb-20 sm:pb-24 px-2 sm:px-4 relative"
      >

      {viewMode === 'continuous' ? (
        <div className="w-max min-w-full flex flex-col items-center">
          {continuousPages.map((pageNum) => {
            const distance = Math.abs(pageNum - currentPage);
            const isNear = distance <= (compact ? 2 : 3);
            const pageAnnotations = annotationsByPage
              ? (annotationsByPage.get(pageNum) ?? EMPTY_ANNOTATIONS)
              : EMPTY_ANNOTATIONS;

            return (
              <PageSlot
                key={pageNum}
                pageNum={pageNum}
                isNear={isNear}
                doc={doc}
                scale={zoom}
                theme={theme}
                annotations={pageAnnotations}
                onDeleteAnnotation={deleteAnnotation}
                baseAspectRatio={baseAspectRatio}
                basePageWidth={basePageSize.width}
                basePageHeight={basePageSize.height}
                searchQuery={searchQuery}
                isCurrentSearchPage={activeSearchPage === pageNum}
                lang={lang}
                renderPriority={isNear ? distance : 10}
              />
            );
          })}
        </div>
      ) : viewMode === 'dual' ? (
        <div className="min-h-full w-max min-w-full flex items-start justify-center py-2 sm:py-4 overflow-hidden">
          <div
            style={{
              willChange: 'transform'
            }}
          >
            <div
              key={`dual-${dualFlipKey}`}
              className="flex items-center justify-center gap-0 shadow-2xl rounded-sm overflow-hidden"
              style={{
                animation: dualAnimation,
                willChange: 'transform, opacity',
                flexDirection: reverseSpread ? 'row-reverse' : 'row'
              }}
            >
              <div className={`relative shrink-0 ${reverseSpread ? 'book-gutter-inner-left' : 'book-gutter-inner-right'}`}>
                <ErrorBoundary
                  resetKey={`dual-${currentPage}-${zoom}`}
                  fallback={(_err, reset) => (
                    <div
                      style={{
                        width: Math.round(basePageSize.width * zoom),
                        height: Math.round(basePageSize.height * zoom)
                      }}
                      className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-danger-ink/30 bg-surface/50 rounded-xl select-none"
                    >
                      <AlertTriangle className="w-8 h-8 text-danger-ink mb-2 opacity-80" />
                      <span className="text-xs font-semibold text-ink mb-1">
                        {lang === 'ar' ? `تعذر عرض الصفحة ${currentPage}` : `Failed to render page ${currentPage}`}
                      </span>
                      <button
                        type="button"
                        onClick={reset}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-medium cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                      </button>
                    </div>
                  )}
                >
                  <PdfPage
                    doc={doc}
                    pageNumber={currentPage}
                    scale={zoom}
                    theme={theme}
                    annotations={annotationsByPage ? (annotationsByPage.get(currentPage) ?? EMPTY_ANNOTATIONS) : EMPTY_ANNOTATIONS}
                    onDeleteAnnotation={deleteAnnotation}
                    baseAspectRatio={baseAspectRatio}
                    searchQuery={searchQuery}
                    isCurrentSearchPage={activeSearchPage === currentPage}
                    lang={lang}
                    renderPriority={0}
                  />
                </ErrorBoundary>
              </div>

              {currentPage + 1 <= numPages ? (
                <div className={`relative shrink-0 ${reverseSpread ? 'border-r book-gutter-inner-right' : 'border-l book-gutter-inner-left'} border-line/40`}>
                  <ErrorBoundary
                    resetKey={`dual-${currentPage + 1}-${zoom}`}
                    fallback={(_err, reset) => (
                      <div
                        style={{
                          width: Math.round(basePageSize.width * zoom),
                          height: Math.round(basePageSize.height * zoom)
                        }}
                        className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-danger-ink/30 bg-surface/50 rounded-xl select-none"
                      >
                        <AlertTriangle className="w-8 h-8 text-danger-ink mb-2 opacity-80" />
                        <span className="text-xs font-semibold text-ink mb-1">
                          {lang === 'ar' ? `تعذر عرض الصفحة ${currentPage + 1}` : `Failed to render page ${currentPage + 1}`}
                        </span>
                        <button
                          type="button"
                          onClick={reset}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-medium cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                        </button>
                      </div>
                    )}
                  >
                    <PdfPage
                      doc={doc}
                      pageNumber={currentPage + 1}
                      scale={zoom}
                      theme={theme}
                      annotations={annotationsByPage ? (annotationsByPage.get(currentPage + 1) ?? EMPTY_ANNOTATIONS) : EMPTY_ANNOTATIONS}
                      onDeleteAnnotation={deleteAnnotation}
                      baseAspectRatio={baseAspectRatio}
                      searchQuery={searchQuery}
                      isCurrentSearchPage={activeSearchPage === currentPage + 1}
                      lang={lang}
                      renderPriority={1}
                    />
                  </ErrorBoundary>
                </div>
              ) : (
                <div
                  style={{
                    width: Math.round(basePageSize.width * zoom),
                    height: Math.round(basePageSize.height * zoom)
                  }}
                  className="hidden sm:flex items-center justify-center border border-dashed border-line rounded-xs text-xs text-ink-faint font-mono"
                >
                  {lang === 'ar' ? 'نهاية المستند' : 'End of Document'}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            willChange: 'transform'
          }}
          className="min-h-full w-max min-w-full flex items-start justify-center py-2 sm:py-4 overflow-hidden"
        >
          <div
            key={`single-${dualFlipKey}`}
            style={{ animation: pagedAnimation, willChange: 'transform, opacity' }}
          >
            <ErrorBoundary
              resetKey={`single-${currentPage}-${zoom}`}
              fallback={(_err, reset) => (
                <div
                  style={{
                    width: Math.round(basePageSize.width * zoom),
                    height: Math.round(basePageSize.height * zoom)
                  }}
                  className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-danger-ink/30 bg-surface/50 rounded-xl select-none"
                >
                  <AlertTriangle className="w-8 h-8 text-danger-ink mb-2 opacity-80" />
                  <span className="text-xs font-semibold text-ink mb-1">
                    {lang === 'ar' ? `تعذر عرض الصفحة ${currentPage}` : `Failed to render page ${currentPage}`}
                  </span>
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-medium cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                  </button>
                </div>
              )}
            >
              <PdfPage
                doc={doc}
                pageNumber={currentPage}
                scale={zoom}
                theme={theme}
                annotations={annotationsByPage ? (annotationsByPage.get(currentPage) ?? EMPTY_ANNOTATIONS) : EMPTY_ANNOTATIONS}
                onDeleteAnnotation={deleteAnnotation}
                baseAspectRatio={baseAspectRatio}
                searchQuery={searchQuery}
                isCurrentSearchPage={activeSearchPage === currentPage}
                lang={lang}
                renderPriority={0}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}
      </div>

      <ReaderWorkspaceReadingPill
        lang={lang}
        isRtl={isRtl}
        compact={compact}
        isImmersive={isImmersive}
        currentPage={currentPage}
        numPages={numPages}
        showScrubberPill={showScrubberPill}
        settledPage={settledPage}
        numberJumpDisplay={numberJumpDisplay}
        arrivalGlowKey={reader.arrivalGlowKey || 0}
        onExitImmersive={() => setIsImmersive(false)}
      />
    </div>
  );
};
