import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AnnotationQuad, AnnotationRect, TextAnnotation } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { useDocumentInteraction } from './documentInkContext';
import { HIGHLIGHT_COLORS } from '../core/storage/annotations';
import {
  canSpeakText,
  speakText,
  stopTts,
  type TtsHandle
} from '../platform/tts';
import { detectSpeechLanguage, prepareTextForSpeech } from '../core/tts/speechLanguage';
import {
  copyNormalizedSelectionText as copyText,
  createAnnotationRecord,
  getAccurateSelectionRects,
  mergeSelectionRects,
  pageElementFor,
  SELECTION_MENU_LABELS as LABELS,
  type SelectionState
} from './textSelectionGeometry';
import { TextSelectionToolbarCard } from './TextSelectionToolbarCard';

interface TextSelectionMenuProps {
  onAddAnnotation: (annotation: TextAnnotation) => void;
  onDeleteAnnotation?: (id: string) => void;
  annotations?: TextAnnotation[];
  onCopySuccess?: () => void;
  onSearchSelectedText?: (text: string) => void;
  onClipToBoard?: (text: string, pageNumber: number) => void;
  lang?: Language;
  /** Touch shells get a reachable bottom bar instead of a floating popover. */
  mobile?: boolean;
}

/**
 * Reading actions capture page-relative geometry while preserving the native
 * selection and its adjustment handles until an action is committed.
 */
