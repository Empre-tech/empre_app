import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LedgerSummary, Period } from '@/api/ledger';
import { RollingNumber } from '@/components/finance/RollingNumber';
import { fin } from '@/finance/tokens';
import { formatPesos, METHOD_LABEL } from '@/lib/ledger';
import { insightText, type DayNet, type Insight, type PeriodResult, type Share } from '@/lib/ledgerInsights';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors } from '@/theme';

const C = fin.color;
const T = fin.type;
const R = fin.radius;
const S = fin.space;

// Las piezas de «Mi negocio» (3.52), con los tokens y colores de Empre Finance: verde lo que entra, naranja lo que
// sale, azul la acción. Tres partes, como las diría un contador en palabras sencillas: resultado (cuánto te quedó),
// caja (qué plata entró) y pendiente (fiados). Los números y las frases salen de `src/lib/ledgerInsights.ts`.

type IconName = keyof typeof Ionicons.glyphMap;

/** Hoy · Semana · Mes, el mismo control segmentado de los paneles de Finance. */
export function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const tabs: [Period, string][] = [
    ['day', 'Hoy'],
    ['week', 'Semana'],
    ['month', 'Mes'],
  ];
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map(([k, label]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)} style={[styles.tab, value === k && styles.tabOn]}>
          <Text style={[styles.tabText, value === k && styles.tabTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 1. Resultado: te quedó (o perdiste), de cada $100, las barras por día y la cuenta Vendiste − Gastaste. */
export function ResultCard({ r, sum, versus, days }: { r: PeriodResult; sum: LedgerSummary; versus: string; days: DayNet[] }) {
  const loss = r.net < 0;
  const up = (r.changePct ?? 0) >= 0;
  const catCount = Object.values(sum.expenses_by_category ?? {}).filter((v) => v > 0).length;
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.kicker}>{loss ? 'Perdiste' : 'Te quedó'}</Text>
        {r.changePct !== null ? (
          <View style={[styles.chg, !up && styles.chgDown]} accessible accessibilityLabel={`${up ? 'Subió' : 'Bajó'} ${Math.abs(r.changePct)} % frente a ${versus}`}>
            <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? C.in.ink : C.out.ink} />
            <Text style={[styles.chgText, !up && { color: C.out.ink }]}>
              {Math.abs(r.changePct)} % vs {versus}
            </Text>
          </View>
        ) : null}
      </View>
      <RollingNumber value={r.net} prefix={loss ? '−' : ''} style={{ ...styles.big, ...(loss ? { color: C.out.ink } : null) }} />
      {r.sold > 0 ? (
        <>
          <Text style={styles.per100}>
            {loss ? 'Por cada ' : 'De cada '}
            <Text style={styles.strong}>$100</Text>
            {loss ? ' que vendiste, gastaste ' : ' que vendiste, te quedaron '}
            <Text style={styles.strong}>${r.per100}</Text>.
          </Text>
          <View style={styles.splitBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.splitPart, { flex: r.keepShare, backgroundColor: C.in.fill }]} />
            <View style={[styles.splitPart, { flex: r.spendShare, backgroundColor: C.out.fill }]} />
            <View style={{ flex: Math.max(0, 1 - r.keepShare - r.spendShare) }} />
          </View>
        </>
      ) : (
        <Text style={styles.per100}>Aún no hay ventas en este periodo.</Text>
      )}
      {days.length > 0 ? <DayBars days={days} /> : null}
      <View style={styles.eq}>
        <View style={styles.flex}>
          <Text style={styles.eqLabel}>
            <Text style={{ color: C.in.fill }}>● </Text>Vendiste
          </Text>
          <RollingNumber value={r.sold} style={styles.eqValue} />
          <Text style={styles.eqMeta}>
            {sum.sales_count} {sum.sales_count === 1 ? 'venta' : 'ventas'}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.eqLabel}>
            <Text style={{ color: C.out.fill }}>● </Text>Gastaste
          </Text>
          <RollingNumber value={r.spent} style={styles.eqValue} />
          <Text style={styles.eqMeta}>
            {catCount} {catCount === 1 ? 'categoría' : 'categorías'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const BARS_H = 44;

/** Lo que quedó cada día: el mejor en verde oscuro y hoy en azul, como en Finance. Crecen una tras otra. */
function DayBars({ days }: { days: DayNet[] }) {
  const reduce = useReduceMotion();
  const [grow] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) return grow.setValue(1);
    grow.setValue(0);
    Animated.spring(grow, { toValue: 1, useNativeDriver: true, ...fin.motion.bars }).start();
  }, [days, reduce, grow]);
  const max = Math.max(1, ...days.map((d) => d.net));
  const many = days.length > 7;
  const label = days
    .filter((d) => d.net !== 0)
    .map((d) => `${d.today ? 'hoy' : d.label}: ${formatPesos(d.net)}`)
    .join(', ');
  return (
    <View style={styles.bars} accessible accessibilityRole="image" accessibilityLabel={`Lo que te quedó cada día. ${label}`}>
      {days.map((d, i) => (
        <View key={d.date} style={styles.barCol}>
          <View style={styles.barTrack}>
            <Animated.View
              style={[
                styles.bar,
                many && styles.barThin,
                d.net <= 0 ? styles.barFlat : d.today ? styles.barToday : d.best ? styles.barBest : null,
                { height: d.net <= 0 ? 3 : Math.max(5, Math.round((d.net / max) * BARS_H)), transform: [{ scaleY: grow }] },
              ]}
            />
          </View>
          <Text style={[styles.barDay, d.today && styles.barDayToday]}>{!many || d.today || i % 5 === 0 ? (d.today ? 'Hoy' : d.label) : ' '}</Text>
        </View>
      ))}
    </View>
  );
}

