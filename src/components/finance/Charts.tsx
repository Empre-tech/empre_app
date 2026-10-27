import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { bucketLabel, dayLong, FRANJAS, heatLevel, WEEK_INITIALS } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

export const SALES_COLOR = colors.primary;
export const EXPENSE_COLOR = colors.accent;
const HEAT = ['#EEF4FC', '#B9D0F0', '#6E9EDD', colors.primary];
const TONE = { good: '#1D6B3D', bad: '#B3261E', warn: colors.accentInk, flat: colors.muted } as const;

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
          style={{ flex: 1, height: `${Math.max(3, (v / max) * 100)}%`, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: i === values.length - 1 ? EXPENSE_COLOR : '#9DBDE8' }}
        />
      ))}
    </View>
  );
}

interface Point {
  start: string;
  sales: number;
  expenses: number;
}

/** Ventas y gastos por día (o semana o mes), lado a lado. Tocar una barra muestra su detalle. */
export function BarPairs({ series, bucket }: { series: Point[]; bucket: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((p) => Math.max(p.sales, p.expenses)));
  const every = series.length > 16 ? Math.ceil(series.length / 8) : 1;
  const p = sel !== null ? series[sel] : null;
  const what = bucket === 'week' ? 'Semana del ' : '';
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.legend}>
        <Legend color={SALES_COLOR} label="Ventas" />
        <Legend color={EXPENSE_COLOR} label="Gastos" />
      </View>
      {p ? (
        <View style={styles.tip}>
          <Text style={styles.tipText}>
            {what}
            {bucket === 'month' ? bucketLabel('month', p.start, 0) : dayLong(p.start)} · vendiste {formatPesos(p.sales)} · gastaste {formatPesos(p.expenses)} · {p.sales - p.expenses >= 0 ? 'te quedaron' : 'perdiste'}{' '}
            {formatPesos(Math.abs(p.sales - p.expenses))}
          </Text>
        </View>
      ) : null}
      <View style={styles.bars} accessibilityLabel="Gráfico de ventas y gastos">
        {series.map((pt, i) => (
          <Pressable
            key={pt.start}
            accessibilityRole="button"
            accessibilityLabel={`${dayLong(pt.start)}: vendiste ${formatPesos(pt.sales)}, gastaste ${formatPesos(pt.expenses)}`}
            onPress={() => setSel(sel === i ? null : i)}
            style={[styles.barSlot, sel === i && { backgroundColor: colors.primarySoft }]}
          >
            <View style={[styles.bar, { height: `${(pt.sales / max) * 100}%`, backgroundColor: SALES_COLOR }]} />
            <View style={[styles.bar, { height: `${(pt.expenses / max) * 100}%`, backgroundColor: EXPENSE_COLOR }]} />
          </Pressable>
        ))}
      </View>
      <View style={styles.labels}>
        {series.map((pt, i) => (
          <Text key={pt.start} style={styles.barLabel} numberOfLines={1}>
            {i % every === 0 ? bucketLabel(bucket, pt.start, series.length) : ''}
          </Text>
        ))}
      </View>
      <Text style={styles.hint}>Toca una barra para ver su detalle.</Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.hint}>{label}</Text>
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

/** Una barra partida (medios de pago) con su leyenda. */
export function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  if (total <= 0) return <Text style={styles.hint}>Sin ventas en estas fechas.</Text>;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.stack} accessibilityRole="image" accessibilityLabel={shown.map((p) => `${p.label} ${Math.round((p.value / total) * 100)} %`).join(', ')}>
        {shown.map((p) => (
          <View key={p.label} style={{ flex: p.value, backgroundColor: p.color }} />
        ))}
      </View>
      {shown.map((p) => (
        <View key={p.label} style={styles.legendRow}>
          <View style={[styles.swatch, { backgroundColor: p.color }]} />
          <Text style={[styles.rowLabel, { flex: 1 }]}>{p.label}</Text>
          <Text style={styles.hint}>{Math.round((p.value / total) * 100)} %</Text>
          <Text style={styles.rowValue}>{formatPesos(p.value)}</Text>
        </View>
      ))}
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