export const TextSelectionMenu: React.FC<TextSelectionMenuProps> = ({
  onAddAnnotation,
  onDeleteAnnotation,
  annotations = [],
  onCopySuccess,
  onSearchSelectedText,
  onClipToBoard,
  lang = 'ar',
  mobile = false
}) => {
  const { mode, publishSelection } = useDocumentInteraction();
  const [prevMode, setPrevMode] = useState(mode);
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0].hex);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<{
    message: string;
    voiceSettings: boolean;
  } | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [expandedActions, setExpandedActions] = useState(false);

  if (prevMode !== mode) {
    setPrevMode(mode);
    if (mode !== 'select') {
      setSelectionState(null);
      setExpandedActions(false);
      setCopied(false);
      setSpeechError(null);
      setNoteMode(false);
      setNoteText('');
      setIsSpeaking(false);
    }
  }

  const menuRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<SelectionState | null>(null);
  const selectionSignatureRef = useRef('');
  const pointerActiveRef = useRef(false);
  const captureTimersRef = useRef<number[]>([]);
  const watchdogRef = useRef<number | null>(null);
  const speechHandleRef = useRef<TtsHandle | null>(null);
  const labels = LABELS[lang];

  useEffect(() => {
    selectionRef.current = selectionState;
    if (selectionState) {
      document.body.dataset.hasSelection = 'true';
    } else {
      delete document.body.dataset.hasSelection;
    }
    return () => {
      delete document.body.dataset.hasSelection;
    };
  }, [selectionState]);

  const stopSpeech = useCallback(() => {
    speechHandleRef.current?.cancel();
    speechHandleRef.current = null;
    stopTts();
    setIsSpeaking(false);
  }, []);

  const clearCaptureTimers = useCallback(() => {
    for (const timer of captureTimersRef.current) window.clearTimeout(timer);
    captureTimersRef.current = [];
  }, []);

  const clearSelection = useCallback(() => {
    clearCaptureTimers();
    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    selectionRef.current = null;
    selectionSignatureRef.current = '';
    publishSelection(null);
    setSelectionState(null);
    setExpandedActions(false);
    setCopied(false);
    setSpeechError(null);
    setNoteMode(false);
    setNoteText('');
    stopSpeech();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // Selection APIs are unavailable in a few embedded webviews.
    }
  }, [clearCaptureTimers, stopSpeech, publishSelection]);

  useEffect(() => {
    if (mode === 'select') return;
    clearCaptureTimers();
    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    selectionRef.current = null;
    selectionSignatureRef.current = '';
    publishSelection(null);
    speechHandleRef.current?.cancel();
    speechHandleRef.current = null;
    stopTts();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // Selection APIs are unavailable in a few embedded webviews.
    }
  }, [mode, clearCaptureTimers, publishSelection]);

  const captureSelection = useCallback(() => {
    if (mode !== 'select') return false;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;

    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (!text) return false;

    const range = selection.getRangeAt(0);
    const startPage = pageElementFor(range.startContainer);
    const endPage = pageElementFor(range.endContainer);

    // Cross-page selections would produce ambiguous page-relative rects.
    if (!startPage || !endPage || startPage !== endPage) return false;

    const pageRect = startPage.getBoundingClientRect();
    if (!pageRect.width || !pageRect.height) return false;

    const lines = mergeSelectionRects(getAccurateSelectionRects(range), pageRect);
    if (lines.length === 0) return false;

    const rects: AnnotationRect[] = lines.map((line) => ({
      xPct: Math.max(0, Math.min(1, (line.left - pageRect.left) / pageRect.width)),
      yPct: Math.max(0, Math.min(1, (line.top - pageRect.top) / pageRect.height)),
      widthPct: Math.max(0.004, Math.min(1, (line.right - line.left) / pageRect.width)),
      heightPct: Math.max(0.004, Math.min(1, (line.bottom - line.top) / pageRect.height))
    }));

    const firstRect = lines[0];
    const lastRect = lines[lines.length - 1];
    const selectionTop = firstRect.top;
    const selectionBottom = lastRect.bottom;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const centerX = (Math.min(...lines.map((line) => line.left)) + Math.max(...lines.map((line) => line.right))) / 2;
    const barHeight = 96;
    const hasRoomAbove = selectionTop > barHeight + 22;
    const hasRoomBelow = selectionBottom + barHeight + 22 < viewportHeight;
    // Prefer above the selection; near the top edge flip below it.
    const isTop = hasRoomAbove;
    const halfWidth = Math.min(168, (viewportWidth - 16) / 2);
    const x = Math.min(viewportWidth - 8 - halfWidth, Math.max(8 + halfWidth, centerX));
    const rawY = isTop
      ? Math.max(12, selectionTop - 12)
      : hasRoomBelow
        ? selectionBottom + 12
        : Math.max(12, viewportHeight - barHeight - 12);

    const nextState: SelectionState = {
      text,
      pageNumber: Number.parseInt(startPage.dataset.pageNumber || '1', 10),
      rects,
      quadPoints: rects.map<AnnotationQuad>((rect) => [
        rect.xPct,
        rect.yPct,
        rect.xPct + rect.widthPct,
        rect.yPct + rect.heightPct
      ]),
      screenRects: lines.map((line) => ({
        left: line.left,
        top: line.top,
        width: line.right - line.left,
        height: line.bottom - line.top
      })),
      coords: {
        x,
        y: rawY,
        isTop
      }
    };

    const signature = [
      nextState.pageNumber,
      nextState.text,
      ...rects.map(
        (rect) =>
          `${rect.xPct.toFixed(4)},${rect.yPct.toFixed(4)},${rect.widthPct.toFixed(4)},${rect.heightPct.toFixed(4)}`
      )
    ].join('|');

    const changed =
      !selectionRef.current || selectionSignatureRef.current !== signature;

    const previousCoords = selectionRef.current?.coords;
    selectionRef.current = nextState;
    selectionSignatureRef.current = signature;

    // selectionchange fires repeatedly while Android finalises the selection.
    // Re-rendering identical geometry would reset the note editor, so only a
    // genuinely different selection replaces the visible state.
    if (!changed) {
      if (!mobile && (previousCoords?.x !== x || previousCoords?.y !== rawY || previousCoords?.isTop !== isTop)) {
        setSelectionState(previous => previous ? { ...previous, coords: nextState.coords } : previous);
      }
      return true;
    }

    setSelectionState(nextState);
    publishSelection({ page: nextState.pageNumber, rects: nextState.rects });
    setCopied(false);
    setSpeechError(null);
    setNoteMode(false);
    setNoteText('');
    stopSpeech();
    return true;
  }, [stopSpeech, mode, publishSelection, mobile]);

  const scheduleCapture = useCallback(
    (delays: number[], clearWhenEmpty = false) => {
      clearCaptureTimers();
      const attempts = delays.length > 0 ? delays : [0];

      attempts.forEach((delay, index) => {
        const timer = window.setTimeout(() => {
          captureTimersRef.current = captureTimersRef.current.filter(
            (candidate) => candidate !== timer
          );

          const captured = captureSelection();
          const isLastAttempt = index === attempts.length - 1;
          if (!isLastAttempt || captured || !clearWhenEmpty || !selectionRef.current) {
            return;
          }

          const selection = window.getSelection();
          const stillEmpty =
            !selection || selection.isCollapsed || !selection.toString().trim();
          if (stillEmpty) clearSelection();
        }, delay);
        captureTimersRef.current.push(timer);
      });
    },
    [captureSelection, clearCaptureTimers, clearSelection]
  );

  const stopSelectionWatchdog = useCallback(() => {
    if (watchdogRef.current === null) return;
    window.clearInterval(watchdogRef.current);
    watchdogRef.current = null;
  }, []);

  /**
   * Android WebView can swallow pointerup after a long-press selection and
   * delay `selectionchange` until the next layout. Poll briefly after any
   * touch on the page so the action bar never waits for a scroll.
   */
  const startSelectionWatchdog = useCallback(() => {
    stopSelectionWatchdog();
    const startedAt = performance.now();

    watchdogRef.current = window.setInterval(() => {
      const selection = window.getSelection();
      const hasSelection = Boolean(
        selection && !selection.isCollapsed && selection.toString().trim()
      );

      if (hasSelection) {
        stopSelectionWatchdog();
        scheduleCapture([100], false);
        return;
      }

      if (performance.now() - startedAt > 5000) stopSelectionWatchdog();
    }, 110);
  }, [scheduleCapture, stopSelectionWatchdog]);

  useEffect(() => {
    if (mode !== 'select') return;
    const handlePointerDown = (event: PointerEvent) => {
      if (mode !== 'select') return;
      pointerActiveRef.current = true;
      if (menuRef.current?.contains(event.target as Node)) return;

      // Dragging Android's native selection handles starts with a pointerdown
      // on the page. Keep the menu alive so the selection can still be
      // adjusted; tapping outside the page dismisses it.
      const target = event.target as HTMLElement | null;
      const insidePage = Boolean(target?.closest?.('[data-pdf-page]'));

      if (!insidePage) {
        if (selectionRef.current) clearSelection();
        return;
      }

      if (!selectionRef.current) startSelectionWatchdog();
    };

    const handlePointerUp = (event: PointerEvent) => {
      pointerActiveRef.current = false;
      if (menuRef.current?.contains(event.target as Node)) return;
      scheduleCapture([60, 180], true);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      pointerActiveRef.current = false;
      if (menuRef.current?.contains(event.target as Node)) return;
      scheduleCapture(mobile ? [0, 80, 220, 420] : [0, 50], true);
    };

    const handlePointerCancel = () => {
      pointerActiveRef.current = false;
    };

    // Android finalises a long-press selection after the finger is already
    // down, and sometimes swallows pointerup entirely. selectionchange is the
    // only reliable signal, so capture on it even while the pointer is active.
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const hasSelection = Boolean(
        selection && !selection.isCollapsed && selection.toString().trim()
      );

      if (hasSelection) {
        scheduleCapture([100], false);
        return;
      }

      if (!pointerActiveRef.current && selectionRef.current) {
        scheduleCapture([140, 300], true);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearSelection();
    };

    const handleScroll = () => {
      // The mobile action bar is pinned to the bottom and does not need to
      // follow the selection. Clearing here is what made the menu disappear
      // whenever Android nudged the page for its selection handles.
      if (selectionRef.current) scheduleCapture([140], false);
    };

    const handleResize = () => {
      if (!mobile && selectionRef.current) clearSelection();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('pointercancel', handlePointerCancel, true);
    document.addEventListener('touchend', handleTouchEnd, true);
    document.addEventListener('touchcancel', handlePointerCancel, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('pointercancel', handlePointerCancel, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('touchcancel', handlePointerCancel, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      clearCaptureTimers();
      stopSelectionWatchdog();
      speechHandleRef.current?.cancel();
      speechHandleRef.current = null;
      stopTts();
    };
  }, [
    mode,
    clearCaptureTimers,
    clearSelection,
    mobile,
    scheduleCapture,
    startSelectionWatchdog,
    stopSelectionWatchdog
  ]);

  if (!selectionState) return null;

  const overlappingAnnotation = annotations.find(
    (annotation) =>
      annotation.pageNumber === selectionState.pageNumber &&
      (annotation.text.includes(selectionState.text) ||
        selectionState.text.includes(annotation.text) ||
        annotation.rects.some((annotationRect) =>
          selectionState.rects.some(
            (selectionRect) =>
              Math.abs(annotationRect.yPct - selectionRect.yPct) < 0.015 &&
              Math.max(annotationRect.xPct, selectionRect.xPct) <
                Math.min(
                  annotationRect.xPct + annotationRect.widthPct,
                  selectionRect.xPct + selectionRect.widthPct
                )
          )
        ))
  );

  const createAnnotation = (type: TextAnnotation['type'], color: string, note?: string) => {
    const annotation = createAnnotationRecord(selectionState, type, color, note);
    onAddAnnotation(annotation);
    clearSelection();
  };

  const handleCopy = async () => {
    const ok = await copyText(selectionState.text);
    if (!ok) return;
    setCopied(true);
    onCopySuccess?.();
    window.setTimeout(() => setCopied(false), 900);
  };

  const handleSearch = () => {
    if (!onSearchSelectedText) return;
    onSearchSelectedText(selectionState.text);
    clearSelection();
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeech();
      return;
    }

    setSpeechError(null);
    if (!canSpeakText()) {
      setSpeechError({ message: labels.speechUnsupported, voiceSettings: false });
      return;
    }

    const speechLang = detectSpeechLanguage(selectionState.text, lang);
    const textToSpeak = prepareTextForSpeech(selectionState.text);
    const noVoiceMessage =
      speechLang === 'ar' ? labels.speechNoArabicVoice : labels.speechNoEnglishVoice;

    let settled = false;
    const handle = speakText(textToSpeak, speechLang, 0.98, {
      onStart: () => {
        settled = true;
        setIsSpeaking(true);
      },
      onEnd: () => {
        settled = true;
        speechHandleRef.current = null;
        setIsSpeaking(false);
      },
      onError: (code) => {
        settled = true;
        speechHandleRef.current = null;
        setIsSpeaking(false);
        setSpeechError({
          message: code === 'language' ? noVoiceMessage : labels.speechFailed,
          voiceSettings: code === 'language'
        });
      }
    });

    if (settled) {
      handle.cancel();
      return;
    }

    speechHandleRef.current = handle;
    setIsSpeaking(true);
  };

  const barStyle: React.CSSProperties = {
    left: `${selectionState.coords.x}px`,
    top: selectionState.coords.isTop
      ? `max(${selectionState.coords.y}px, calc(env(safe-area-inset-top, 0px) + 104px))`
      : `min(${selectionState.coords.y}px, calc(100dvh - env(safe-area-inset-bottom, 0px) - 104px))`,
    transform: selectionState.coords.isTop ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
  };

  return (
    <TextSelectionToolbarCard
      menuRef={menuRef}
      lang={lang}
      mobile={mobile}
      barStyle={barStyle}
      selectionState={selectionState}
      overlappingAnnotation={overlappingAnnotation}
      selectedColor={selectedColor}
      setSelectedColor={setSelectedColor}
      copied={copied}
      isSpeaking={isSpeaking}
      speechError={speechError}
      noteMode={noteMode}
      setNoteMode={setNoteMode}
      noteText={noteText}
      setNoteText={setNoteText}
      expandedActions={expandedActions}
      setExpandedActions={setExpandedActions}
      createAnnotation={createAnnotation}
      onDeleteAnnotation={onDeleteAnnotation}
      onSearchSelectedText={onSearchSelectedText}
      onClipToBoard={onClipToBoard}
      handleCopy={() => void handleCopy()}
      handleSearch={handleSearch}
      toggleSpeech={toggleSpeech}
      clearSelection={clearSelection}
    />
  );
};
