import { Platform } from 'react-native';

/**
 * "Paper and ink": a warm paper background, near-black ink text, a fountain-pen
 * blue accent, and the red / green a teacher marks with. Flat surfaces with
 * hairline borders - no glows or gradients.
 */
export const colors = {
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
  /** camera screen chrome (always dark, over the live preview) */
  camBar: 'rgba(20,19,16,0.78)',
  camText: '#FFFFFF',
  /** live overlay outline drawn on the camera feed */
  camGuide: '#FFFFFF',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 12, xl: 16, pill: 999 } as const;

export const font = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
};

export const type = {
  display: { fontSize: 32, fontWeight: '700' as const, color: colors.text, fontFamily: font.serif },
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  bodyMuted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  caption: { fontSize: 12.5, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
};

export function scoreColor(pct: number | null | undefined): string {
  if (pct == null) return colors.textMuted;
  if (pct >= 70) return colors.success;
  if (pct >= 50) return colors.warning;
  return colors.danger;
}
