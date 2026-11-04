import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  /** Píldora opcional a la derecha del botón primario (ej. el monto total "$28.000"). */
  badgeRight?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false, badgeRight, style }: Props) {
  const isDisabled = disabled || loading;
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    if (reduce) return;
    Animated.spring(scale, {
      toValue,
      friction: 7,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={badgeRight ? `${title}, ${badgeRight}` : title}
        accessibilityState={{ disabled: isDisabled }}
        onPress={onPress}
        onPressIn={() => animateTo(0.975)}
        onPressOut={() => animateTo(1)}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.base,
          variant === 'primary' && styles.primary,
          variant === 'secondary' && styles.secondary,
          variant === 'ghost' && styles.ghost,
          badgeRight && variant === 'primary' ? styles.splitLayout : null,
          pressed && variant === 'primary' && styles.primaryPressed,
          pressed && variant === 'secondary' && styles.secondaryPressed,
          pressed && variant === 'ghost' && styles.pressed,
          isDisabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} />
        ) : badgeRight && variant === 'primary' ? (
          <>
            <Text style={styles.label}>{title}</Text>
            <View style={styles.badgePill}>
              <Text style={styles.badgeText}>{badgeRight}</Text>
            </View>
          </>
        ) : (
          <Text style={[styles.label, variant !== 'primary' && styles.labelAlt]}>{title}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitLayout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: spacing.xl,
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryDark },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  secondaryPressed: {
    backgroundColor: colors.selectedSoft,
    borderColor: colors.selected,
  },
  ghost: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  label: { color: '#fff', fontSize: 15.5, fontFamily: fonts.ui.extrabold },
  labelAlt: { color: colors.ink },
  badgePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14, 35, 70, 0.26)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: fonts.display.bold,
    fontVariant: ['tabular-nums'],
  },
});
