import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { getSettings } from '@/lib/settings';
import { colors, radius, space, type } from '@/lib/theme';

export type { IconName };

export function tap(style: 'light' | 'medium' | 'success' | 'warning' | 'error' = 'light') {
  if (!getSettings().haptics) return;
  if (style === 'success' || style === 'warning' || style === 'error') {
    const map = { success: Haptics.NotificationFeedbackType.Success, warning: Haptics.NotificationFeedbackType.Warning, error: Haptics.NotificationFeedbackType.Error };
    void Haptics.notificationAsync(map[style]);
  } else {
    void Haptics.impactAsync(style === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
  }
}

// ----------------------------------------------------------------------------- layout

export function Screen({
  children,
  title,
  subtitle,
  back = true,
  right,
  edges = ['top', 'bottom'],
}: {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {title !== undefined && (
        <View style={styles.header}>
          {back ? (
            <IconButton icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} label="Back" />
          ) : (
            <View style={{ width: 4 }} />
          )}
          <View style={{ flex: 1, marginHorizontal: space.sm }}>
            <Text style={[type.heading, { fontSize: 18 }]} numberOfLines={1}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={type.caption} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
          {right}
        </View>
      )}
      {children}
    </SafeAreaView>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color = colors.text,
  size = 22,
  style,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.surface2 }, disabled && { opacity: 0.4 }, style]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

// ----------------------------------------------------------------------------- controls

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
  compact,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const bg = { primary: colors.accent, secondary: colors.surface, ghost: 'transparent', danger: colors.dangerSoft }[variant];
  const fg = { primary: colors.accentText, secondary: colors.text, ghost: colors.accent, danger: colors.danger }[variant];
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? colors.border : 'transparent' },
        pressed && { opacity: 0.85 },
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={compact ? 16 : 18} color={fg} style={{ marginRight: 8 }} />}
          <Text style={[styles.btnText, compact && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ marginBottom: space.lg }, style as any]}>
      <Text style={[type.label, { marginBottom: 6 }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, focused && { borderColor: colors.accent }, !!error && { borderColor: colors.danger }]}
      />
      {!!(error || hint) && <Text style={[type.caption, { marginTop: 6 }, !!error && { color: colors.danger }]}>{error || hint}</Text>}
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={{ color: active ? colors.text : colors.textMuted, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ----------------------------------------------------------------------------- display

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surface2 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ text, color = colors.textMuted, bg = colors.surface2, icon }: { text: string; color?: string; bg?: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <Icon name={icon} size={12} color={color} style={{ marginRight: 4 }} />}
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Stat({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.title, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.textMuted} />
      </View>
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: 6, marginBottom: space.lg }]}>{body}</Text>
      {action}
    </View>
  );
}

export function Notice({ tone = 'info', text, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success'; text: string; icon?: IconName }) {
  const c = { info: [colors.info, colors.infoSoft], warning: [colors.warning, colors.warningSoft], danger: [colors.danger, colors.dangerSoft], success: [colors.success, colors.successSoft] }[tone];
  const ic: IconName = icon ?? ({ info: 'information-circle', warning: 'warning', danger: 'alert-circle', success: 'checkmark-circle' } as const)[tone];
  return (
    <View style={[styles.notice, { backgroundColor: c[1] }]}>
      <Icon name={ic} size={17} color={c[0]} style={{ marginRight: 10, marginTop: 2 }} />
      <Text style={{ color: colors.text, flex: 1, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={type.label}>{children}</Text>
      {right}
    </View>
  );
}

// ----------------------------------------------------------------------------- toast

type Toast = { id: number; text: string; tone: 'info' | 'success' | 'danger' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback(
    (text: string, tone: Toast['tone'] = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), text, tone });
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
      }, 2800);
    },
    [anim],
  );
  const tone = toast?.tone ?? 'info';
  const color = { info: colors.info, success: colors.success, danger: colors.danger }[tone];
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            { top: insets.top + 10, borderLeftColor: color },
            { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
          ]}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '500' }}>{toast.text}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btn: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  btnCompact: { minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.sm },
  btnText: { fontSize: 16, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
  },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' },
  stat: { flex: 1, alignItems: 'flex-start' },
  empty: { alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: space.xxl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  notice: { flexDirection: 'row', padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm },
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    backgroundColor: '#24221E',
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderLeftWidth: 4,
    elevation: 6,
  },
});