/** Venta · Gasto · voz: los mismos botones de Finance. */
export function LedgerActions({ onSale, onExpense, onVoice }: { onSale: () => void; onExpense: () => void; onVoice: () => void }) {
  return (
    <View style={styles.acts}>
      <Pressable accessibilityRole="button" onPress={onSale} style={({ pressed }) => [styles.act, styles.actIn, pressed && styles.pressed]}>
        <Ionicons name="add" size={20} color={C.in.on} />
        <Text style={styles.actText}>Venta</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onExpense} style={({ pressed }) => [styles.act, styles.actOut, pressed && styles.pressed]}>
        <Ionicons name="remove" size={20} color={C.out.on} />
        <Text style={[styles.actText, { color: C.out.on }]}>Gasto</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dictar una venta o un gasto" onPress={onVoice} style={({ pressed }) => [styles.act, styles.actMic, pressed && styles.pressed]}>
        <Ionicons name="mic" size={20} color={C.action.on} />
      </Pressable>
    </View>
  );
}

const TONE: Record<Insight['tone'], { bg: string; fg: string }> = {
  good: { bg: C.in.soft, fg: C.in.ink },
  warn: { bg: C.out.soft, fg: C.out.ink },
  tip: { bg: C.action.soft, fg: C.action.solid },
};
const INSIGHT_ICON: Record<string, IconName> = {
  loss: 'alert-circle-outline',
  spend: 'alert-circle-outline',
  category: 'pricetag-outline',
  'best-day': 'star-outline',
  'top-item': 'trending-up-outline',
  credit: 'time-outline',
  costs: 'pricetags-outline',
};
const ACTION_LABEL: Record<NonNullable<Insight['action']>, string> = { debts: 'Ver fiados', costs: 'Agregar costos' };

