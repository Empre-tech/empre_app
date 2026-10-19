import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors } from '@/theme';

/**
 * Movimiento de la vitrina de ofertas (3.38, taste-motion). Cada animación explica un cambio y ocurre una vez:
 * - `Reveal`: entra subiendo un poco con curva enfática; `delay` hace la cascada (secciones 70 ms, tarjetas 50 ms).
 * - `LiveDot`: el único bucle de la pantalla, el punto «en vivo» de Tendencia.
 * Con «Reducir movimiento» todo aparece quieto. Solo opacidad y desplazamiento, con el driver nativo.
 */

const EMPHASIZED = Easing.bezier(0.22, 1, 0.36, 1);

export function Reveal({ children, delay = 0, distance = 10, duration = 320, style }: { children: ReactNode; delay?: number; distance?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing: EMPHASIZED, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [reduce, v, delay, duration]);
  if (reduce) return <View style={style}>{children}</View>;
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>{children}</Animated.View>;
}

/** Punto «en vivo»: un anillo que se expande y se desvanece cada 2,4 s. Quieto con «Reducir movimiento». */
export function LiveDot({ color = colors.danger }: { color?: string }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1700, easing: Easing.out(Easing.quad), useNativeDriver: true }), { iterations: -1 });
    const t = setTimeout(() => loop.start(), 300);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [reduce, v]);
  return (
    <View style={styles.dotWrap} accessible={false}>
      {reduce ? null : (
        <Animated.View
          style={[styles.dot, styles.ring, { backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]}
        />
      )}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  dotWrap: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  ring: { position: 'absolute' },
});
