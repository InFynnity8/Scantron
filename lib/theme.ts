import { useSyncExternalStore } from 'react';
import { Appearance, Platform, type StyleSheet } from 'react-native';

/**
 * Clean and clinical: white and cool greys, near-black text, one vivid blue for
 * actions, green / red for right / wrong. Bold sans-serif headings, flat
 * surfaces, hairline borders.
 *
 * `colors`, `type` and every `themed()` style sheet always read the active
 * palette, so switching modes re-renders the app without a restart.
 */
const light = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surface2: '#F0F2F5',
  surface3: '#E4E7EC',
  border: '#E3E6EB',
  text: '#0F1419',
  textMuted: '#536070',
  textFaint: '#98A2B3',
  accent: '#1F56E8',
  accentText: '#FFFFFF',
  accentSoft: '#E8EEFE',
  success: '#12804A',
  successSoft: '#E3F5EB',
  danger: '#D12F2F',
  dangerSoft: '#FDECEC',
  warning: '#B25E00',
  warningSoft: '#FFF2E0',
  info: '#2B6CB0',
  infoSoft: '#E8F1FB',
  overlay: 'rgba(15,20,25,0.55)',
  toast: '#1A2028',
  /** camera screen chrome (always dark, over the live preview) */
  camBar: 'rgba(12,15,20,0.78)',
  camText: '#FFFFFF',
  /** live overlay outline drawn on the camera feed */
  camGuide: '#FFFFFF',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#0B0D11',
  surface: '#14171D',
  surface2: '#1C2028',
  surface3: '#262B35',
  border: '#252A33',
  text: '#F2F4F7',
  textMuted: '#A3ADBD',
  textFaint: '#667085',
  accent: '#5E8BFF',
  accentText: '#FFFFFF',
  accentSoft: 'rgba(94,139,255,0.16)',
  success: '#3CCB7F',
  successSoft: 'rgba(60,203,127,0.14)',
  danger: '#FF6B6B',
  dangerSoft: 'rgba(255,107,107,0.14)',
  warning: '#F5A524',
  warningSoft: 'rgba(245,165,36,0.15)',
  info: '#6CA7EE',
  infoSoft: 'rgba(108,167,238,0.14)',
  overlay: 'rgba(0,0,0,0.6)',
  toast: '#262B35',
  camBar: 'rgba(12,15,20,0.78)',
  camText: '#FFFFFF',
  camGuide: '#FFFFFF',
};

/** Brand blue of the logo and app icon (same in both modes). */
export const BRAND = '#1F56E8';

export type ThemeMode = 'light' | 'dark' | 'system';

let mode: ThemeMode = 'light';
let resolved: 'light' | 'dark' = 'light';
let version = 0;
const listeners = new Set<() => void>();

function resolve(): 'light' | 'dark' {
  return mode === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : mode;
}

function apply() {
  const next = resolve();
  if (next === resolved) return;
  resolved = next;
  version++;
  listeners.forEach((l) => l());
}

export function setThemeMode(m: ThemeMode) {
  mode = m;
  apply();
}

Appearance.addChangeListener(() => {
  if (mode === 'system') apply();
});

/** Re-render on theme changes; returns the active scheme ('light' | 'dark'). */
export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => resolved,
  );
}

export const colors: Palette = new Proxy({} as Palette, {
  get: (_t, k: string) => (resolved === 'dark' ? dark : light)[k as keyof Palette],
});

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const font = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

function makeType() {
  return {
    display: { fontSize: 30, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.6 },
    title: { fontSize: 22, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.3 },
    heading: { fontSize: 16.5, fontWeight: '700' as const, color: colors.text },
    body: { fontSize: 15, color: colors.text, lineHeight: 21 },
    bodyMuted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    caption: { fontSize: 12.5, color: colors.textMuted },
    label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
  };
}

/**
 * A style sheet that follows the active theme. Use it like StyleSheet.create:
 * `const styles = themed(() => ({ card: { backgroundColor: colors.surface } }))`.
 */
export function themed<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(factory: () => T & StyleSheet.NamedStyles<any>): T {
  let cacheV = -1;
  let cache: T;
  const current = () => {
    if (cacheV !== version) {
      cache = factory();
      cacheV = version;
    }
    return cache;
  };
  return new Proxy({} as object, { get: (_t, k) => (current() as any)[k] }) as T;
}

export const type = themed(makeType);

export function scoreColor(pct: number | null | undefined): string {
  if (pct == null) return colors.textMuted;
  if (pct >= 70) return colors.success;
  if (pct >= 50) return colors.warning;
  return colors.danger;
}
