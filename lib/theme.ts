import { Platform } from 'react-native';

export const colors = {
  bg: '#0E1015',
  surface: '#161921',
  surface2: '#1E222C',
  surface3: '#272C38',
  border: '#2B303C',
  text: '#F3F4F6',
  textMuted: '#9AA3B2',
  textFaint: '#6B7280',
  accent: '#FFD600',
  accentText: '#161921',
  accentSoft: 'rgba(255,214,0,0.12)',
  success: '#22C55E',
  successSoft: 'rgba(34,197,94,0.14)',
  danger: '#F05252',
  dangerSoft: 'rgba(240,82,82,0.14)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245,158,11,0.15)',
  info: '#3B82F6',
  infoSoft: 'rgba(59,130,246,0.15)',
  overlay: 'rgba(5,6,10,0.72)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const font = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const type = {
  display: { fontSize: 30, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.2 },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyMuted: { fontSize: 14, color: colors.textMuted },
  caption: { fontSize: 12, color: colors.textMuted },
  label: { fontSize: 12, fontWeight: '700' as const, color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};

export function scoreColor(pct: number | null | undefined): string {
  if (pct == null) return colors.textMuted;
  if (pct >= 70) return colors.success;
  if (pct >= 50) return colors.warning;
  return colors.danger;
}
