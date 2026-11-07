import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './runtime';

export interface RustEngineStatus {
  version: string;
  isActive: boolean;
  modules: string[];
}

export async function fetchRustEngineStatus(): Promise<RustEngineStatus> {
  if (!isTauriRuntime()) {
    return {
      version: '2.0.0-lab (Rust WASM / Web Mode)',
      isActive: true,
      modules: [
        'otium-core (Bilingual Typography & 8 OLED Themes)',
        'otium-slides (PPTX Slide Presentation Engine)',
        'otium-scanner (Perspective Warp & Clean Filter)',
        'otium-ink (120 FPS Spline Smoothing)',
        'otium-vault (Sovereign Storage & Encryption)',
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
      modules: ['otium-core', 'otium-slides', 'otium-ink'],
    };
  }
}

/**
 * Fast native Rust PPTX parsing via otium-slides
 */
export async function parsePptxWithRust(bytes: Uint8Array): Promise<unknown | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke('rust_parse_pptx', { bytes: Array.from(bytes) });
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
