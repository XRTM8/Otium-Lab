import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderController } from '../../app/useReaderController';
import { ReaderWorkspace } from '../../components/ReaderWorkspace';
import { useTeaching } from '../../components/TeachingContext';
import { ResizeDivider } from './ResizeDivider';
import type { BoardSnippet } from '../types';
import { computeOptimalPageScale } from '../../core/reader/device';

const BoardCanvas = lazy(() =>
  import('./BoardCanvas').then((m) => ({ default: m.BoardCanvas }))
);
const AreaSnippetModal = lazy(() =>
  import('./AreaSnippetModal').then((m) => ({ default: m.AreaSnippetModal }))
);

interface BoardSplitWorkspaceProps {
  reader: ReaderController;
  snippets: BoardSnippet[]; onAddSnippet: (snippet: BoardSnippet) => void;
  onRemoveSnippet: (id: string) => void;
  onUpdateSnippetPosition: (id: string, x: number, y: number) => void;
  onRestoreSnippets: (snippets: BoardSnippet[]) => void;
}
export const BoardSplitWorkspace: React.FC<BoardSplitWorkspaceProps> = ({ reader, snippets, onAddSnippet, onRemoveSnippet, onUpdateSnippetPosition, onRestoreSnippets }) => {
  const teaching = useTeaching();
  const containerRef = useRef<HTMLDivElement>(null);
  const { layout, setLayout, setTarget } = teaching;
  const [splitPercent, setSplitPercent] = useState(() => layout === 'document' ? 100 : layout === 'board' ? 0 : 50);
  const [boardMounted, setBoardMounted] = useState(() => layout !== 'document');
  const [isDragging, setIsDragging] = useState(false);
  const [isAreaClipOpen, setIsAreaClipOpen] = useState(false);
  const requestAreaClip = useCallback(() => setIsAreaClipOpen(true), []);
  useEffect(() => {
    setSplitPercent(previous => {
      const next = layout === 'document' ? 100 : layout === 'board' ? 0 : previous > 0 && previous < 100 ? previous : 50;
      return previous === next ? previous : next;
    });
  }, [layout]);
  useEffect(() => {
    if (splitPercent < 100 || isDragging) setBoardMounted(true);
  }, [splitPercent, isDragging]);
  useEffect(() => { setLayout('document'); }, [reader.docId, setLayout]);
  const { doc, scrollContainerRef, setZoom, basePageSize, viewMode } = reader;
  const wasDraggingRef = useRef(false);
  useEffect(() => {
    if (isDragging) {
      wasDraggingRef.current = true;
      return;
    }
    if (!wasDraggingRef.current || !doc || splitPercent === 0) return;
    wasDraggingRef.current = false;
    const frame = requestAnimationFrame(() => {
      const viewport = scrollContainerRef.current;
      if (!viewport?.clientWidth || !viewport.clientHeight) return;
      setZoom(computeOptimalPageScale(basePageSize.width, basePageSize.height, viewport.clientWidth, viewport.clientHeight, viewMode));
    });
    return () => cancelAnimationFrame(frame);
  }, [splitPercent, isDragging, doc, scrollContainerRef, setZoom, basePageSize.width, basePageSize.height, viewMode]);
  const finishDrag = (dragging: boolean) => {
    setIsDragging(dragging);
    if (!dragging) {
      if (splitPercent === 0) setLayout('board');
      else if (splitPercent === 100) setLayout('document');
    }
  };
  return <div ref={containerRef} data-board-resizing={isDragging} dir={reader.lang === 'ar' ? 'rtl' : 'ltr'} className="relative flex-1 w-full h-full flex overflow-hidden">
    <div hidden={splitPercent === 0} onPointerDownCapture={() => setTarget('document')} style={{ flex: `0 0 ${splitPercent}%`, width: `${splitPercent}%` }} className="relative h-full overflow-hidden flex-col">
      <ReaderWorkspace reader={reader} />
    </div>
    {((splitPercent > 0 && splitPercent < 100) || isDragging) && <ResizeDivider splitPercent={splitPercent} onSplitChange={setSplitPercent} isDragging={isDragging} setIsDragging={finishDrag} containerRef={containerRef} isRtl={reader.lang === 'ar'} />}
    {/* Switching views never discards a lesson; mount the board lazily on first open. */}
    <div hidden={splitPercent === 100} onPointerDownCapture={() => setTarget('board')} style={{ flex: `0 0 ${100 - splitPercent}%`, width: `${100 - splitPercent}%` }} className="relative h-full overflow-hidden flex-col">
      {boardMounted && (
        <Suspense fallback={null}>
          <BoardCanvas key={reader.docId} documentId={reader.docId!} theme={reader.theme} lang={reader.lang} snippets={snippets} onRestoreSnippets={onRestoreSnippets} onRemoveSnippet={onRemoveSnippet} onUpdateSnippetPosition={onUpdateSnippetPosition} onRequestAreaClip={requestAreaClip} />
        </Suspense>
      )}
    </div>
    {isAreaClipOpen && (
      <Suspense fallback={null}>
        <AreaSnippetModal isOpen={isAreaClipOpen} currentPage={reader.currentPage} lang={reader.lang} onClose={() => setIsAreaClipOpen(false)} onSnippetCaptured={onAddSnippet} />
      </Suspense>
    )}
  </div>;
};
