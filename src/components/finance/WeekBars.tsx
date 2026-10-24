import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { DayBar } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

const H = 40;

/** Lo que quedó cada día de la semana. Las barras crecen una tras otra al aparecer (sin animar con «Reducir movimiento»). */
export function WeekBars({ bars, heights }: { bars: DayBar[]; heights: number[] }) {
  const reduce = useReduceMotion();
  const [grow] = useState(() => Array.from({ length: 7 }, () => new Animated.Value(0)));
  const ready = bars.length === 7;
  useEffect(() => {
    if (!ready) return;
    if (reduce) {
      grow.forEach((g) => g.setValue(1));
      return;
    }
    Animated.stagger(
      40,
      grow.map((g) => Animated.spring(g, { toValue: 1, useNativeDriver: true, stiffness: 180, damping: 14 })),
    ).start();
  }, [ready, reduce, grow]);

  if (!ready) return null; // sin datos de la semana no se deja un hueco en blanco
  const label = bars.map((b) => `${b.today ? 'hoy' : b.label}: ${formatPesos(b.net)}`).join(', ');
  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={`Lo que te quedó cada día. ${label}`}>
      {bars.map((b, i) => (
        <View key={i} style={styles.col}>
          <View style={styles.track}>
            <Animated.View
              style={[
                styles.bar,
                b.today && styles.today,
                b.net <= 0 && styles.flat,
                { height: Math.round(H * heights[i]), transform: [{ scaleY: grow[i] }] },
              ]}
            />
          </View>
          <Text style={[styles.day, b.today && styles.dayToday]}>{b.today ? 'Hoy' : b.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 6, height: H + 16, marginTop: 4 },
  col: { flex: 1, alignItems: 'center', gap: 3 },
  track: { height: H, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.success, transformOrigin: 'bottom' },
  today: { backgroundColor: colors.primary },
  flat: { backgroundColor: colors.lineStrong },
  day: { fontSize: 9.5, fontFamily: fonts.ui.bold, color: colors.muted },
  dayToday: { color: colors.primary },
});
