// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { fetchRustEngineStatus, parsePptxWithRust, generateQrWithRust, generatePinWithRust } from './rustEngine';

describe('rustEngine platform integration', () => {
  it('returns web/WASM fallback status when not running in Tauri', async () => {
    const status = await fetchRustEngineStatus();
    expect(status.isActive).toBe(true);
    expect(status.version).toContain('Rust WASM / Web Mode');
    expect(status.modules).toContain('otium-core (Bilingual Typography, Search Normalization & 8 OLED Themes)');
  });

  it('safely returns null for native calls when not running in Tauri', async () => {
    const dummyBytes = new Uint8Array([1, 2, 3]);
    const pptx = await parsePptxWithRust(dummyBytes);
    expect(pptx).toBeNull();

    const qr = await generateQrWithRust('OTM-1234');
    expect(qr).toBeNull();

    const pin = await generatePinWithRust();
    expect(pin).toBeNull();
  });
});
