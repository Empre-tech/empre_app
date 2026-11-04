import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { ledgerApi, type Analytics, type InvLine, type ProductStat } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { Delta, HBars, HeatGrid, SALES_COLOR } from '@/components/finance/Charts';
import { RangeSheet } from '@/components/finance/RangeSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { bestSlot, bucketLabel, compareText, dayLong, deltaLabel, lowMargin, marginPct, rangeFromParams, rangeTitle, rankProducts, topMismatch, type DateRange } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

type Tab = 'summary' | 'products' | 'inventory';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Resumen' },
  { key: 'products', label: 'Productos' },
  { key: 'inventory', label: 'Inventario' },
];

/**
 * Análisis del negocio: un rango libre de fechas comparado con otro. El Resumen va por bloques (lienzo «Empre», página
 * 13): lo que quedó con sus barras, margen, ventas, lo que te deben, los gastos, cuándo se vende y cómo pagan. Luego la
 * ganancia por producto y el inventario en plata.
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
      <SubScreenHeader subtitle="Empre Finance" product="finance" title="Análisis del negocio" />
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Fechas: ${rangeTitle(range)}. Cambiar`} onPress={() => setSheet(true)} style={styles.rangeBtn}>
          <Ionicons name="calendar-outline" size={18} color={colors.primaryDark} />
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
          <Summary a={a} entityId={entityId} />
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

function Kpi({ label, value, delta, worseUp }: { label: string; value: string; delta: ReturnType<typeof deltaLabel>; worseUp?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Delta d={delta} worseIsWarn={worseUp} />
    </View>
  );
}

/** El margen en un medidor: se lee sin mirar el número. */
function MarginGauge({ pct }: { pct: number }) {
  const v = Math.max(0, Math.min(100, pct));
  const angle = ((v / 100) * 180 - 180) * (Math.PI / 180);
  return (
    <Svg width={132} height={74} viewBox="0 0 132 74" accessibilityRole="image" accessibilityLabel={`Margen de ${pct} por ciento`}>
      <Path d="M 10 68 A 56 56 0 0 1 122 68" fill="none" stroke={colors.selectedSoft} strokeWidth={10} strokeLinecap="round" />
      {v > 0 ? <Path d={`M 10 68 A 56 56 0 ${v > 50 ? 1 : 0} 1 ${66 + 56 * Math.cos(angle)} ${68 + 56 * Math.sin(angle)}`} fill="none" stroke={colors.ink} strokeWidth={10} strokeLinecap="round" /> : null}
      <Line x1={66} y1={68} x2={66 + 42 * Math.cos(angle)} y2={68 + 42 * Math.sin(angle)} stroke={colors.ink} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={66} cy={68} r={4.5} fill={colors.ink} />
    </Svg>
  );
}

