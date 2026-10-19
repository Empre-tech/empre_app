import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

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

/**
 * Texto que «rueda» cuando cambia (3.39, encabezado de Ofertas): el viejo sale hacia arriba (160 ms, salida rápida) y
 * el nuevo entra desde abajo (280 ms, curva enfática). Solo al cambiar, nunca en bucle. Con «Reducir movimiento», el
 * cambio es inmediato.
 */
export function RollText({ text, style, numberOfLines = 1 }: { text: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(text);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [turn, setTurn] = useState(0); // cuántas veces cambió: cada cambio arranca una animación
  const [inV] = useState(() => new Animated.Value(1));
  const [outV] = useState(() => new Animated.Value(0));
  // Estado derivado en el render (no en un efecto): el texto nuevo se guarda y el viejo pasa a «saliendo».
  if (text !== shown) {
    setLeaving(reduce ? null : shown);
    setShown(text);
    setTurn((n) => n + 1);
  }
  // Antes de pintar: así el texto nuevo no se ve un instante en su sitio antes de entrar.
  useLayoutEffect(() => {
    if (turn === 0 || reduce) {
      inV.setValue(1);
      outV.setValue(1);
      return;
    }
    inV.setValue(0);
    outV.setValue(0);
    const a = Animated.parallel([
      Animated.timing(outV, { toValue: 1, duration: 160, easing: EXIT, useNativeDriver: true }),
      Animated.timing(inV, { toValue: 1, duration: 280, delay: 60, easing: EMPHASIZED, useNativeDriver: true }),
    ]);
    a.start(({ finished }) => {
      if (finished) setLeaving(null);
    });
    return () => a.stop();
  }, [turn, reduce, inV, outV]);
  const lift = (v: Animated.Value, from: number, to: number) => ({ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) }] });
  return (
    <View style={styles.rollWrap}>
      {leaving !== null ? (
        <Animated.Text accessible={false} numberOfLines={numberOfLines} style={[style, styles.rollGhost, { opacity: outV.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }, lift(outV, 0, -12)]}>
          {leaving}
        </Animated.Text>
      ) : null}
      <Animated.Text numberOfLines={numberOfLines} style={[style, { opacity: inV }, lift(inV, 12, 0)]}>
        {shown}
      </Animated.Text>
    </View>
  );
}

const EXIT = Easing.bezier(0.4, 0, 1, 1);

const styles = StyleSheet.create({
  rollWrap: { overflow: 'hidden', flexShrink: 1 },
  rollGhost: { position: 'absolute', left: 0, right: 0, top: 0 },
  dotWrap: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  ring: { position: 'absolute' },
});
