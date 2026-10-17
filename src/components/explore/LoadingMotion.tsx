import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { SkeletonBlock } from '@/components/Skeleton';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, radius, spacing } from '@/theme';

/**
 * Barra fina arriba del panel mientras se actualiza lo que muestra (3.26): avisa sin tapar nada. Con «Reducir movimiento»
 * es una franja quieta.
 */
export function UpdatingBar() {
  const reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce || w === 0) return;
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    x.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [reduce, w, x]);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  return (
    <View style={styles.track} onLayout={onLayout} accessible accessibilityRole="progressbar" accessibilityLabel="Actualizando">
      {reduce ? (
        <View style={[styles.fill, styles.still]} />
      ) : (
        <Animated.View style={[styles.fill, { width: w * 0.35, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.35, w] }) }] }]} />
      )}
    </View>
  );
}

/**
 * Lo nuevo entra con un fundido corto (250 ms, subiendo 6 pt) en vez de aparecer de golpe. Quien lo usa cambia la `key`
 * cuando cambia el contenido. Con «Reducir movimiento» aparece sin animación.
 */
export function FadeIn({ children }: { children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce, v]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>{children}</Animated.View>;
}

/** Esqueleto con la forma de las tarjetas de Descubre (foto grande y dos líneas), para la primera carga. */
export function DiscoverSkeleton() {
  return (
    <View style={styles.skel} accessible accessibilityLabel="Cargando destacados">
      {[0, 1].map((i) => (
        <View key={i} style={styles.skelCard}>
          <SkeletonBlock height={128} borderRadius={radius.lg} />
          <SkeletonBlock width="62%" height={12} />
          <SkeletonBlock width="40%" height={10} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, overflow: 'hidden', zIndex: 2 },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2, backgroundColor: colors.primary },
  still: { right: 0, opacity: 0.45 },
  skel: { gap: spacing.lg, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  skelCard: { gap: spacing.sm },
});
