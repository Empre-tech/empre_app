import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { fin } from '@/finance/tokens';
import { useReduceMotion } from '@/lib/useReduceMotion';

// Fondo de la voz (3.46 F6): tres degradados radiales en SVG que se desvanecen hasta transparente, así no hay bordes
// (sin desenfoque, unos círculos de color se veían duros en Android). Derivan despacio con el controlador nativo y
// más rápido mientras escucha. Con «Reducir movimiento» se quedan quietos.

const V = fin.color.voice;

function Blob({ i, w, h, drift }: { i: number; w: number; h: number; drift: Animated.Value }) {
  const b = V.aurora[i];
  const r = Math.max(w, h) * b.r;
  const id = `aurora${i}`;
  // Cada mancha se mueve en su propia dirección, unos 40 dp.
  const dx = [40, -50, 30][i];
  const dy = [30, 40, -35][i];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        { left: w * b.x - r, top: h * b.y - r, width: r * 2, height: r * 2 },
        {
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          ],
        },
      ]}
    >
      <Svg width={r * 2} height={r * 2}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={b.color} stopOpacity={b.opacity} />
            <Stop offset="0.55" stopColor={b.color} stopOpacity={b.opacity * 0.35} />
            <Stop offset="1" stopColor={b.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

export function Aurora({ listening }: { listening: boolean }) {
  const { width: w, height: h } = useWindowDimensions();
  const reduce = useReduceMotion();
  const [drift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) return;
    const ms = listening ? fin.motion.auroraListeningMs : fin.motion.auroraMs;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, listening, reduce]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {V.aurora.map((_, i) => (
        <Blob key={i} i={i} w={w} h={h} drift={drift} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ blob: { position: 'absolute' } });
