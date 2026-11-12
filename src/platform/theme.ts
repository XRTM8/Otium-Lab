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
/**
 * Silky Top-to-Bottom Sovereign Theme Waterfall
 * Uses the browser-native View Transitions API with polygon clip-path wipe.
 * Content remains 100% visible — no cheap blank colored curtain blocking the page!
 */
export function triggerThemeTransition(_theme: ThemeMode, updateThemeCallback: () => void): void {
  if (typeof document === 'undefined') {
    updateThemeCallback();
    return;
  }

  // Unit test environments (Vitest / Happy-DOM) execute synchronously
  const isTestEnv =
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    Boolean(typeof window !== 'undefined' && window.__VITEST__) ||
    !document.body;

  if (isTestEnv) {
    updateThemeCallback();
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => {
      ready?: Promise<void>;
      finished?: Promise<void>;
    };
  };

  if (typeof doc.startViewTransition === 'function') {
    try {
      // Instantly freeze background transitions so the new DOM snapshot captures 100% final colors
      document.documentElement.classList.add('theme-transitioning');

      const transition = doc.startViewTransition(() => {
        updateThemeCallback();
      });

      if (transition && typeof transition.ready?.then === 'function') {
        transition.ready
          .then(() => {
            try {
              document.documentElement.animate(
                {
                  clipPath: [
                    'ellipse(135% 0% at 50% -10%)',
                    'ellipse(135% 150% at 50% -10%)'
                  ]
                },
                {
                  duration: 500,
                  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  pseudoElement: '::view-transition-new(root)'
                }
              );
            } catch {
              // CSS otiumThemeWaterfall fallback is active
            }
          })
          .catch(() => {
            document.documentElement.classList.remove('theme-transitioning');
          });

        transition.finished
          ?.then(undefined, (err: unknown) => {
            console.debug('[Theme] View transition finished listener:', err);
          })
          .finally(() => {
            document.documentElement.classList.remove('theme-transitioning');
          });
      } else {
        window.setTimeout(() => {
          document.documentElement.classList.remove('theme-transitioning');
        }, 500);
      }
      return;
    } catch {
      document.documentElement.classList.remove('theme-transitioning');
    }
  }

  // Smooth fallback for browsers without View Transitions: scoped CSS color transition
  try {
    document.documentElement.classList.add('theme-fallback-transition');
    updateThemeCallback();
    window.setTimeout(() => {
      document.documentElement.classList.remove('theme-fallback-transition');
    }, 400);
  } catch {
    updateThemeCallback();
  }
}

export const triggerThemeCurtain = (theme: ThemeMode, onMidpoint?: () => void) => {
  triggerThemeTransition(theme, () => {
    onMidpoint?.();
  });
};

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
      const bridge = window.OtiumTheme;
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
      void current.setTheme(light ? 'light' : 'dark').then(undefined, (err: unknown) => {
        console.debug('[Theme] Native window setTheme skipped:', err);
      });
      void current.setBackgroundColor(background).then(undefined, (err: unknown) => {
        console.debug('[Theme] Native window setBackgroundColor skipped:', err);
      });
    })
    .catch(() => {
      // Browser previews do not expose the Tauri window API.
    });
}
