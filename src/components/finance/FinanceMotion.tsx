import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { SkeletonBlock } from '@/components/Skeleton';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, radius, softShadow, spacing } from '@/theme';

const EASE_OUT = Easing.out(Easing.cubic);
const BAR_EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * Entrada escalonada para bloques de Empre Finance: cada etapa aparece con un
 * fundido corto (260 ms, subiendo 6 pt) en orden de lectura. Con «Reducir movimiento»
 * aparece de inmediato.
 */
export function Stage({ step = 0, delay, children, style }: { step?: number; delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(reduce ? 1 : 0));
  const wait = delay ?? Math.min(step, 5) * 55;

  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const anim = Animated.timing(v, { toValue: 1, duration: 260, delay: wait, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [reduce, v, wait]);

  return (
    <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

/** Barra vertical cuya altura en px crece suavemente al entrar o al cambiar el dato. */
export function AnimatedBar({ height, color, delay = 0, style }: { height: number; color: string; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const [h] = useState(() => new Animated.Value(reduce ? height : 0));
  const mounted = useRef(false);

  useEffect(() => {
    if (reduce) {
      h.setValue(height);
      mounted.current = true;
      return;
    }
    const d = mounted.current ? 0 : delay;
    mounted.current = true;
    const anim = Animated.timing(h, { toValue: height, duration: 360, delay: d, easing: BAR_EASE, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [height, delay, reduce, h]);

  return <Animated.View style={[style, { height: h, backgroundColor: color }]} />;
}

/** Barra horizontal (o vertical en %) cuyo relleno en porcentaje crece suavemente. */
export function AnimatedFill({
  pct,
  color,
  axis = 'width',
  delay = 0,
  style,
}: {
  pct: number;
  color: string;
  axis?: 'width' | 'height';
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const reduce = useReduceMotion();
  const [p] = useState(() => new Animated.Value(reduce ? clamped : 0));
  const mounted = useRef(false);

  useEffect(() => {
    if (reduce) {
      p.setValue(clamped);
      mounted.current = true;
      return;
    }
    const d = mounted.current ? 0 : delay;
    mounted.current = true;
    const anim = Animated.timing(p, { toValue: clamped, duration: 380, delay: d, easing: BAR_EASE, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [clamped, delay, reduce, p]);

  const size = p.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) as unknown as DimensionValue;
  return <Animated.View style={[style, axis === 'width' ? { width: size } : { height: size }, { backgroundColor: color }]} />;
}

const BAR_HEIGHTS = [24, 42, 34, 58, 46, 68, 38, 52, 30, 62, 44, 28];

/** Esqueleto principal para Hoy, Plata y Rentabilidad: tarjeta hero + gráfica + tarjeta de lectura + lista. */
export function FinanceHeroSkeleton({ bars = 7, rows = 3 }: { bars?: number; rows?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Cargando tus números" style={styles.wrap}>
      <View style={styles.card}>
        <SkeletonBlock width="42%" height={12} />
        <SkeletonBlock width="58%" height={36} borderRadius={radius.sm} />
        <View style={styles.barRow}>
          {Array.from({ length: bars }, (_, i) => (
            <View key={i} style={styles.barSlot}>
              <SkeletonBlock width="70%" height={BAR_HEIGHTS[i % BAR_HEIGHTS.length]} borderRadius={4} />
            </View>
          ))}
        </View>
        <View style={styles.minis}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.mini}>
              <SkeletonBlock width="65%" height={10} />
              <SkeletonBlock width="85%" height={16} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <SkeletonBlock width="38%" height={12} />
        <SkeletonBlock width="90%" height={14} />
        <SkeletonBlock width="72%" height={12} />
      </View>

      <View style={styles.listCard}>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={[styles.row, i > 0 && styles.rowLine]}>
            <SkeletonBlock width={36} height={36} borderRadius={12} />
            <View style={styles.rowText}>
              <SkeletonBlock width="58%" height={14} />
              <SkeletonBlock width="40%" height={11} />
            </View>
            <SkeletonBlock width={64} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Esqueleto para Cuentas, Análisis y Mesas: resumen opcional en 2 tarjetas + filas agrupadas. */
export function FinanceListSkeleton({ rows = 4, withSummary = true }: { rows?: number; withSummary?: boolean }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Cargando" style={styles.wrap}>
      {withSummary ? (
        <View style={styles.sides}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.side}>
              <SkeletonBlock width="50%" height={12} />
              <SkeletonBlock width="75%" height={24} />
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.listCard}>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={[styles.row, i > 0 && styles.rowLine]}>
            <SkeletonBlock width={36} height={36} borderRadius={12} />
            <View style={styles.rowText}>
              <SkeletonBlock width="62%" height={14} />
              <SkeletonBlock width="42%" height={11} />
            </View>
            <SkeletonBlock width={60} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Esqueleto para el detalle de una cuenta/mesa abierta (`tab.tsx`). */
export function TabDetailSkeleton() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Cargando cuenta" style={[styles.wrap, { padding: spacing.lg }]}>
      <View style={styles.card}>
        <SkeletonBlock width="45%" height={12} />
        <SkeletonBlock width="55%" height={34} />
        <SkeletonBlock width="70%" height={12} />
      </View>
      <FinanceListSkeleton rows={3} withSummary={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  card: { gap: 12, padding: 16, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', height: 76, gap: 4, paddingTop: 8 },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  minis: { flexDirection: 'row', gap: 12, paddingTop: 4 },
  mini: { flex: 1, gap: 6 },
  sides: { flexDirection: 'row', gap: 10 },
  side: { flex: 1, gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  listCard: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowText: { flex: 1, gap: 6 },
});
