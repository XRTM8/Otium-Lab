// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  detectDocumentCornersWithConfidence,
  calculateLaplacianSharpness,
  detectDocumentCorners,
  getFullFrameQuad,
} from './edgeDetection';
import { expandQuadSafetyMargin, getQuadAspectRatio, isQuadConvex } from './geometry';
import type { Quad } from './types';

describe('edgeDetection & document analysis intelligence', () => {
  it('safely handles zero-dimension sources without throwing', () => {
    const fakeZeroImage = { width: 0, height: 0 } as HTMLImageElement;
    const res = detectDocumentCornersWithConfidence(fakeZeroImage);

    expect(res.confidence).toBe(0);
    expect(res.isDocumentPresent).toBe(false);
    expect(isQuadConvex(res.quad)).toBe(true);
  });

  it('honors forceFullFrame override', () => {
    const fakeImage = { width: 1000, height: 1414 } as HTMLImageElement;
    const res = detectDocumentCornersWithConfidence(fakeImage, true);

    expect(res.confidence).toBe(100);
    expect(res.isDocumentPresent).toBe(true);
    expect(res.orientation).toBe('portrait');
    expect(res.quad.topLeft.x).toBe(5);
    expect(res.quad.topRight.x).toBe(995);
  });

  it('calculates aspect ratio correctly for A4 portrait document', () => {
    const a4Quad: Quad = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1000, y: 0 },
      bottomRight: { x: 1000, y: 1414 },
      bottomLeft: { x: 0, y: 1414 },
    };

    const ratio = getQuadAspectRatio(a4Quad);
    expect(ratio).toBeCloseTo(1000 / 1414, 2);
  });

  it('expands quad safety margin outward to safeguard text', () => {
    const initialQuad: Quad = {
      topLeft: { x: 100, y: 100 },
      topRight: { x: 900, y: 100 },
      bottomRight: { x: 900, y: 900 },
      bottomLeft: { x: 100, y: 900 },
    };

    const expanded = expandQuadSafetyMargin(initialQuad, 1000, 1000, 0.05);

    // Top-left should move further towards (0, 0)
    expect(expanded.topLeft.x).toBeLessThan(initialQuad.topLeft.x);
    expect(expanded.topLeft.y).toBeLessThan(initialQuad.topLeft.y);

    // Bottom-right should move further towards (1000, 1000)
    expect(expanded.bottomRight.x).toBeGreaterThan(initialQuad.bottomRight.x);
    expect(expanded.bottomRight.y).toBeGreaterThan(initialQuad.bottomRight.y);

    expect(isQuadConvex(expanded)).toBe(true);
  });

  it('calculateLaplacianSharpness returns 0 on empty input', () => {
    const fakeEmpty = { width: 0, height: 0 } as HTMLImageElement;
    expect(calculateLaplacianSharpness(fakeEmpty)).toBe(0);
  });
});

function canvasWithPixels(width: number, height: number, shade: (x: number, y: number) => number) {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data.fill(shade(x, y), i, i + 3);
      data[i + 3] = 255;
    }
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data }),
  } as Partial<CanvasRenderingContext2D> as CanvasRenderingContext2D);
  return source;
}

describe('document edge detection', () => {
  it('finds an inset portrait page against a contrasting background', () => {
    const source = canvasWithPixels(140, 200, (x, y) =>
      x >= 17 && x < 123 && y >= 24 && y < 176 ? 240 : 35,
    );
    const result = detectDocumentCornersWithConfidence(source);
    expect(result).toMatchObject({ isDocumentPresent: true, aspectCategory: 'a4', orientation: 'portrait' });
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.sharpness).toBeGreaterThan(0);
    expect(result.quad.topLeft.x).toBeCloseTo(17, -1);
    expect(result.quad.topLeft.y).toBeCloseTo(24, -1);
    expect(result.quad.bottomRight.x).toBeCloseTo(123, -1);
    expect(result.quad.bottomRight.y).toBeCloseTo(176, -1);
  });

  it('uses the full frame on request and handles a source with no dimensions', () => {
    const source = document.createElement('canvas');
    source.width = 200;
    source.height = 140;
    expect(detectDocumentCorners(source, true)).toEqual(getFullFrameQuad(200, 140, 0.005));
    expect(detectDocumentCornersWithConfidence(source, true)).toMatchObject({
      isDocumentPresent: true, confidence: 100, orientation: 'landscape',
    });
    source.width = 0;
    expect(detectDocumentCornersWithConfidence(source)).toMatchObject({
      isDocumentPresent: false, confidence: 0, sharpness: 0,
    });
  });

  it('returns an inset crop if Canvas cannot provide pixels', () => {
    const source = document.createElement('canvas');
    const inset = getFullFrameQuad(source.width, source.height, 0.035);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(detectDocumentCornersWithConfidence(source)).toMatchObject({
      quad: inset, isDocumentPresent: false, confidence: 20,
    });
    getContext.mockImplementation(() => { throw new Error('canvas unavailable'); });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(detectDocumentCornersWithConfidence(source)).toMatchObject({
      quad: inset, isDocumentPresent: false, confidence: 15,
    });
  });
});
