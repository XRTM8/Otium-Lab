import { describe, expect, it } from 'vitest';
import {
  resolveWasmAssetUrl,
  runWasmDewarpSpine,
  runWasmFilter,
  runWasmMotionAndSharpness,
  runWasmWarpPerspective,
} from './wasmEngine';

describe('Rust scanner WASM engine helpers', () => {
  it('resolves subpath-safe WASM URLs for GitHub Pages and local origins', () => {
    expect(resolveWasmAssetUrl('https://xrtm8.github.io/Otium-Lab/', '')).toBe(
      'https://xrtm8.github.io/Otium-Lab/wasm/otium_wasm.wasm'
    );
    expect(resolveWasmAssetUrl('https://xrtm8.github.io/Otium-Lab/?room=OTM-1234', '')).toBe(
      'https://xrtm8.github.io/Otium-Lab/wasm/otium_wasm.wasm'
    );
    expect(resolveWasmAssetUrl('', 'http://localhost:4173/index.html')).toBe(
      'http://localhost:4173/wasm/otium_wasm.wasm'
    );
    expect(resolveWasmAssetUrl('', '')).toBe('./wasm/otium_wasm.wasm');
  });

  it('falls back to null safely in headless Node without Web Workers', async () => {
    const rgba = new Uint8ClampedArray(16 * 16 * 4).fill(200);
    expect(await runWasmFilter(rgba, 16, 16, 'original')).toBeNull();
    expect(await runWasmFilter(rgba, 16, 16, 'clean')).toBeNull();
    expect(
      await runWasmWarpPerspective(rgba, 16, 16, 8, 8, {
        topLeft: { x: 0, y: 0 },
        topRight: { x: 16, y: 0 },
        bottomRight: { x: 16, y: 16 },
        bottomLeft: { x: 0, y: 16 },
      })
    ).toBeNull();
    expect(await runWasmDewarpSpine(rgba, 16, 16, 0.5, 0.5)).toBeNull();
    expect(await runWasmMotionAndSharpness(rgba, 16, 16)).toBeNull();
  });
});