/** 3. «Lo que dicen tus números»: hasta tres frases cortas, cada una con su color. */
export function InsightList({ list, onAction }: { list: Insight[]; onAction: (a: NonNullable<Insight['action']>) => void }) {
  if (list.length === 0) return null;
  return (
    <View style={styles.stack}>
      <SectionTitle title="Lo que dicen tus números" />
      {list.map((i) => {
        const tone = TONE[i.tone];
        const body = (
          <>
            <View style={[styles.insIcon, { backgroundColor: tone.bg }]}>
              <Ionicons name={INSIGHT_ICON[i.key] ?? 'bulb-outline'} size={17} color={tone.fg} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.insText}>
                {i.parts.map((p, n) => (typeof p === 'string' ? p : <Text key={n} style={styles.strong}>{p.b}</Text>))}
              </Text>
              {i.action ? <Text style={styles.insLink}>{ACTION_LABEL[i.action]} ›</Text> : null}
            </View>
          </>
        );
        const action = i.action;
        return action ? (
          <Pressable key={i.key} accessibilityRole="button" accessibilityLabel={`${insightText(i)} ${ACTION_LABEL[action]}`} onPress={() => onAction(action)} style={({ pressed }) => [styles.ins, pressed && styles.pressed]}>
            {body}
          </Pressable>
        ) : (
          <View key={i.key} style={styles.ins} accessible accessibilityLabel={insightText(i)}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const METHOD_COLOR: Record<string, string> = { cash: C.in.fill, transfer: C.action.solid, card: colors.verified, credit: C.out.fill };

/** 4. Plata que entró: cómo te pagaron (el fiado «entra después») y lo que quedó en caja. */
export function CashCard({ slices, cashIn, cashOut }: { slices: Omit<Share, 'label'>[]; cashIn: number; cashOut: number }) {
  if (slices.length === 0 && cashOut === 0) return null;
  const left = cashIn - cashOut;
  return (
    <View style={styles.stack}>
      <SectionTitle title="Plata que entró" hint="cómo te pagaron" />
      <View style={styles.card}>
        {slices.length > 0 ? (
          <>
            <View style={styles.methBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {slices.map((m) => (
                <View key={m.key} style={{ flex: m.share, backgroundColor: METHOD_COLOR[m.key] }} />
              ))}
            </View>
            {slices.map((m) => (
              <View key={m.key} style={styles.legendRow}>
                <Text style={styles.legendLabel} numberOfLines={1}>
                  <Text style={{ color: METHOD_COLOR[m.key] }}>● </Text>
                  {METHOD_LABEL[m.key as keyof typeof METHOD_LABEL]}
                  {m.key === 'credit' ? <Text style={styles.legendHint}> · entra después</Text> : null}
                </Text>
                <Text style={styles.legendValue}>{formatPesos(m.amount)}</Text>
              </View>
            ))}
          </>
        ) : null}
        <View style={[styles.cashRow, slices.length > 0 && styles.divider]}>
          <View style={styles.flex}>
            <Text style={styles.cashTitle}>Quedó en caja</Text>
            <Text style={styles.cashMeta}>
              Entró {formatPesos(cashIn)} · pagaste {formatPesos(cashOut)}
            </Text>
          </View>
          <Text style={[styles.cashValue, left < 0 && { color: C.out.ink }]}>
            {left < 0 ? '−' : ''}
            {formatPesos(Math.abs(left))}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** 5 y 6. Filas con barra de proporción: en qué se fue tu plata, lo que más vendiste. */
export function ShareList({ title, hint, rows, tone }: { title: string; hint: string; rows: (Share & { qty?: number })[]; tone: 'in' | 'out' }) {
  if (rows.length === 0) return null;
  const color = tone === 'in' ? C.in.fill : C.out.fill;
  return (
    <View style={styles.stack}>
      <SectionTitle title={title} hint={hint} />
      <View style={[styles.card, styles.rows]}>
        {rows.map((r) => (
          <View key={r.key} style={styles.shareRow} accessible accessibilityLabel={`${r.label}${r.qty ? `, ${r.qty} unidades` : ''}: ${formatPesos(r.amount)}, ${Math.round(r.share * 100)} %`}>
            <View style={styles.rowBetween}>
              <Text style={styles.shareName} numberOfLines={1}>
                {r.label}
                {r.qty ? <Text style={styles.shareMeta}> {Number.isInteger(r.qty) ? r.qty : r.qty.toFixed(1)} u.</Text> : null}
              </Text>
              <Text style={styles.shareValue}>
                {formatPesos(r.amount)}
                <Text style={styles.shareMeta}> {Math.round(r.share * 100)} %</Text>
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${Math.round(r.rel * 100)}%`, backgroundColor: color }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 7. Pendiente: lo que te deben y lo que debes, solo si hay algo. */
export function PendingCard({ receivable, payable, onOpen }: { receivable: number; payable: number; onOpen: () => void }) {
  if (receivable <= 0 && payable <= 0) return null;
  const rows: [string, string, number, string][] = [];
  if (receivable > 0) rows.push(['Te deben', 'en fiados', receivable, C.in.ink]);
  if (payable > 0) rows.push(['Debes', 'a proveedores', payable, C.out.ink]);
  return (
    <View style={styles.stack}>
      <SectionTitle title="Pendiente" hint="aún no entra ni sale" />
      <View style={[styles.card, styles.listCard]}>
        {rows.map(([title, sub, amount, color], i) => (
          <Pressable key={title} accessibilityRole="button" accessibilityLabel={`${title} ${formatPesos(amount)} ${sub}. Ver fiados`} onPress={onOpen} style={({ pressed }) => [styles.pend, i > 0 && styles.divider, pressed && styles.pressedSoft]}>
            <View style={styles.pendIcon}>
              <Ionicons name="people-outline" size={17} color={C.action.solid} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.pendTitle}>{title}</Text>
              <Text style={styles.cashMeta}>{sub}</Text>
            </View>
            <Text style={[styles.pendValue, { color }]}>{formatPesos(amount)}</Text>
            <Ionicons name="chevron-forward" size={17} color={C.textSoft} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sec}>
      <Text style={styles.secTitle} accessibilityRole="header">
        {title}
      </Text>
      {hint ? <Text style={styles.secHint}>{hint}</Text> : null}
    </View>
  );
}

export const overviewStyles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.inner, padding: 14, borderWidth: 1, borderColor: C.line },
  listCard: { paddingVertical: 2, paddingHorizontal: S.md },
  divider: { borderTopWidth: 1, borderTopColor: C.line },
  stack: { gap: S.sm },
  pressed: { transform: [{ scale: 0.98 }] },
});

const styles = StyleSheet.create({
  ...overviewStyles,
  flex: { flex: 1, minWidth: 0 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm },
  strong: { fontFamily: fin.font.uiExtra, color: C.text },
  pressedSoft: { opacity: 0.7 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: R.key, backgroundColor: C.control },
  tab: { flex: 1, minHeight: fin.size.touch - 4, borderRadius: R.tab, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: C.surface, ...fin.elevation.card, shadowOpacity: 0.08, elevation: 1 },
  tabText: { ...T.label, fontSize: 13.5 },
  tabTextOn: { fontFamily: fin.font.uiExtra, color: C.text },
  kicker: T.kicker,
  chg: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: S.sm, paddingVertical: 2, borderRadius: R.badge, backgroundColor: C.in.soft },
  chgDown: { backgroundColor: C.out.soft },
  chgText: { ...T.small, fontFamily: fin.font.uiExtra, color: C.in.ink },
  big: { ...T.heroAmount, marginTop: 2 },
  per100: { ...T.label, fontSize: 13, marginTop: 2 },
  splitBar: { flexDirection: 'row', height: 10, borderRadius: R.badge, overflow: 'hidden', backgroundColor: C.control, marginTop: 10 },
  splitPart: { height: '100%' },
  bars: { flexDirection: 'row', gap: 4, marginTop: S.md },
  barCol: { flex: 1, alignItems: 'center', gap: 3 },
  barTrack: { height: BARS_H, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: C.in.fill, transformOrigin: 'bottom' },
  barThin: { borderTopLeftRadius: 3, borderTopRightRadius: 3, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
  barToday: { backgroundColor: C.action.solid },
  barBest: { backgroundColor: C.in.solid },
  barFlat: { backgroundColor: C.line },
  barDay: { ...T.small, fontSize: 9.5, color: C.textSoft },
  barDayToday: { color: C.action.link },
  eq: { flexDirection: 'row', gap: S.md, marginTop: S.md, paddingTop: S.md, borderTopWidth: 1, borderTopColor: C.line },
  eqLabel: { ...T.small, color: C.textSoft },
  eqValue: T.split,
  eqMeta: { ...T.small, fontFamily: fin.font.uiSemibold, color: C.textSoft },
  acts: { flexDirection: 'row', gap: 6 },
  act: { flex: 1, minHeight: fin.size.button, borderRadius: R.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actIn: { backgroundColor: C.in.solid },
  actOut: { backgroundColor: C.out.fill },
  actMic: { flex: 0, width: fin.size.button, backgroundColor: C.action.solid },
  actText: { ...T.button, fontSize: 15.5, color: C.in.on },
  sec: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: S.sm, paddingHorizontal: 2, marginTop: S.xs },
  secTitle: { fontSize: 16, fontFamily: fin.font.display, color: C.text },
  secHint: { ...T.label, fontSize: 12 },
  ins: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: S.md, borderRadius: R.key + 2, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  insIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  insText: { fontSize: 13.5, lineHeight: 19, fontFamily: fin.font.uiSemibold, color: C.text },
  insLink: { ...T.small, fontSize: 12.5, fontFamily: fin.font.uiExtra, color: C.action.link, marginTop: S.xs },
  methBar: { flexDirection: 'row', height: 12, borderRadius: R.badge, overflow: 'hidden', gap: 2, marginBottom: 10 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm, minHeight: 26 },
  legendLabel: { ...T.label, fontSize: 13, flexShrink: 1 },
  legendHint: { ...T.small, fontFamily: fin.font.uiSemibold, color: C.textSoft },
  legendValue: { fontSize: 14, fontFamily: fin.font.display, color: C.text },
  cashRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingTop: 10, marginTop: S.xs },
  cashTitle: { ...T.body },
  cashMeta: { ...T.small, fontFamily: fin.font.uiSemibold, color: C.textSoft },
  cashValue: { fontSize: 18, fontFamily: fin.font.display, color: C.text },
  rows: { gap: S.md },
  shareRow: { gap: 5 },
  shareName: { ...T.body, flexShrink: 1 },
  shareValue: { fontSize: 14, fontFamily: fin.font.display, color: C.text },
  shareMeta: { ...T.small, fontFamily: fin.font.uiSemibold, color: C.textSoft },
  track: { height: 6, borderRadius: R.badge, backgroundColor: C.control, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: R.badge },
  pend: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  pendIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.action.soft, alignItems: 'center', justifyContent: 'center' },
  pendTitle: T.body,
  pendValue: { fontSize: 15.5, fontFamily: fin.font.display },
});
