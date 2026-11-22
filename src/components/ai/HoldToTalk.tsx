import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@/components/Icon';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors } from '@/theme';

/**
 * Botón de «mantén presionado para hablar» (2026-11-22): al presionar escucha, al soltar busca. Mientras escucha
 * crece y late un aro rojo. Sin dictado en el teléfono, un toque abre el teclado (onUnavailable).
 */
export function HoldToTalk({
  listening,
  available,
  onStart,
  onRelease,
  onUnavailable,
  size = 56,
}: {
  listening: boolean;
  available: boolean;
  onStart: () => void;
  onRelease: () => void;
  onUnavailable: () => void;
  size?: number;
}) {
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!listening || reduce) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [listening, reduce, pulse]);

  const ring = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
  };

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {listening ? <Animated.View pointerEvents="none" style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ring]} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={available ? 'Mantén presionado para hablar y suelta para buscar' : 'Escribir lo que necesitas'}
        accessibilityState={{ busy: listening }}
        onPressIn={available ? onStart : undefined}
        onPressOut={available ? onRelease : undefined}
        onPress={available ? undefined : onUnavailable}
        delayLongPress={10_000}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          (pressed || listening) && { transform: [{ scale: 1.12 }] },
        ]}
      >
        <Ionicons name={listening ? 'mic' : 'mic-outline'} size={size * 0.46} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, elevation: 3, shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  ring: { position: 'absolute', backgroundColor: colors.primary },
});
