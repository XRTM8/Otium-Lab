import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFilterAsync } from './filters';

const filterMocks = vi.hoisted(() => ({
  runWasmFilter: vi.fn<() => Promise<Uint8ClampedArray | null>>().mockResolvedValue(null),
  canvasToPngBytes: vi.fn<() => Promise<Uint8Array | null>>().mockResolvedValue(null),
  cleanDocumentWithRust: vi.fn<() => Promise<Uint8Array | null>>().mockResolvedValue(null),
  drawPngBytesOnCanvas: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
}));

vi.mock('./wasmEngine', () => ({
  runWasmFilter: filterMocks.runWasmFilter,
}));

vi.mock('../../platform/rustEngine', () => ({
  canvasToPngBytes: filterMocks.canvasToPngBytes,
  cleanDocumentWithRust: filterMocks.cleanDocumentWithRust,
  drawPngBytesOnCanvas: filterMocks.drawPngBytesOnCanvas,
}));

function makeStubCanvas(width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  rgba.fill(200);
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: rgba, width, height })),
    createImageData: vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
    putImageData: vi.fn(),
    fillRect: vi.fn(),
  };
  return {
    width,
    height,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
}

describe('document filters engine', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    filterMocks.runWasmFilter.mockReset().mockResolvedValue(null);
    filterMocks.canvasToPngBytes.mockReset().mockResolvedValue(null);
    filterMocks.cleanDocumentWithRust.mockReset().mockResolvedValue(null);
    filterMocks.drawPngBytesOnCanvas.mockReset().mockResolvedValue(false);
  });
  it('original filter returns canvas unchanged without DOM manipulation', async () => {
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    const result = await applyFilterAsync(mockCanvas, 'original');
    expect(result).toBe(mockCanvas);
  });

  it('safely catches error and returns source canvas when canvas context fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    // Under headless node environment without document.createElement, applyFilter catches error and returns sourceCanvas
    const result = await applyFilterAsync(mockCanvas, 'magic');
    expect(result).toBe(mockCanvas);
    warnSpy.mockRestore();
  });

  it('safely handles all filter presets under headless node fallback without crashing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    const presets = ['clean', 'vibrant', 'bw', 'grayscale', 'vintage'] as const;
    for (const preset of presets) {
      const result = await applyFilterAsync(mockCanvas, preset);
      expect(result).toBe(mockCanvas);
    }
    warnSpy.mockRestore();
  });

  it('uses native Rust clean filter when WASM returns null and native IPC succeeds', async () => {
    const destCanvas = makeStubCanvas(8, 8);
    vi.stubGlobal('document', { createElement: () => destCanvas });
    filterMocks.runWasmFilter.mockResolvedValueOnce(null);
    filterMocks.canvasToPngBytes.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    filterMocks.cleanDocumentWithRust.mockResolvedValueOnce(new Uint8Array([4, 5, 6]));
    filterMocks.drawPngBytesOnCanvas.mockResolvedValueOnce(true);

    const source = { width: 8, height: 8 } as HTMLCanvasElement;
    const result = await applyFilterAsync(source, 'clean');
    expect(result).toBe(destCanvas);
    expect(filterMocks.cleanDocumentWithRust).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 1.2);
    expect(filterMocks.drawPngBytesOnCanvas).toHaveBeenCalledTimes(1);
  });

  it('falls back cleanly to JS clean filter when both WASM and native Rust return null', async () => {
    const destCanvas = makeStubCanvas(8, 8);
    vi.stubGlobal('document', { createElement: () => destCanvas });
    filterMocks.runWasmFilter.mockResolvedValueOnce(null);
    filterMocks.canvasToPngBytes.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    filterMocks.cleanDocumentWithRust.mockResolvedValueOnce(null);

    const source = { width: 8, height: 8 } as HTMLCanvasElement;
    const result = await applyFilterAsync(source, 'clean');
    expect(result).toBe(destCanvas);
    expect(filterMocks.cleanDocumentWithRust).toHaveBeenCalledTimes(1);
    const ctx = destCanvas.getContext('2d') as unknown as { putImageData: ReturnType<typeof vi.fn> };
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
  });

  it('keeps the source canvas when no drawing context is available', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    const source = makeStubCanvas(8, 8);
    expect(await applyFilterAsync(source, 'magic')).toBe(source);
    expect(filterMocks.runWasmFilter).not.toHaveBeenCalled();
  });

  it('uses the JS filter after a WASM failure and can use the worker on retry', async () => {
    const destCanvas = makeStubCanvas(8, 8);
    vi.stubGlobal('document', { createElement: () => destCanvas });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    filterMocks.runWasmFilter.mockRejectedValueOnce(new Error('WASM crashed'));
    const source = makeStubCanvas(8, 8);
    expect(await applyFilterAsync(source, 'magic')).toBe(destCanvas);
    const context = destCanvas.getContext('2d');
    expect(context?.putImageData).toHaveBeenCalledOnce();
    filterMocks.runWasmFilter.mockResolvedValueOnce(new Uint8ClampedArray(8 * 8 * 4).fill(110));
    expect(await applyFilterAsync(source, 'magic')).toBe(destCanvas);
    expect(context?.createImageData).toHaveBeenCalledWith(8, 8);
    expect(context?.putImageData).toHaveBeenCalledTimes(2);
  });
});
