import { useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticTap } from '@/lib/haptics';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { fin } from '@/finance/tokens';
import { alpha } from '@/theme';

// Registrar dinero pide intención (3.45): un toque suelto o un dedo que resbala no registran nada. Se mantiene pulsado
// mientras la barra se llena; al llenarse vibra y confirma. Soltar antes la vacía. Con el lector de pantalla no se
// puede mantener pulsado, así que activar pide una confirmación aparte.

export const HOLD_MS = fin.motion.holdMs;

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
    Animated.timing(progress, { toValue: 1, duration: reduce ? fin.motion.holdReducedMs : HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
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
  base: { minHeight: fin.size.button - 2, borderRadius: fin.radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: fin.space.lg, overflow: 'hidden' },
  big: { minHeight: fin.size.button },
  in: { backgroundColor: fin.color.in.solid },
  out: { backgroundColor: fin.color.out.solid }, // blanco sobre el naranja claro no pasa AA; sobre la tinta naranja sí
  ink: { backgroundColor: fin.color.text },
  disabled: { opacity: 0.45 },
  pressing: { transform: [{ scale: 0.98 }] },
  fill: { backgroundColor: alpha(fin.color.in.on, 0.24), transformOrigin: 'left' },
  text: { ...fin.type.button, color: fin.color.in.on },
});
