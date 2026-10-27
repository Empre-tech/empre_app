import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type Analytics, type InvLine, type ProductStat } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { BarPairs, Delta, HBars, HeatGrid, StackBar } from '@/components/finance/Charts';
import { RangeSheet } from '@/components/finance/RangeSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { bestSlot, compareText, deltaLabel, lowMargin, marginPct, rangeFromParams, rangeTitle, rankProducts, topMismatch, type DateRange } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

type Tab = 'summary' | 'products' | 'inventory';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Resumen' },
  { key: 'products', label: 'Productos' },
  { key: 'inventory', label: 'Inventario' },
];

/**
 * Análisis del negocio: un rango libre de fechas comparado con otro, con gráficos (ventas y gastos por día, cuándo se
 * vende, cómo pagan, en qué se va la plata), la ganancia por producto y el inventario en plata.
 */
export default function AnalyticsScreen() {
  const params = useLocalSearchParams<{ id: string; from?: string; to?: string; compare?: string; preset?: string; tab?: string }>();
  const entityId = params.id ?? '';
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<DateRange>(() => rangeFromParams(params));
  const [tab, setTab] = useState<Tab>(params.tab === 'products' || params.tab === 'inventory' ? params.tab : 'summary');
  const [sheet, setSheet] = useState(false);

  const q = useQuery({
    queryKey: ['ledger', entityId, 'analytics', range.from, range.to, range.compare],
    queryFn: () => ledgerApi.analytics(entityId, { from: range.from, to: range.to, compare: range.compare }),
    enabled: Boolean(entityId),
    staleTime: 30_000,
  });
  const a = q.data;

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Análisis del negocio" />
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Fechas: ${rangeTitle(range)}. Cambiar`} onPress={() => setSheet(true)} style={styles.rangeBtn}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rangeTitle}>{rangeTitle(range)}</Text>
            {a ? <Text style={styles.meta}>{compareText(a)}</Text> : null}
          </View>
          <Text style={styles.link}>Cambiar</Text>
        </Pressable>
        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabOn]}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      >
        {q.isLoading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : q.isError || !a ? (
          <EmptyState icon="cloud-offline-outline" title="No pudimos cargar el análisis" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void q.refetch() }} />
        ) : tab === 'summary' ? (
          <Summary a={a} />
        ) : tab === 'products' ? (
          <Products a={a} entityId={entityId} />
        ) : (
          <Inventory a={a} entityId={entityId} />
        )}
      </ScrollView>

      <RangeSheet visible={sheet} value={range} onApply={setRange} onClose={() => setSheet(false)} />
    </View>
  );
}

function Kpi({ label, value, delta, color, worseUp }: { label: string; value: string; delta: ReturnType<typeof deltaLabel>; color?: string; worseUp?: boolean }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Delta d={delta} worseIsWarn={worseUp} />
    </View>
  );
}

function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Summary({ a }: { a: Analytics }) {
  const c = a.current;
  const p = a.previous;
  const m = marginPct(c);
  const pm = marginPct(p);
  const best = bestSlot(a.heat);
  const cats = Object.entries(c.expenses_by_category)
    .sort(([, x], [, y]) => y - x)
    .map(([k, v]) => ({ key: k, value: v, d: deltaLabel(v, p.expenses_by_category[k] ?? 0, true) }));
  const noData = c.sales_count === 0 && c.expenses_total === 0;

  return (
    <>
      <View style={styles.kpis}>
        <Kpi label="Vendiste" value={formatPesos(c.sales_total)} delta={deltaLabel(c.sales_total, p.sales_total)} />
        <Kpi label={c.profit >= 0 ? 'Te quedó' : 'Perdiste'} value={formatPesos(Math.abs(c.profit))} color={c.profit >= 0 ? '#1D6B3D' : '#B3261E'} delta={deltaLabel(c.profit, p.profit)} />
        <Kpi label="Ticket promedio" value={formatPesos(c.avg_ticket)} delta={deltaLabel(c.avg_ticket, p.avg_ticket)} />
        <Kpi
          label="Ventas"
          value={`${c.sales_count}${a.days > 1 ? ` · ${(c.sales_count / a.days).toFixed(1).replace('.', ',')}/día` : ''}`}
          delta={deltaLabel(c.sales_count, p.sales_count)}
        />
        {m !== null ? (
          <Kpi
            label={c.margin_coverage_pct < 100 ? `Margen (${c.margin_coverage_pct} % con costo)` : 'Margen'}
            value={`${m} %`}
            delta={pm !== null && pm !== m ? { text: `${m > pm ? '▲' : '▼'} ${Math.abs(m - pm)} puntos`, tone: m > pm ? 'good' : 'bad' } : null}
          />
        ) : null}
        <Kpi label="Gastaste" value={formatPesos(c.expenses_total)} delta={deltaLabel(c.expenses_total, p.expenses_total, true)} worseUp />
      </View>

      {noData ? (
        <EmptyState icon="bar-chart-outline" title="Sin movimientos en estas fechas" body="Registra ventas y gastos y aquí verás tus gráficos. Prueba otras fechas." />
      ) : (
        <>
          <Card title={a.bucket === 'day' ? 'Ventas y gastos por día' : a.bucket === 'week' ? 'Ventas y gastos por semana' : 'Ventas y gastos por mes'}>
            <BarPairs series={a.series} bucket={a.bucket} />
          </Card>

          {c.sales_count > 0 ? (
            <Card title="¿Cuándo vendes más?">
              {best ? (
                <View style={styles.callout}>
                  <Ionicons name="sunny-outline" size={18} color={colors.primaryDark} />
                  <Text style={styles.calloutText}>Tu mejor momento: {best}</Text>
                </View>
              ) : null}
              <HeatGrid heat={a.heat} />
            </Card>
          ) : null}

          {c.sales_total > 0 ? (
            <Card title="¿Cómo te pagan?">
              <StackBar
                parts={[
                  { label: METHOD_LABEL.cash, value: c.by_method.cash, color: colors.primary },
                  { label: METHOD_LABEL.transfer, value: c.by_method.transfer, color: '#6E9EDD' },
                  { label: METHOD_LABEL.card, value: c.by_method.card, color: colors.verified },
                  { label: 'Fiado', value: c.by_method.credit, color: colors.accent },
                ]}
              />
            </Card>
          ) : null}

          {cats.length > 0 ? (
            <Card title="¿En qué se te va la plata?">
              <HBars rows={cats.map((x) => ({ label: categoryLabel(x.key), value: x.value, extra: <View style={{ width: 62, alignItems: 'flex-end' }}><Delta d={x.d} worseIsWarn /></View> }))} />
              <Text style={styles.meta}>Cada gasto frente al periodo con que comparas.</Text>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}

function Products({ a, entityId }: { a: Analytics; entityId: string }) {
  const router = useRouter();
  const [by, setBy] = useState<'revenue' | 'profit'>('profit');
  const [all, setAll] = useState(false);
  const list = useMemo(() => rankProducts(a.products, by), [a.products, by]);
  const low = useMemo(() => lowMargin(a.products), [a.products]);
  const mismatch = useMemo(() => topMismatch(a.products), [a.products]);
  const maxV = Math.max(1, ...list.map((p) => (by === 'profit' ? p.profit ?? 0 : p.revenue)));
  const shown = all ? list : list.slice(0, 15);

  if (a.products.length === 0) {
    return <EmptyState icon="cube-outline" title="Sin ventas de productos en estas fechas" body="Cuando registres ventas con productos, aquí verás cuáles venden más y cuáles te dejan más." />;
  }
  return (
    <>
      <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel="Ordenar por">
        {(
          [
            ['revenue', 'Lo que más vendes'],
            ['profit', 'Lo que más te deja'],
          ] as const
        ).map(([k, label]) => (
          <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: by === k }} onPress={() => setBy(k)} style={[styles.segBtn, by === k && styles.segOn]}>
            <Text style={[styles.segText, by === k && styles.segTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {mismatch ? (
        <View style={[styles.callout, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.accentInk} />
          <Text style={[styles.calloutText, { color: colors.accentInk }]}>{mismatch}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { padding: 0, gap: 0 }]}>
        {shown.map((p, i) => (
          <ProductRow key={p.ref} p={p} rank={i + 1} by={by} max={maxV} />
        ))}
        {list.length > shown.length ? (
          <Pressable accessibilityRole="button" onPress={() => setAll(true)} style={styles.more}>
            <Text style={styles.link}>Ver los {list.length} productos</Text>
          </Pressable>
        ) : null}
      </View>

      {low.length > 0 ? (
        <Card title="Revisa estos precios">
          <Text style={styles.meta}>Te dejan menos del 10 % o te hacen perder.</Text>
          {low.slice(0, 8).map((p) => (
            <View key={p.ref} style={styles.line}>
              <Text style={[styles.lineName, { flex: 1 }]} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={[styles.lineTag, { color: (p.profit ?? 0) < 0 ? '#B3261E' : colors.accentInk }]}>
                {(p.profit ?? 0) < 0 ? `Perdiste ${formatPesos(-(p.profit ?? 0))}` : `Te deja ${Math.round(p.margin_pct ?? 0)} %`}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {a.uncosted_count > 0 ? (
        <View style={styles.callout}>
          <Text style={[styles.calloutText, { flex: 1 }]}>
            {a.uncosted_count === 1 ? '1 producto no tiene' : `${a.uncosted_count} productos no tienen`} costo: su ganancia no se cuenta (
            {a.current.sales_total > 0 ? Math.round((a.uncosted_revenue / a.current.sales_total) * 100) : 0} % de tus ventas).
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/ledger/costs/[id]', params: { id: entityId } })} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>Ponerles costo</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

function ProductRow({ p, rank, by, max }: { p: ProductStat; rank: number; by: 'revenue' | 'profit'; max: number }) {
  const main = by === 'profit' ? p.profit : p.revenue;
  const good = p.margin_pct !== null && p.margin_pct >= 15;
  return (
    <View style={[styles.pRow, rank > 1 && styles.pLine]}>
      <View style={styles.pHead}>
        <Text style={styles.rank}>{rank}</Text>
        <Text style={[styles.lineName, { flex: 1 }]} numberOfLines={1}>
          {p.name}
        </Text>
        <Text style={[styles.lineName, by === 'profit' && { color: (p.profit ?? 0) < 0 ? '#B3261E' : '#1D6B3D' }]}>{main === null ? 'Sin costo' : formatPesos(main)}</Text>
      </View>
      <View style={[styles.track, { marginLeft: 30 }]}>
        <View style={[styles.fill, { width: `${Math.max(0, ((main ?? 0) / max) * 100)}%`, backgroundColor: by === 'profit' ? colors.success : colors.primary }]} />
      </View>
      <View style={[styles.pHead, { marginLeft: 30 }]}>
        <Text style={[styles.meta, { flex: 1 }]}>
          {by === 'profit' ? `Vendiste ${formatPesos(p.revenue)}` : p.profit !== null ? `Te dejó ${formatPesos(p.profit)}` : 'Sin costo'} · {String(Math.round(p.qty * 10) / 10).replace('.', ',')} und
        </Text>
        {p.margin_pct !== null ? (
          <View style={[styles.pill, { backgroundColor: good ? '#E7F5EC' : colors.accentSoft }]}>
            <Text style={[styles.pillText, { color: good ? '#1D6B3D' : colors.accentInk }]}>{Math.round(p.margin_pct)} %</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Lines({ rows, empty, onPress }: { rows: InvLine[]; empty: string; onPress?: (r: InvLine) => void }) {
  if (rows.length === 0) return <Text style={styles.meta}>{empty}</Text>;
  return (
    <>
      {rows.map((r) => (
        <Pressable key={`${r.ref}${r.text}`} accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={() => onPress?.(r)} style={styles.line}>
          {r.tone !== 'muted' ? <View style={[styles.dot, { backgroundColor: r.tone === 'out' ? colors.danger : colors.accent }]} /> : null}
          <Text style={[styles.lineName, { flex: 1 }]} numberOfLines={1}>
            {r.name}
          </Text>
          <Text style={[styles.lineTag, { color: r.tone === 'out' ? '#B3261E' : r.tone === 'low' ? colors.accentInk : colors.muted }]}>{r.text}</Text>
          {r.value != null ? <Text style={styles.lineValue}>{formatPesos(r.value)}</Text> : null}
        </Pressable>
      ))}
    </>
  );
}

function Inventory({ a, entityId }: { a: Analytics; entityId: string }) {
  const router = useRouter();
  const inv = a.inventory;
  const goList = () => router.push({ pathname: '/business/products/[id]', params: { id: entityId } });
  const goItem = (r: InvLine) => router.push({ pathname: '/business/products/item', params: { entityId, itemId: r.ref } });
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.kpiLabel}>Plata en mercancía hoy</Text>
        <Text style={styles.big}>{formatPesos(inv.value_cost)}</Text>
        {inv.value_price > inv.value_cost ? (
          <Text style={[styles.meta, { color: '#1D6B3D', fontFamily: fonts.ui.bold }]}>
            Si lo vendes todo: {formatPesos(inv.value_price)} · ganarías {formatPesos(inv.value_price - inv.value_cost)}
          </Text>
        ) : null}
        {inv.by_section.length > 1 ? <HBars rows={inv.by_section.map((s) => ({ label: s.name, value: s.value }))} color={colors.primary} /> : null}
        <Text style={styles.meta}>
          {inv.valued === 0
            ? 'Para calcularlo, cuenta tus productos en cantidad exacta y ponles costo.'
            : inv.valued < inv.products
              ? `Con ${inv.valued} de ${inv.products} productos: los demás no tienen costo o no se cuentan exacto.`
              : `Con tus ${inv.valued} productos.`}
        </Text>
      </View>

      <Card title="Compra pronto" right={inv.soon_count > 0 ? <Text style={[styles.lineTag, { color: '#B3261E' }]}>{inv.soon_count === 1 ? '1 se acaba' : `${inv.soon_count} se acaban`}</Text> : null}>
        <Lines rows={inv.soon} empty="Nada se está acabando. Bien." onPress={goList} />
        <Pressable accessibilityRole="button" onPress={goList} style={styles.outlineBtn}>
          <Text style={styles.link}>Ver todo en el inventario</Text>
        </Pressable>
      </Card>

      <Card title="Lo que perdiste" right={inv.lost_total > 0 ? <Text style={[styles.lineName, { color: '#B3261E' }]}>{formatPesos(inv.lost_total)}</Text> : null}>
        <Text style={styles.meta}>Se dañó, venció o se perdió en estas fechas.</Text>
        <Lines rows={inv.lost} empty="No registraste pérdidas en estas fechas." />
      </Card>

      <Card title="Plata quieta" right={inv.idle_total > 0 ? <Text style={styles.lineName}>{formatPesos(inv.idle_total)}</Text> : null}>
        <Text style={styles.meta}>Lo que no se vende hace más de 4 semanas. Una oferta puede moverlo.</Text>
        <Lines rows={inv.idle} empty="Todo lo que cuentas se está moviendo." onPress={goItem} />
        {inv.idle.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/offers/new', params: { entityId } })} style={[styles.outlineBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }]}>
            <Text style={[styles.link, { color: colors.accentInk }]}>Crear una oferta</Text>
          </Pressable>
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  rangeBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line },
  rangeTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tabs: { flexDirection: 'row' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  tabTextOn: { fontFamily: fonts.ui.extrabold, color: colors.primary },
  meta: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  link: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primary },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpi: { flexBasis: '48%', flexGrow: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  kpiLabel: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  kpiValue: { fontSize: 19, fontFamily: fonts.ui.extrabold, color: colors.ink },
  big: { fontSize: 30, fontFamily: fonts.display.bold, color: colors.ink },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  callout: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  calloutText: { flexShrink: 1, fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: '#E8EEF6' },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface },
  segText: { fontSize: 14, fontFamily: fonts.ui.bold, color: '#55657C' },
  segTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  pRow: { gap: 6, padding: spacing.md },
  pLine: { borderTopWidth: 1, borderTopColor: '#EEF2F7' },
  pHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { width: 22, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.bg },
  fill: { height: 8, borderRadius: 4 },
  pill: { minHeight: 24, paddingHorizontal: 8, borderRadius: radius.pill, justifyContent: 'center' },
  pillText: { fontSize: 12, fontFamily: fonts.ui.extrabold },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#EEF2F7' },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 46, borderTopWidth: 1, borderTopColor: '#EEF2F7' },
  lineName: { fontSize: 14.5, fontFamily: fonts.ui.bold, color: colors.ink },
  lineTag: { fontSize: 12.5, fontFamily: fonts.ui.extrabold },
  lineValue: { minWidth: 76, textAlign: 'right', fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dot: { width: 10, height: 10, borderRadius: 5 },
  outlineBtn: { minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  smallBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center' },
  smallBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
