// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quad } from '../core/types';
import { useCropInteraction } from './useCropInteraction';

vi.mock('../core/edgeDetection', () => ({
  detectDocumentCorners: vi.fn(() => null),
  getFullFrameQuad: vi.fn((w: number, h: number): Quad => [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]),
}));

describe('useCropInteraction', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('initializes quad from loaded image dimensions and supports aspect ratio + undo/redo', async () => {
    const ref: { current: ReturnType<typeof useCropInteraction> | null } = { current: null };
    const mockImg = document.createElement('img');
    Object.defineProperty(mockImg, 'naturalWidth', { value: 1000, configurable: true });
    Object.defineProperty(mockImg, 'naturalHeight', { value: 800, configurable: true });
    Object.defineProperty(mockImg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 400, right: 500, bottom: 400 }),
      configurable: true,
    });
    const onConfirm = vi.fn();

    function Harness() {
      const hook = useCropInteraction({
        imageSrc: 'data:image/png;base64,AAAA',
        onConfirm,
      });
      useEffect(() => {
        ref.current = hook;
      });
      return <div />;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      ref.current!.imageRef.current = mockImg;
      ref.current!.handleImageLoad();
    });
    expect(ref.current!.imageSize).toEqual({ width: 1000, height: 800 });
    expect(ref.current!.quad).not.toBeNull();
    const initialQuad = ref.current!.quad;

    await act(async () => {
      ref.current!.applyAspectRatio(1);
    });
    expect(ref.current!.quad).not.toEqual(initialQuad);
    expect(ref.current!.undoStack.length).toBeGreaterThan(0);

    await act(async () => {
      ref.current!.handleUndo();
    });
    expect(ref.current!.quad).toEqual(initialQuad);
    expect(ref.current!.redoStack.length).toBeGreaterThan(0);

    await act(async () => {
      ref.current!.handleRedo();
    });
    expect(ref.current!.quad).not.toEqual(initialQuad);
  });
});
