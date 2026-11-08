import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors } from '@/theme';

/**
 * La Chispa: la mascota de Empre AI (3.63). Un destello con dos ojos dentro del aura de los tres colores del logo.
 * Se mueve para contar qué pasa, no para adornar:
 * - `reposo`: respira despacio y parpadea (el único bucle permitido en pantalla);
 * - `pensando`: el aura acelera y la chispa duda de lado a lado;
 * - `responde`: un destello, una sola vez;
 * - `nosabe`: el aura se apaga a gris (le pasó la pregunta al dueño);
 * - `contento`: un saltito y ojos sonrientes (la respuesta sirvió).
 * Con `animated={false}` o con «Reducir movimiento» queda quieta (con su cara y su aura).
 */
export type ChispaMood = 'reposo' | 'pensando' | 'responde' | 'nosabe' | 'contento';

const SPARK = 'M32 6 C34.5 21 43 29.5 58 32 C43 34.5 34.5 43 32 58 C29.5 43 21 34.5 6 32 C21 29.5 29.5 21 32 6 Z';
const HAPPY = 'M26.4 32 q2.2 -3 4.4 0 M33.2 32 q2.2 -3 4.4 0';

function useLoop(active: boolean, ms: number, bounce = false) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      v.setValue(0);
      return;
    }
    const run = Animated.timing(v, { toValue: 1, duration: ms, easing: bounce ? Easing.inOut(Easing.quad) : Easing.linear, useNativeDriver: true });
    const loop = Animated.loop(bounce ? Animated.sequence([run, Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]) : run);
    v.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [v, active, ms, bounce]);
  return v;
}

/** El aura: tres arcos con los colores del logo (rojo 22 %, verde azulado 30 %, naranja 48 %). */
function Ring({ size, stroke, gray }: { size: number; stroke: number; gray: boolean }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const seg = (from: number, part: number) => ({ strokeDasharray: `${len * part} ${len}`, strokeDashoffset: -len * from });
  const c = size / 2;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={c} cy={c} r={r} fill="none" stroke={gray ? '#C7D2E0' : '#F03232'} strokeWidth={stroke} {...seg(0, 0.22)} />
      <Circle cx={c} cy={c} r={r} fill="none" stroke={gray ? '#D5DEEA' : '#14B8B0'} strokeWidth={stroke} {...seg(0.22, 0.3)} />
      <Circle cx={c} cy={c} r={r} fill="none" stroke={gray ? '#C7D2E0' : colors.accent} strokeWidth={stroke} {...seg(0.52, 0.48)} />
    </Svg>
  );
}

export function Chispa({ size = 28, mood = 'reposo', animated = true }: { size?: number; mood?: ChispaMood; animated?: boolean }) {
  const reduce = useReduceMotion();
  const live = animated && !reduce;
  const thinking = live && mood === 'pensando';
  const resting = live && mood === 'reposo';

  // Bucles: el aura gira (rápido al pensar), el halo respira, la chispa duda al pensar.
  const spin = useLoop(live && (resting || thinking), thinking ? 1400 : 9000);
  const breathe = useLoop(live && (resting || thinking), thinking ? 900 : 3200, true);
  const doubt = useLoop(thinking, 1100, true);

  // Parpadeo cada ~4,8 s en reposo.
  const [blink] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!resting) {
      blink.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(4400),
        Animated.timing(blink, { toValue: 0.1, duration: 90, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, resting]);

  // Momentos de una sola vez: responder (pop y destello), no saber (se hace a un lado), contento (saltito).
  const [pop] = useState(() => new Animated.Value(1));
  const [flash] = useState(() => new Animated.Value(0));
  const [shift] = useState(() => new Animated.Value(0));
  const [hop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!live) return;
    if (mood === 'responde') {
      pop.setValue(0.86);
      flash.setValue(1);
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else if (mood === 'nosabe') {
      Animated.timing(shift, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mood === 'contento') {
      hop.setValue(0);
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(hop, { toValue: 0, friction: 4, tension: 140, useNativeDriver: true }),
      ]).start();
    }
    if (mood !== 'nosabe') shift.setValue(0);
  }, [mood, live, pop, flash, shift, hop]);

  const stroke = Math.max(2, Math.round(size / 14));
  const core = size * 0.72;
  const eye = Math.max(2, Math.round(size * 0.075));
  const happy = mood === 'contento';
  return (
    <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
      {/* Halo ya difuminado detrás: solo cambia escala y opacidad. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: live ? Animated.add(breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }), flash) : 0.8,
            transform: [{ scale: live ? Animated.add(breathe.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1.22] }), flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] })) : 1.12 }],
          },
        ]}
      >
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#14B8B0" stopOpacity={mood === 'nosabe' ? 0 : 0.35} />
              <Stop offset="0.6" stopColor={colors.accent} stopOpacity={mood === 'nosabe' ? 0 : 0.16} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#halo)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: mood === 'nosabe' ? 0.55 : 1, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        <Ring size={size} stroke={stroke} gray={mood === 'nosabe'} />
      </Animated.View>
      <Animated.View
        style={[
          styles.core,
          {
            width: core,
            height: core,
            borderRadius: core / 2,
            left: (size - core) / 2,
            top: (size - core) / 2,
            transform: [
              { scale: pop },
              { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.12] }) },
              { translateX: shift.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.05] }) },
              { rotate: Animated.add(doubt.interpolate({ inputRange: [0, 1], outputRange: [-12, 12] }), shift.interpolate({ inputRange: [0, 1], outputRange: [0, 8] })).interpolate({ inputRange: [-20, 20], outputRange: ['-20deg', '20deg'] }) },
            ],
          },
        ]}
      >
        <Svg width={core * 0.86} height={core * 0.86} viewBox="0 0 64 64">
          <Path d={SPARK} fill="#FFFFFF" />
          {happy ? <Path d={HAPPY} stroke={colors.ink} strokeWidth={2} fill="none" strokeLinecap="round" /> : null}
        </Svg>
        {!happy ? (
          <Animated.View style={[styles.eyes, { gap: eye * 1.2, transform: [{ scaleY: blink }] }]}>
            <View style={{ width: eye, height: eye, borderRadius: eye / 2, backgroundColor: colors.ink }} />
            <View style={{ width: eye, height: eye, borderRadius: eye / 2, backgroundColor: colors.ink }} />
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  core: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  eyes: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
