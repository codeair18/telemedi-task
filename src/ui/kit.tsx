// Wspólne elementy UI: duże przyciski, wysoki kontrast (intent.md 13.7).
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#FFFFFF',
  text: '#111111',
  muted: '#4A4A4A',
  primary: '#0B57D0',
  primaryText: '#FFFFFF',
  danger: '#B3261E',
  dangerBg: '#FCE8E6',
  border: '#C4C7C5',
  card: '#F2F4F7',
  ok: '#146C2E',
};

type Variant = 'primary' | 'secondary' | 'danger';

export function BigButton(props: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { label, onPress, variant = 'primary', disabled, style } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'danger' && { backgroundColor: colors.danger },
        variant === 'secondary' && styles.secondary,
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

export function Busy({ label }: { label: string }) {
  return (
    <View style={styles.busy}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 20, gap: 16, backgroundColor: colors.bg },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  question: { fontSize: 24, fontWeight: '600', color: colors.text, lineHeight: 32 },
  body: { fontSize: 18, color: colors.text, lineHeight: 26 },
  muted: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  label: { fontSize: 16, fontWeight: '700', color: colors.muted },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    color: colors.text,
  },
  button: {
    minHeight: 60,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.primary },
  buttonText: { fontSize: 20, fontWeight: '700', color: colors.primaryText, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 8 },
  busy: { alignItems: 'center', gap: 16, paddingVertical: 40 },
  disclaimer: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: 14,
    borderRadius: 12,
  },
});
