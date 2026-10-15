import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  /** Vista actual; el botón ofrece cambiar a la otra. */
  mode: 'map' | 'list';
  onPress: () => void;
  /** Distancia al borde inferior: un número o un valor animado (sube con Destacados). */
  bottom: number | Animated.AnimatedAddition<number>;
}

/**
 * Botón flotante «Lista» / «Mapa». Reemplaza al interruptor de dos botones que
 * ocupaba espacio junto al buscador. Lleva texto además del ícono para que se
 * entienda sin adivinar.
 */
export function ModeFab({ mode, onPress, bottom }: Props) {
  const toList = mode === 'map';
  return (
    <Animated.View style={[styles.wrap, { bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toList ? 'Ver como lista' : 'Ver en el mapa'}
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name={toList ? 'list' : 'map'} size={18} color={colors.primaryDark} />
        <Text style={styles.label}>{toList ? 'Lista' : 'Mapa'}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: spacing.md },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow,
  },
  pressed: { opacity: 0.85 },
  label: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
});
