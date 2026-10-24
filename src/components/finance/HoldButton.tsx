import { useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticTap } from '@/lib/haptics';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { alpha, colors, fonts, radius } from '@/theme';

// Registrar dinero pide intención (3.45): un toque suelto o un dedo que resbala no registran nada. Se mantiene pulsado
// mientras la barra se llena; al llenarse vibra y confirma. Soltar antes la vacía. Con el lector de pantalla no se
// puede mantener pulsado, así que activar pide una confirmación aparte.

export const HOLD_MS = 650;

type Tone = 'in' | 'out' | 'ink';

export function HoldButton({ label, onConfirm, onEarly, tone = 'ink', disabled = false, big = false }: { label: string; onConfirm: () => void; onEarly?: () => void; tone?: Tone; disabled?: boolean; big?: boolean }) {
  const reduce = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const [pressing, setPressing] = useState(false);
  const done = useRef(false);

  const start = () => {
    if (disabled) return;
    done.current = false;
    setPressing(true);
    Animated.timing(progress, { toValue: 1, duration: reduce ? 450 : HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      done.current = true;
      setPressing(false);
      progress.setValue(0);
      hapticTap();
      onConfirm();
    });
  };

  const stop = () => {
    if (done.current || disabled) return;
    progress.stopAnimation();
    setPressing(false);
    Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: true }).start();
    onEarly?.();
  };

  const confirmAlert = () => {
    if (disabled) return;
    Alert.alert('¿Registrar?', label.replace(/^Mantén para registrar\s*/, ''), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Registrar', onPress: onConfirm },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Mantén pulsado para registrar"
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && confirmAlert()}
      onPressIn={start}
      onPressOut={stop}
      delayLongPress={10_000}
      style={[styles.base, big && styles.big, styles[tone], disabled && styles.disabled, pressing && styles.pressing]}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.fill, { transform: [{ scaleX: progress }] }]} />
      </View>
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, overflow: 'hidden' },
  big: { minHeight: 52 },
  in: { backgroundColor: colors.successSolid },
  out: { backgroundColor: colors.accentInk }, // blanco sobre el naranja claro no pasa AA; sobre la tinta naranja sí
  ink: { backgroundColor: colors.ink },
  disabled: { opacity: 0.45 },
  pressing: { transform: [{ scale: 0.98 }] },
  fill: { backgroundColor: alpha(colors.white, 0.24), transformOrigin: 'left' },
  text: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.white },
});
