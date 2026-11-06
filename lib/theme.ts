import { useSyncExternalStore } from 'react';
import { Appearance, Platform, type StyleSheet } from 'react-native';

/**
 * "Paper and ink". Light (default): warm paper, ink text, fountain-pen blue.
 * Dark: the same palette at night - warm charcoal, soft ink-blue accent.
 * Flat surfaces with hairline borders, red / green as a teacher marks.
 *
 * `colors`, `type` and every `themed()` style sheet always read the active
 * palette, so switching modes re-renders the app without a restart.
 */
const light = {
  bg: '#F5F2EB',
  surface: '#FFFFFF',
  surface2: '#EEEAE1',
  surface3: '#E3DED2',
  border: '#DED8CB',
  text: '#1D1C19',
  textMuted: '#5E5A51',
  textFaint: '#9A9488',
  accent: '#2247C4',
  accentText: '#FFFFFF',
  accentSoft: '#E4E9F8',
  success: '#1D7F48',
  successSoft: '#E1F0E6',
  danger: '#C2362B',
  dangerSoft: '#F8E3E0',
  warning: '#A86400',
  warningSoft: '#F7EBD6',
  info: '#2F6390',
  infoSoft: '#E2ECF4',
  overlay: 'rgba(20,19,16,0.62)',
  toast: '#24221E',
  /** camera screen chrome (always dark, over the live preview) */
  camBar: 'rgba(20,19,16,0.78)',
  camText: '#FFFFFF',
  /** live overlay outline drawn on the camera feed */
  camGuide: '#FFFFFF',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#151412',
  surface: '#1E1C19',
  surface2: '#282622',
  surface3: '#33302B',
  border: '#3A3731',
  text: '#EEEBE4',
  textMuted: '#ADA89D',
  textFaint: '#777369',
  accent: '#8EA6F5',
  accentText: '#10142A',
  accentSoft: 'rgba(142,166,245,0.16)',
  success: '#62C690',
  successSoft: 'rgba(98,198,144,0.14)',
  danger: '#F2857A',
  dangerSoft: 'rgba(242,133,122,0.14)',
  warning: '#E5AA45',
  warningSoft: 'rgba(229,170,69,0.15)',
  info: '#86B6DE',
  infoSoft: 'rgba(134,182,222,0.14)',
  overlay: 'rgba(0,0,0,0.64)',
  toast: '#3A3731',
  camBar: 'rgba(20,19,16,0.78)',
  camText: '#FFFFFF',
  camGuide: '#FFFFFF',
};

/** Brand blue of the logo and app icon (same in both modes). */
export const BRAND = '#2247C4';

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
export const radius = { sm: 6, md: 10, lg: 12, xl: 16, pill: 999 } as const;

export const font = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
};

function makeType() {
  return {
    display: { fontSize: 32, fontWeight: '700' as const, color: colors.text, fontFamily: font.serif },
    title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
    heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
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
