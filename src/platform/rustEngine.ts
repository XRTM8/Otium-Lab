import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './runtime';

export interface RustEngineStatus {
  version: string;
  isActive: boolean;
  modules: string[];
}

export interface RustSearchMatch {
  start_offset: number;
  end_offset: number;
}

function toUint8Array(payload: ArrayBuffer | number[]): Uint8Array {
  return payload instanceof ArrayBuffer ? new Uint8Array(payload) : new Uint8Array(payload);
}

export async function fetchRustEngineStatus(): Promise<RustEngineStatus> {
  if (!isTauriRuntime()) {
    return {
      version: '2.0.0-lab (Rust WASM / Web Mode)',
      isActive: true,
      modules: [
        'otium-core (Bilingual Typography, Search Normalization & 8 OLED Themes)',
        'otium-wasm (Web Worker Perspective Warp, Document Filters & Camera CV)',
        'otium-slides (PPTX Slide Presentation Engine)',
        'otium-beam (Smart Beam P2P Sync)',
      ],
    };
  }

  try {
    const raw = await invoke<{ version: string; is_active: boolean; modules: string[] }>('get_rust_engine_status');
    return {
      version: raw.version,
      isActive: raw.is_active,
      modules: raw.modules,
    };
  } catch (error) {
    console.warn('Failed to query native Rust engine status:', error);
    return {
      version: '2.0.0-lab (Core Native)',
      isActive: true,
      modules: ['otium-core', 'otium-wasm', 'otium-slides'],
    };
  }
}

/**
 * Fast native Rust PPTX parsing via otium-slides (raw binary IPC)
 */
export async function parsePptxWithRust(bytes: Uint8Array): Promise<unknown | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke('rust_parse_pptx', bytes);
  } catch (error) {
    console.warn('Rust PPTX parser fallback:', error);
    return null;
  }
}

/**
 * Native Rust QR code SVG generation via otium-beam
 */
export async function generateQrWithRust(payload: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<string>('rust_generate_beam_qr', { payload });
  } catch (error) {
    console.warn('Rust QR generator fallback:', error);
    return null;
  }
}

/**
 * Native Rust pairing PIN generation via otium-beam
 */
export async function generatePinWithRust(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<string>('rust_generate_pairing_pin');
  } catch {
    return null;
  }
}

/**
 * Native Rust Document Cleaner via raw binary IPC (Integer BT.601 + Otsu Adaptive Binarization)
 */
export async function cleanDocumentWithRust(bytes: Uint8Array, contrastBoost = 1.2): Promise<Uint8Array | null> {
  if (!isTauriRuntime()) return null;
  try {
    const cleaned = await invoke<ArrayBuffer | number[]>(
      'rust_clean_document_image',
      bytes,
      { headers: { 'x-contrast-boost': String(contrastBoost) } }
    );
    return toUint8Array(cleaned);
  } catch (error) {
    console.warn('Rust document cleaner fallback:', error);
    return null;
  }
}

/**
 * Native Rust ID Card Stitcher via raw binary IPC (Combines Front + Back on A4 300 DPI)
 */
export async function stitchIdCardWithRust(frontBytes: Uint8Array, backBytes: Uint8Array): Promise<Uint8Array | null> {
  if (!isTauriRuntime()) return null;
  try {
    const combined = new Uint8Array(frontBytes.byteLength + backBytes.byteLength);
    combined.set(frontBytes, 0);
    combined.set(backBytes, frontBytes.byteLength);
    const stitched = await invoke<ArrayBuffer | number[]>(
      'rust_stitch_id_cards',
      combined,
      { headers: { 'x-front-length': String(frontBytes.byteLength) } }
    );
    return toUint8Array(stitched);
  } catch (error) {
    console.warn('Rust ID card stitcher fallback:', error);
    return null;
  }
}

/**
 * Native Rust Arabic-aware search matching (Sub-millisecond diacritic & letter folding)
 */
export async function searchArabicTextWithRust(haystack: string, query: string): Promise<RustSearchMatch[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<RustSearchMatch[]>('rust_search_arabic_text', { haystack, query });
  } catch (error) {
    console.warn('Rust Arabic search fallback:', error);
    return null;
  }
}

/**
 * Cached Sub-Millisecond Arabic Trigram Inverted Index Search
 */
export async function searchArabicWithTrigramIndexRust(text: string, query: string): Promise<RustSearchMatch[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<RustSearchMatch[]>('rust_index_and_search_arabic', { text, query });
  } catch (error) {
    console.warn('Rust Trigram Index search fallback:', error);
    return null;
  }
}

/**
 * Native cached multi-page Arabic Trigram Index search returning 1-based matching page numbers.
 */
export async function searchDocumentPagesWithRust(
  docKey: string,
  query: string,
  pages: string[] | null
): Promise<number[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<number[]>('rust_search_document_pages_arabic', {
      docKey,
      pages,
      query,
    });
  } catch {
    return null;
  }
}