/** Lo que quedó en cada día (o semana, o mes): una barra por parte; tocarla dice qué pasó. */
function ProfitBars({ series, bucket }: { series: Analytics['series']; bucket: Analytics['bucket'] }) {
  const [sel, setSel] = useState<number | null>(null);
  const left = series.map((p) => p.sales - p.expenses);
  const max = Math.max(1, ...left.map(Math.abs));
  const every = series.length > 16 ? Math.ceil(series.length / 8) : 1;
  const bestI = left.indexOf(Math.max(...left));
  const nameOf = (start: string) => (bucket === 'month' ? bucketLabel('month', start, 0) : bucket === 'week' ? `Semana del ${dayLong(start)}` : dayLong(start));
  const p = sel !== null ? series[sel] : null;
  const line = p
    ? `${nameOf(p.start)}: vendiste ${formatPesos(p.sales)} y ${p.sales - p.expenses >= 0 ? 'te quedaron' : 'perdiste'} ${formatPesos(Math.abs(p.sales - p.expenses))}`
    : series.length > 1 && left[bestI] > 0
      ? `Lo mejor: ${nameOf(series[bestI].start)}, te quedaron ${formatPesos(left[bestI])}`
      : null;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.pBars}>
        {series.map((pt, i) => {
          const v = left[i];
          return (
            <Pressable
              key={pt.start}
              accessibilityRole="button"
              accessibilityState={{ selected: sel === i }}
              accessibilityLabel={`${nameOf(pt.start)}: ${v >= 0 ? 'te quedaron' : 'perdiste'} ${formatPesos(Math.abs(v))}`}
              onPress={() => setSel(sel === i ? null : i)}
              style={styles.pSlot}
            >
              <View style={[styles.pBar, { height: `${Math.max(8, (Math.abs(v) / max) * 100)}%`, backgroundColor: v < 0 ? colors.warning : SALES_COLOR, opacity: sel === null ? 0.45 + (Math.abs(v) / max) * 0.55 : sel === i ? 1 : 0.3 }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {series.map((pt, i) => (
          <Text key={pt.start} style={[styles.pLabel, sel === i && { color: colors.ink, fontFamily: fonts.ui.extrabold }]} numberOfLines={1}>
            {i % every === 0 ? bucketLabel(bucket, pt.start, series.length) : ''}
          </Text>
        ))}
      </View>
      {line ? <Text style={styles.heroLine}>{line}</Text> : null}
    </View>
  );
}

const BAND = 0.08;

/** Las ventas frente al periodo anterior y, por días, frente a lo normal de cada día de la semana. */
function SalesTrend({ a }: { a: Analytics }) {
  const [width, setWidth] = useState(0);
  const cur = a.series.map((p) => p.sales);
  const prev = a.previous_series ?? [];
  const normal = a.normal?.length === cur.length ? a.normal : null;
  if (cur.length < 2) return null;
  const H = 130;
  const top = Math.max(1, ...cur, ...prev, ...(normal ?? []).map((v) => v * (1 + BAND))) * 1.08;
  const X = (i: number, n: number) => 5 + (i / Math.max(1, n - 1)) * Math.max(1, width - 10);
  const Y = (v: number) => H - 6 - (v / top) * (H - 12);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i, arr.length).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const band = normal
    ? `${normal.map((v, i) => `${i ? 'L' : 'M'}${X(i, normal.length).toFixed(1)} ${Y(v * (1 + BAND)).toFixed(1)}`).join(' ')} ${[...normal].reverse().map((v, i) => `L${X(normal.length - 1 - i, normal.length).toFixed(1)} ${Y(v * (1 - BAND)).toFixed(1)}`).join(' ')} Z`
    : null;
  const offs = normal ? cur.map((v, i) => (normal[i] > 0 ? Math.round(((v - normal[i]) / normal[i]) * 100) : 0)) : [];
  const hi = offs.length ? offs.indexOf(Math.max(...offs)) : -1;
  const lo = offs.length ? offs.indexOf(Math.min(...offs)) : -1;
  const parts: string[] = [];
  if (hi >= 0 && offs[hi] > BAND * 100) parts.push(`${dayLong(a.series[hi].start)}: ${offs[hi]} % más de lo normal`);
  if (lo >= 0 && offs[lo] < -BAND * 100) parts.push(`${dayLong(a.series[lo].start)}: ${-offs[lo]} % menos`);
  return (
    <Card title="¿Cómo van las ventas?">
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel={`Ventas: ${formatPesos(a.current.sales_total)}. Periodo anterior: ${formatPesos(a.previous.sales_total)}.`} style={{ height: H }}>
        {width > 0 ? (
          <Svg width={width} height={H}>
            {band ? <Path d={band} fill={colors.selectedSoft} /> : null}
            {prev.length > 1 ? <Path d={line(prev)} fill="none" stroke="#8796AB" strokeWidth={1.6} strokeDasharray="4 5" /> : null}
            <Path d={line(cur)} fill="none" stroke={SALES_COLOR} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
            {cur.length <= 31 ? cur.map((v, i) => <Circle key={i} cx={X(i, cur.length)} cy={Y(v)} r={3.5} fill={i === lo && offs[lo] < -BAND * 100 ? colors.warning : i === hi && offs[hi] > BAND * 100 ? colors.ink : SALES_COLOR} />) : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.trendLegend}>
        <Text style={styles.meta}>— Este periodo</Text>
        {prev.length > 1 ? <Text style={styles.meta}>- - El anterior</Text> : null}
        {band ? <Text style={styles.meta}>▒ Lo normal</Text> : null}
      </View>
      {parts.length ? <Text style={styles.heroLine}>{parts.join(' · ')}</Text> : null}
    </Card>
  );
}

/** Cómo pagaron: una pila de tarjetas; la que se toca pasa al frente y abajo se ve su plata. */
function PayStack({ parts }: { parts: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; value: number; bg: string }[] }) {
  const total = Math.max(1, parts.reduce((s, x) => s + x.value, 0));
  const shown = parts.filter((x) => x.value > 0);
  const biggest = shown.reduce((a, c) => (c.value > a.value ? c : a), shown[0]);
  const [front, setFront] = useState(biggest?.key);
  if (!biggest) return null;
  const order = [...shown.filter((x) => x.key !== front), shown.find((x) => x.key === front) ?? biggest];
  const cur = order[order.length - 1];
  return (
    <View>
      <View style={{ height: order.length * 40 + 20 }}>
        {order.map((x, pos) => {
          const back = order.length - 1 - pos;
          const pct = Math.round((x.value / total) * 100);
          return (
            <Pressable
              key={x.key}
              accessibilityRole="button"
              accessibilityState={{ selected: back === 0 }}
              accessibilityLabel={`${x.label}: ${pct} por ciento, ${formatPesos(x.value)}`}
              onPress={() => setFront(x.key)}
              style={[styles.payCard, { top: pos * 40, left: back * 8, right: back * 8, backgroundColor: x.bg }]}
            >
              <Ionicons name={x.icon} size={18} color={colors.ink} />
              <Text style={styles.payName}>{x.label}</Text>
              <Text style={styles.payPct}>{pct} %</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.payFoot}>
        <Text style={styles.heroLine}>{cur.label}</Text>
        <Text style={styles.payAmt}>{formatPesos(cur.value)}</Text>
      </View>
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

function Summary({ a, entityId }: { a: Analytics; entityId: string }) {
  const router = useRouter();
  const c = a.current;
  const p = a.previous;
  const m = marginPct(c);
  const pm = marginPct(p);
  const best = bestSlot(a.heat);
  const cats = Object.entries(c.expenses_by_category)
    .sort(([, x], [, y]) => y - x)
    .map(([k, v]) => ({ key: k, value: v, d: deltaLabel(v, p.expenses_by_category[k] ?? 0, true) }));
  const noData = c.sales_count === 0 && c.expenses_total === 0;
  const SHADES = [colors.ink, '#5B6B82', '#8796AB', colors.line];

  if (noData) {
    return <EmptyState icon="bar-chart-outline" title="Sin movimientos en estas fechas" body="Registra ventas y gastos y aquí verás tus gráficos. Prueba otras fechas." />;
  }
  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.kpiLabel}>{c.profit >= 0 ? 'Te quedó' : 'Perdiste'}</Text>
          <Delta d={deltaLabel(c.profit, p.profit)} />
        </View>
        <Text style={[styles.heroValue, c.profit < 0 && { color: colors.warning }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatPesos(Math.abs(c.profit))}
        </Text>
        <ProfitBars series={a.series} bucket={a.bucket} />
      </View>

      <View style={styles.pair}>
        {m !== null ? (
          <View style={[styles.tile, { alignItems: 'center' }]}>
            <Text style={[styles.kpiLabel, { alignSelf: 'flex-start' }]}>Margen</Text>
            <MarginGauge pct={m} />
            <Text style={styles.kpiValue}>{m} %</Text>
            {pm !== null && pm !== m ? <Delta d={{ text: `${m > pm ? '▲' : '▼'} ${Math.abs(m - pm)} puntos`, tone: m > pm ? 'good' : 'bad' }} /> : null}
            {c.margin_coverage_pct < 100 ? <Text style={styles.meta}>{c.margin_coverage_pct} % con costo</Text> : null}
          </View>
        ) : null}
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Kpi label="Vendiste" value={formatPesos(c.sales_total)} delta={deltaLabel(c.sales_total, p.sales_total)} />
          <Kpi label="Ticket promedio" value={formatPesos(c.avg_ticket)} delta={deltaLabel(c.avg_ticket, p.avg_ticket)} />
        </View>
      </View>

      <SalesTrend a={a} />

      <View style={styles.pair}>
        {a.receivable > 0 ? (
          <View style={styles.oweTile}>
            <Text style={styles.oweLabel}>Te deben</Text>
            <Text style={styles.oweValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatPesos(a.receivable)}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Ver quién te debe y recordarle" onPress={() => router.push({ pathname: '/business/ledger/debts/[id]', params: { id: entityId } })} style={styles.oweBtn}>
              <Text style={styles.oweBtnText}>Recordarles</Text>
            </Pressable>
          </View>
        ) : (
          <Kpi label="Ventas" value={`${c.sales_count}${a.days > 1 ? ` · ${(c.sales_count / a.days).toFixed(1).replace('.', ',')}/día` : ''}`} delta={deltaLabel(c.sales_count, p.sales_count)} />
        )}
        <View style={styles.tile}>
          <Text style={styles.kpiLabel}>Gastaste</Text>
          <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatPesos(c.expenses_total)}
          </Text>
          <Delta d={deltaLabel(c.expenses_total, p.expenses_total, true)} worseIsWarn />
          {cats.length > 0 ? (
            <>
              <View style={styles.spendBar}>
                {cats.slice(0, 4).map((x, i) => (
                  <View key={x.key} style={{ flex: x.value, borderRadius: 5, backgroundColor: SHADES[i] }} />
                ))}
              </View>
              {cats.slice(0, 4).map((x, i) => (
                <View key={x.key} style={styles.spendRow}>
                  <View style={[styles.dot, { width: 8, height: 8, backgroundColor: SHADES[i] }]} />
                  <Text style={styles.spendName} numberOfLines={1}>
                    {categoryLabel(x.key)}
                  </Text>
                  <Delta d={x.d} worseIsWarn />
                </View>
              ))}
            </>
          ) : null}
        </View>
      </View>

      {a.receivable > 0 ? (
        <Kpi label="Ventas" value={`${c.sales_count}${a.days > 1 ? ` · ${(c.sales_count / a.days).toFixed(1).replace('.', ',')}/día` : ''}`} delta={deltaLabel(c.sales_count, p.sales_count)} />
      ) : null}

      {c.sales_count > 0 ? (
        <Card title="¿Cuándo vendes más?">
          {best ? <Text style={styles.bestLine}>Tu mejor momento: {best}</Text> : null}
          <HeatGrid heat={a.heat} />
        </Card>
      ) : null}

      {c.sales_total > 0 ? (
        <Card title="¿Cómo te pagaron?">
          <PayStack
            parts={[
              { key: 'card', label: METHOD_LABEL.card, icon: 'card-outline', value: c.by_method.card, bg: '#D5DEEA' },
              { key: 'credit', label: 'Fiado', icon: 'person-outline', value: c.by_method.credit, bg: colors.accentSoft },
              { key: 'transfer', label: METHOD_LABEL.transfer, icon: 'phone-portrait-outline', value: c.by_method.transfer, bg: colors.selectedSoft },
              { key: 'cash', label: METHOD_LABEL.cash, icon: 'cash-outline', value: c.by_method.cash, bg: colors.verifiedSoft },
            ]}
          />
        </Card>
      ) : null}
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
        <Text style={[styles.lineName, by === 'profit' && { color: (p.profit ?? 0) < 0 ? '#B3261E' : '#0A6E6A' }]}>{main === null ? 'Sin costo' : formatPesos(main)}</Text>
      </View>
      <View style={[styles.track, { marginLeft: 30 }]}>
        <View style={[styles.fill, { width: `${Math.max(0, ((main ?? 0) / max) * 100)}%`, backgroundColor: by === 'profit' ? colors.success : colors.primary }]} />
      </View>
      <View style={[styles.pHead, { marginLeft: 30 }]}>
        <Text style={[styles.meta, { flex: 1 }]}>
          {by === 'profit' ? `Vendiste ${formatPesos(p.revenue)}` : p.profit !== null ? `Te dejó ${formatPesos(p.profit)}` : 'Sin costo'} · {String(Math.round(p.qty * 10) / 10).replace('.', ',')} und
        </Text>
        {p.margin_pct !== null ? (
          <View style={[styles.pill, { backgroundColor: good ? '#E3F5F3' : colors.accentSoft }]}>
            <Text style={[styles.pillText, { color: good ? '#0A6E6A' : colors.accentInk }]}>{Math.round(p.margin_pct)} %</Text>
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
          <Text style={[styles.meta, { color: '#0A6E6A', fontFamily: fonts.ui.bold }]}>
            Si lo vendes todo: {formatPesos(inv.value_price)} · ganarías {formatPesos(inv.value_price - inv.value_cost)}
          </Text>
        ) : null}
        {inv.by_section.length > 1 ? <HBars rows={inv.by_section.map((s) => ({ label: s.name, value: s.value }))} color={colors.ink} /> : null}
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
  tabOn: { borderBottomColor: colors.brand },
  tabText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  tabTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  meta: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  link: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  hero: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg + 2, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroValue: { fontSize: 34, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  heroLine: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  pBars: { height: 104, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  pSlot: { flex: 1, height: 104, justifyContent: 'flex-end' },
  pBar: { borderRadius: 5 },
  pLabel: { flex: 1, textAlign: 'center', fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  pair: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  tile: { flex: 1, minWidth: 0, gap: 2, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  oweTile: { flex: 1, minWidth: 0, gap: 4, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primary },
  oweLabel: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
  oweValue: { fontSize: 28, fontFamily: fonts.display.bold, color: '#fff', fontVariant: ['tabular-nums'] },
  oweBtn: { marginTop: 'auto', minHeight: 46, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  oweBtnText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  spendBar: { flexDirection: 'row', gap: 3, height: 22, marginVertical: spacing.sm },
  spendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 22 },
  spendName: { flex: 1, minWidth: 0, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  trendLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  bestLine: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  payCard: { position: 'absolute', height: 96, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  payName: { flex: 1, fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  payPct: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  payFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, marginHorizontal: -spacing.md, marginBottom: -spacing.md, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, backgroundColor: colors.surface },
  payAmt: { fontSize: 21, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  kpiLabel: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  kpiValue: { fontSize: 21, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  big: { fontSize: 30, fontFamily: fonts.display.bold, color: colors.ink },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  callout: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  calloutText: { flexShrink: 1, fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface },
  segText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  segTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  pRow: { gap: 6, padding: spacing.md },
  pLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  pHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { width: 22, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.bg },
  fill: { height: 8, borderRadius: 4 },
  pill: { minHeight: 24, paddingHorizontal: 8, borderRadius: radius.pill, justifyContent: 'center' },
  pillText: { fontSize: 12, fontFamily: fonts.ui.extrabold },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 46, borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  lineName: { fontSize: 14.5, fontFamily: fonts.ui.bold, color: colors.ink },
  lineTag: { fontSize: 12.5, fontFamily: fonts.ui.extrabold },
  lineValue: { minWidth: 76, textAlign: 'right', fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dot: { width: 10, height: 10, borderRadius: 5 },
  outlineBtn: { minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  smallBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center' },
  smallBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
