import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FRANJAS, heatLevel, WEEK_INITIALS } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

export const SALES_COLOR = colors.brand;
export const EXPENSE_COLOR = '#8796AB';
const HEAT = [colors.selectedSoft, '#B6C1D1', '#5B6B82', colors.selected];
const TONE = { good: colors.verified, bad: colors.warning, warn: colors.accentInk, flat: colors.muted } as const;

/** «▲ 12 %» con su color. */
export function Delta({ d, worseIsWarn = false }: { d: { text: string; tone: 'good' | 'bad' | 'flat' } | null; worseIsWarn?: boolean }) {
  if (!d) return null;
  const color = d.tone === 'good' ? TONE.good : d.tone === 'bad' ? (worseIsWarn ? TONE.warn : TONE.bad) : TONE.flat;
  return <Text style={[styles.delta, { color }]}>{d.text}</Text>;
}

/** Barritas de ventas por día, para la tarjeta de inicio. La última (hoy) va en naranja. */
export function Sparkline({ values, height = 56 }: { values: number[]; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <View style={[styles.spark, { height }]} accessibilityRole="image" accessibilityLabel="Ventas de cada día del periodo">
      {values.map((v, i) => (
        <View
          key={i}
          style={{ flex: 1, height: `${Math.max(3, (v / max) * 100)}%`, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: i === values.length - 1 ? SALES_COLOR : colors.line }}
        />
      ))}
    </View>
  );
}

/** Ventas por día de la semana y franja del día. */
export function HeatGrid({ heat }: { heat: number[][] }) {
  const max = Math.max(0, ...heat.flat());
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.heatRow}>
        <View style={styles.heatHead} />
        {WEEK_INITIALS.map((w, i) => (
          <Text key={i} style={styles.heatDay}>
            {w}
          </Text>
        ))}
      </View>
      {FRANJAS.map((f, fi) => (
        <View key={f} style={styles.heatRow}>
          <Text style={styles.heatHead}>{f}</Text>
          {heat.map((row, d) => (
            <View
              key={d}
              accessible
              accessibilityLabel={`${WEEK_INITIALS[d]} ${f}: ${formatPesos(row[fi] ?? 0)}`}
              style={[styles.heatCell, { backgroundColor: HEAT[heatLevel(row[fi] ?? 0, max)] }]}
            />
          ))}
        </View>
      ))}
      <View style={[styles.legend, { marginTop: 4 }]}>
        <Text style={styles.hint}>Menos</Text>
        {HEAT.map((c) => (
          <View key={c} style={[styles.swatchWide, { backgroundColor: c }]} />
        ))}
        <Text style={styles.hint}>Más</Text>
      </View>
    </View>
  );
}

/** Barras horizontales con su valor (gastos por categoría, valor por sección). */
export function HBars({ rows, color = EXPENSE_COLOR }: { rows: { label: string; value: number; extra?: ReactNode }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={styles.legendRow}>
            <Text style={[styles.rowLabel, { flex: 1 }]} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={styles.rowValue}>{formatPesos(r.value)}</Text>
            {r.extra}
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(r.value / max) * 100}%`, backgroundColor: color }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  delta: { fontSize: 12, fontFamily: fonts.ui.extrabold },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  swatchWide: { width: 18, height: 10, borderRadius: 3 },
  tip: { padding: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.ink },
  tipText: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.bold, color: '#fff' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.line },
  barSlot: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1, borderRadius: 6 },
  bar: { flex: 1, maxWidth: 8, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 0 },
  labels: { flexDirection: 'row', gap: 2 },
  barLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontFamily: fonts.ui.bold, color: colors.muted },
  hint: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heatHead: { width: 68, fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  heatDay: { flex: 1, textAlign: 'center', fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.muted },
  heatCell: { flex: 1, height: 30, borderRadius: 6 },
  stack: { flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', gap: 2 },
  rowLabel: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  rowValue: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.bg },
  fill: { height: 10, borderRadius: 5 },
});
