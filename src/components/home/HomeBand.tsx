import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors } from '@/theme';

export type DayPart = 'mañana' | 'mediodía' | 'tarde' | 'noche';

export function dayPart(hour: number): DayPart {
  return hour < 11 ? 'mañana' : hour < 15 ? 'mediodía' : hour < 19 ? 'tarde' : 'noche';
}

/** El tema de la franja de arriba (3.59): limpio bajo la regla de los 3 colores (Alabastro / Blanco de día, Negro Carbón de noche). */
export const BAND: Record<DayPart, { bg: string; hello: string; ink: string; sub: string; chipBg: string; chipLine: string; astro: string | null }> = {
  'mañana': { bg: colors.surface, hello: 'Buenos días', ink: colors.ink, sub: colors.muted, chipBg: colors.bg, chipLine: colors.line, astro: colors.brand },
  'mediodía': { bg: colors.surface, hello: 'Buen mediodía', ink: colors.ink, sub: colors.muted, chipBg: colors.bg, chipLine: colors.line, astro: colors.brand },
  'tarde': { bg: colors.surface, hello: 'Buenas tardes', ink: colors.ink, sub: colors.muted, chipBg: colors.bg, chipLine: colors.line, astro: colors.brand },
  'noche': { bg: colors.ink, hello: 'Buenas noches', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.8)', chipBg: 'rgba(255,255,255,0.1)', chipLine: 'rgba(255,255,255,0.28)', astro: null },
};

function useDrift(active: boolean, ms: number) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, active, ms]);
  return v;
}

/** Sol, o luna con estrellas, que flotan despacio a la izquierda de la campana. Quietos con «Reducir movimiento». */
function Sky({ part }: { part: DayPart }) {
  const reduce = useReduceMotion();
  const drift = useDrift(!reduce, 9000);
  const twinkle = useDrift(!reduce, 1600);
  const move = { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 5] }) }] };
  const theme = BAND[part];
  return (
    <View pointerEvents="none" style={styles.sky} accessible={false} importantForAccessibility="no-hide-descendants">
      {theme.astro ? (
        <Animated.View style={[styles.sunWrap, { top: part === 'mediodía' ? 6 : part === 'mañana' ? 22 : 34 }, move]}>
          <View style={[styles.halo, { backgroundColor: theme.astro }]} />
          <View style={[styles.sun, { backgroundColor: theme.astro }]} />
        </Animated.View>
      ) : (
        <>
          <Animated.View style={[styles.sunWrap, { top: 14 }, move]}>
            <View style={styles.moon} />
            <View style={styles.moonCut} />
          </Animated.View>
          {[
            [24, 30],
            [70, 64],
            [110, 22],
            [150, 76],
          ].map(([right, top], i) => (
            <Animated.View key={i} style={[styles.star, { right, top, opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [1, 0.3] : [0.3, 1] }) }]} />
          ))}
        </>
      )}
    </View>
  );
}

/** La franja de arriba del inicio: su color y su cielo cambian con la hora del día. */
export function HomeBand({ part, top, children }: { part: DayPart; top: number; children: ReactNode }) {
  return (
    <View style={[styles.band, { backgroundColor: BAND[part].bg, paddingTop: top }]}>
      <Sky part={part} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { overflow: 'hidden', paddingHorizontal: 20, paddingBottom: 18, gap: 14, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  sky: { position: 'absolute', top: 0, right: 0, width: 220, height: 140 },
  sunWrap: { position: 'absolute', right: 74, width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 56, height: 56, borderRadius: 28, opacity: 0.12 },
  sun: { width: 32, height: 32, borderRadius: 16, opacity: 0.22 },
  moon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF' },
  moonCut: { position: 'absolute', left: 18, top: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.sand },
  star: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
});
