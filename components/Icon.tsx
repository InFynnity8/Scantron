import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';

/**
 * One icon set for the whole app: thin Feather line icons, with a few
 * Material Community glyphs where Feather has no equivalent. Screens use the
 * semantic names below, never a font family directly.
 */
const ICONS = {
  add: ['f', 'plus'],
  'alert-circle': ['f', 'alert-circle'],
  'arrow-forward': ['f', 'arrow-right'],
  'bulb-outline': ['m', 'lightbulb-on-outline'],
  'camera-outline': ['f', 'camera'],
  checkmark: ['f', 'check'],
  'checkmark-circle': ['f', 'check-circle'],
  'checkmark-done': ['m', 'check-all'],
  'chevron-back': ['f', 'arrow-left'],
  'chevron-forward': ['f', 'chevron-right'],
  close: ['f', 'x'],
  'cloud-download-outline': ['f', 'download-cloud'],
  'cloud-offline-outline': ['f', 'cloud-off'],
  'cloud-outline': ['f', 'cloud'],
  'copy-outline': ['f', 'copy'],
  'create-outline': ['f', 'edit-2'],
  'document-text-outline': ['f', 'file-text'],
  'download-outline': ['f', 'download'],
  'eye-outline': ['f', 'eye'],
  flash: ['f', 'zap'],
  'flash-off': ['f', 'zap-off'],
  'hand-left': ['m', 'hand-back-left-outline'],
  'images-outline': ['f', 'image'],
  'information-circle': ['f', 'info'],
  'information-circle-outline': ['f', 'info'],
  'key-outline': ['f', 'key'],
  'print-outline': ['f', 'printer'],
  'radio-button-off': ['m', 'radiobox-blank'],
  'radio-button-on': ['m', 'radiobox-marked'],
  refresh: ['f', 'refresh-cw'],
  scan: ['m', 'line-scan'],
  'scan-outline': ['m', 'line-scan'],
  'settings-outline': ['f', 'settings'],
  'text-outline': ['f', 'type'],
  'trash-outline': ['f', 'trash-2'],
  warning: ['f', 'alert-triangle'],
  sheet: ['m', 'file-document-outline'],
  user: ['f', 'user'],
  'log-out': ['f', 'log-out'],
} as const satisfies Record<string, readonly ['f' | 'm', string]>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color: string; style?: StyleProp<TextStyle> }) {
  const [family, glyph] = ICONS[name];
  return family === 'f' ? (
    <Feather name={glyph as any} size={size} color={color} style={style} />
  ) : (
    <MaterialCommunityIcons name={glyph as any} size={size} color={color} style={style} />
  );
}
