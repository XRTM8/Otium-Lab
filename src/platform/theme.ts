import type { ThemeMode } from '../core/types';
import { getThemeBackground } from '../app/themeBackground';
import { isTauriRuntime } from './runtime';

const LIGHT_THEMES: readonly ThemeMode[] = ['paper', 'parchment', 'eink', 'pure', 'sakura'];
const ALL_THEMES: readonly ThemeMode[] = [
  'paper',
  'midnight',
  'amoled',
  'parchment',
  'amber',
  'eink',
  'pure',
  'sakura',
  'forest',
  'nordic'
];

export function isLightTheme(theme: ThemeMode): boolean {
  return LIGHT_THEMES.includes(theme);
}

/** Paints the document root so portals, dialogs and native bars share a theme. */
export function applyDomTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  for (const candidate of ALL_THEMES) {
    root.classList.toggle(`theme-${candidate}`, candidate === theme);
  }
  root.dataset.theme = theme;

  const background = getThemeBackground(theme);
  const light = isLightTheme(theme);
  root.style.colorScheme = light ? 'light' : 'dark';
  root.style.backgroundColor = background;
  if (document.body) document.body.style.backgroundColor = background;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', background);
}

/**
 * Physical Sovereign Curtain Transition (بردة الثيمات الملكية)
 * Hardware-accelerated top-to-bottom descending sheet with glowing edge.
 */
export function triggerThemeCurtain(toTheme: ThemeMode, onMidpoint?: () => void): void {
  if (typeof document === 'undefined') {
    onMidpoint?.();
    return;
  }

  // In test environments (Vitest / Happy-DOM), execute synchronously
  const isTestEnv =
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    Boolean(typeof window !== 'undefined' && (window as unknown as { __VITEST__?: boolean }).__VITEST__) ||
    !document.body;

  if (isTestEnv) {
    onMidpoint?.();
    return;
  }

  const bg = getThemeBackground(toTheme);

  // Cleanly remove any existing curtain instance
  const old = document.getElementById('otium-theme-curtain');
  if (old) old.remove();

  const curtain = document.createElement('div');
  curtain.id = 'otium-theme-curtain';
  curtain.className = 'otium-curtain-wrap';

  const sheet = document.createElement('div');
  sheet.className = 'otium-curtain-sheet';
  sheet.style.backgroundColor = bg;

  const edge = document.createElement('div');
  edge.className = 'otium-curtain-edge';
  sheet.appendChild(edge);

  curtain.appendChild(sheet);
  document.body.appendChild(curtain);

  // Switch underlying theme halfway through descent (~220ms)
  window.setTimeout(() => {
    onMidpoint?.();
  }, 220);

  // Fade out curtain once it completely covers viewport (~460ms)
  window.setTimeout(() => {
    curtain.classList.add('otium-curtain-fade');
    window.setTimeout(() => {
      curtain.remove();
    }, 240);
  }, 460);
}

// Backward compatibility alias
export const triggerThemeWaterfall = triggerThemeCurtain;

/**
 * Keeps the native chrome in step with the in-app theme:
 * - Windows: native dark/light title bar and resize background.
 * - Android: status/navigation bar colour plus icon appearance via OtiumTheme.
 */
export function syncNativeTheme(theme: ThemeMode): void {
  applyDomTheme(theme);

  const background = getThemeBackground(theme);
  const light = isLightTheme(theme);

  // Android: status/navigation bar colour plus icon appearance via OtiumTheme bridge
  if (typeof window !== 'undefined') {
    try {
      const bridge = (window as unknown as {
        OtiumTheme?: {
          setTheme?: (mode: string, background: string, lightTheme: boolean) => void;
        };
      }).OtiumTheme;
      if (bridge?.setTheme) {
        bridge.setTheme(light ? 'light' : 'dark', background, light);
        return;
      }
    } catch {
      // The native bridge is best-effort; the web UI is already themed.
    }
  }

  if (!isTauriRuntime()) return;

  void import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => {
      const current = getCurrentWindow();
      void current.setTheme(light ? 'light' : 'dark').catch(() => {});
      void current.setBackgroundColor(background).catch(() => {});
    })
    .catch(() => {
      // Browser previews do not expose the Tauri window API.
    });
}
