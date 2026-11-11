// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchRustEngineStatus,
  parsePptxWithRust,
  generateQrWithRust,
  generatePinWithRust,
  cleanDocumentWithRust,
  stitchIdCardWithRust,
  searchDocumentPagesWithRust,
} from './rustEngine';

describe('rustEngine platform integration', () => {
  const originalTauriInternals = (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

  afterEach(() => {
    if (originalTauriInternals === undefined) {
      delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    } else {
      (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = originalTauriInternals;
    }
    vi.restoreAllMocks();
  });

  it('returns web/WASM fallback status when not running in Tauri', async () => {
    const status = await fetchRustEngineStatus();
    expect(status.isActive).toBe(true);
    expect(status.version).toContain('Rust WASM / Web Mode');
    expect(status.modules).toContain('otium-core (Bilingual Typography, Search Normalization & 8 OLED Themes)');
  });

  it('safely returns null for native calls when not running in Tauri', async () => {
    const dummyBytes = new Uint8Array([1, 2, 3]);
    expect(await parsePptxWithRust(dummyBytes)).toBeNull();
    expect(await generateQrWithRust('OTM-1234')).toBeNull();
    expect(await generatePinWithRust()).toBeNull();
    expect(await cleanDocumentWithRust(dummyBytes)).toBeNull();
    expect(await stitchIdCardWithRust(dummyBytes, dummyBytes)).toBeNull();
    expect(await searchDocumentPagesWithRust('doc-1', 'تجربة', ['محتوى تجربة'])).toBeNull();
  });

  it('passes raw Uint8Array payloads (not JSON number arrays) and forwards search cache commands in Tauri', async () => {
    const invokeMock = vi.fn(async (cmd: string, args?: unknown, options?: unknown) => {
      if (cmd === 'rust_clean_document_image') {
        return new Uint8Array([137, 80, 78, 71]).buffer;
      }
      if (cmd === 'rust_stitch_id_cards') {
        return new Uint8Array([1, 2, 3, 4]).buffer;
      }
      if (cmd === 'rust_search_document_pages_arabic') {
        return [2, 5];
      }
      if (cmd === 'rust_parse_pptx') {
        return { slides: [] };
      }
      return { cmd, args, options };
    });

    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: invokeMock,
    };

    const pptxInput = new Uint8Array([80, 75, 3, 4]);
    await parsePptxWithRust(pptxInput);
    expect(invokeMock).toHaveBeenCalledWith('rust_parse_pptx', pptxInput, undefined);

    const imgInput = new Uint8Array([10, 20, 30]);
    const cleaned = await cleanDocumentWithRust(imgInput, 1.35);
    expect(cleaned).toBeInstanceOf(Uint8Array);
    expect(invokeMock).toHaveBeenCalledWith('rust_clean_document_image', imgInput, {
      headers: { 'x-contrast-boost': '1.35' },
    });

    const front = new Uint8Array([1, 2]);
    const back = new Uint8Array([3, 4, 5]);
    const stitched = await stitchIdCardWithRust(front, back);
    expect(stitched).toBeInstanceOf(Uint8Array);
    const stitchCall = invokeMock.mock.calls.find(([cmd]) => cmd === 'rust_stitch_id_cards');
    expect(stitchCall?.[1]).toBeInstanceOf(Uint8Array);
    expect(Array.from(stitchCall?.[1] as Uint8Array)).toEqual([1, 2, 3, 4, 5]);
    expect(stitchCall?.[2]).toEqual({ headers: { 'x-front-length': '2' } });

    const hits = await searchDocumentPagesWithRust('doc-k', 'السلام', null);
    expect(hits).toEqual([2, 5]);
    expect(invokeMock).toHaveBeenCalledWith(
      'rust_search_document_pages_arabic',
      { docKey: 'doc-k', pages: null, query: 'السلام' },
      undefined
    );
  });
});
