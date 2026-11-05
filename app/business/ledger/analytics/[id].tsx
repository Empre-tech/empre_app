import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type Analytics, type InvLine, type ProductStat } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { HBars, HeatGrid } from '@/components/finance/Charts';
import { UnderstandWeek } from '@/components/finance/UnderstandWeek';
import { EmpreAICard, SystemGroup, SystemHead, SystemRow, SystemSection, SystemTitle, ShareRow } from '@/components/system/parts';
import { RangeSheet } from '@/components/finance/RangeSheet';
import { bestSlot, bucketLabel, dayLong, deltaWords, leftOf, lowMargin, marginPct, presetRange, rangeFromParams, rangeTitle, rankProducts, todayCO, topMismatch, type DateRange } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL, pendingCredit, pendingTotals } from '@/lib/ledger';
import { useLedgerOutbox } from '@/ledger/ledgerStore';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

type Detail = 'products' | 'inventory' | null;
const DETAIL_TITLE = { products: 'Lo que vendes', inventory: 'Tu mercancía' } as const;
/** Días con ventas que hacen falta para dejar de hablar de «primeros días». */
const FIRST_DAYS = 7;
/** Ventas que hacen falta para que «cuándo vendes más» signifique algo. */
const MIN_FOR_HEAT = 10;

/**
 * Análisis del negocio: un lapso de tiempo comparado con otro. Responde en orden: cómo te fue, qué hacer, qué te deja
 * plata y, después, los detalles. Lo del día vive en Hoy.
 */
export default function AnalyticsScreen() {
  const params = useLocalSearchParams<{ id: string; from?: string; to?: string; compare?: string; preset?: string; tab?: string }>();
  const entityId = params.id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<DateRange>(() => (params.from ? rangeFromParams(params) : presetRange('7d', todayCO())));
  const [sheet, setSheet] = useState(false);
  const detail: Detail = params.tab === 'products' || params.tab === 'inventory' ? params.tab : null;

  const entity = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const q = useQuery({
    queryKey: ['ledger', entityId, 'analytics', range.from, range.to, range.compare],
    queryFn: () => ledgerApi.analytics(entityId, { from: range.from, to: range.to, compare: range.compare }),
    enabled: Boolean(entityId),
    staleTime: 30_000,
  });
  const a = q.data;
  const firstDays = !detail && range.preset === '7d' && Boolean(a) && a!.previous.sales_count === 0 && a!.series.filter((p) => p.sales > 0).length < FIRST_DAYS;
  const pick = (p: '7d' | 'month') => setRange(presetRange(p, todayCO()));
  const openDetail = (tab: 'products' | 'inventory') => router.push({ pathname: '/business/ledger/analytics/[id]', params: { id: entityId, from: range.from, to: range.to, compare: range.compare, preset: range.preset, tab } });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + spacing.xxl }]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        <View style={styles.top}>
          <SystemHead lead="Análisis de" name={entity.data?.name} />
          <SystemTitle>{detail ? DETAIL_TITLE[detail] : 'Cómo te ha ido'}</SystemTitle>
          {firstDays && a ? (
            <View style={styles.firstBar}>
              <Text style={styles.firstText}>Tus primeros días</Text>
              <Text style={styles.meta}>
                {a.series.filter((p) => p.sales > 0).length} de {FIRST_DAYS}
              </Text>
            </View>
          ) : (
            <View style={styles.periods} accessibilityRole="tablist">
              <Period label="Semana" on={range.preset === '7d'} onPress={() => pick('7d')} />
              <Period label="Mes" on={range.preset === 'month'} onPress={() => pick('month')} />
              <Period label="Fechas" on={range.preset !== '7d' && range.preset !== 'month'} onPress={() => setSheet(true)} />
            </View>
          )}
          {range.preset !== '7d' && range.preset !== 'month' ? <Text style={styles.meta}>{rangeTitle(range)}</Text> : null}
        </View>

        {q.isLoading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : q.isError || !a ? (
          <EmptyState icon="cloud-offline-outline" title="No pudimos cargar el análisis" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void q.refetch() }} />
        ) : detail === 'products' ? (
          <View style={styles.detail}>
            <Products a={a} entityId={entityId} />
          </View>
        ) : detail === 'inventory' ? (
          <View style={styles.detail}>
            <Inventory a={a} entityId={entityId} />
          </View>
        ) : (
          <Summary a={a} entityId={entityId} range={range} firstDays={firstDays} onDetail={openDetail} />
        )}
      </ScrollView>

      <RangeSheet visible={sheet} value={range} onApply={setRange} onClose={() => setSheet(false)} />
    </View>
  );
}

function Period({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.period, on && styles.periodOn]}>
      <Text style={styles.periodText}>{label}</Text>
    </Pressable>
  );
}

/** Lo que quedó en cada parte del periodo: una barra por parte; tocarla dice cuánto. */
function ProfitBars({ series, bucket }: { series: Analytics['series']; bucket: Analytics['bucket'] }) {
  const [sel, setSel] = useState<number | null>(null);
  const left = series.map((p) => p.left ?? p.sales - p.expenses);
  const max = Math.max(1, ...left.map(Math.abs));
  const every = series.length > 16 ? Math.ceil(series.length / 8) : 1;
  const bestI = left.indexOf(Math.max(...left));
  const nameOf = (start: string) => (bucket === 'month' ? bucketLabel('month', start, 0) : bucket === 'week' ? `semana del ${dayLong(start)}` : dayLong(start));
  const p = sel !== null ? series[sel] : null;
  const line = sel !== null && p
    ? `${nameOf(p.start)}: ${left[sel] >= 0 ? `te quedaron ${formatPesos(left[sel])}` : `salieron ${formatPesos(-left[sel])} más de lo que entró`}`
    : series.length > 1 && left[bestI] > 0
      ? `Lo mejor: ${nameOf(series[bestI].start)}, te quedaron ${formatPesos(left[bestI])}`
      : null;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.pBars}>
        {series.map((pt, i) => {
          const v = left[i];
          const strong = sel === i || (sel === null && i === bestI);
          return (
            <Pressable key={pt.start} accessibilityRole="button" accessibilityState={{ selected: sel === i }} accessibilityLabel={`${nameOf(pt.start)}: ${v >= 0 ? `te quedaron ${formatPesos(v)}` : `salieron ${formatPesos(-v)} más de lo que entró`}`} onPress={() => setSel(sel === i ? null : i)} style={styles.pSlot}>
              <View style={[styles.pBar, { height: `${Math.max(8, (Math.abs(v) / max) * 100)}%`, backgroundColor: v < 0 ? colors.warning : strong ? colors.ink : '#B6C1D1' }]} />
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

/** Las ventas frente al periodo anterior; en una frase, el día que más se salió de lo normal. */
function SalesTrend({ a }: { a: Analytics }) {
  const [width, setWidth] = useState(0);
  const cur = a.series.map((p) => p.sales);
  const prev = a.previous_series ?? [];
  const normal = a.normal?.length === cur.length ? a.normal : null;
  if (cur.length < 2) return null;
  const H = 96;
  const top = Math.max(1, ...cur, ...prev) * 1.08;
  const X = (i: number, n: number) => 4 + (i / Math.max(1, n - 1)) * Math.max(1, width - 8);
  const Y = (v: number) => H - 6 - (v / top) * (H - 12);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i, arr.length).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const offs = normal ? cur.map((v, i) => (normal[i] > 0 ? Math.round(((v - normal[i]) / normal[i]) * 100) : 0)) : [];
  const hi = offs.length ? offs.indexOf(Math.max(...offs)) : -1;
  const lo = offs.length ? offs.indexOf(Math.min(...offs)) : -1;
  const parts: string[] = [];
  if (hi >= 0 && offs[hi] > 8) parts.push(`${dayLong(a.series[hi].start)}: ${offs[hi]} % más de lo normal`);
  if (lo >= 0 && offs[lo] < -8) parts.push(`${dayLong(a.series[lo].start)}: ${-offs[lo]} % menos`);
  return (
    <SystemSection title="Cómo van las ventas">
      <View style={styles.card}>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel={`Ventas: ${formatPesos(a.current.sales_total)}. Periodo anterior: ${formatPesos(a.previous.sales_total)}.`} style={{ height: H }}>
          {width > 0 ? (
            <Svg width={width} height={H}>
              {prev.length > 1 ? <Path d={line(prev)} fill="none" stroke={colors.placeholder} strokeWidth={1.6} strokeDasharray="4 5" /> : null}
              <Path d={line(cur)} fill="none" stroke={colors.ink} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
          ) : null}
        </View>
        <View style={styles.trendLegend}>
          <Text style={styles.meta}>— Este periodo</Text>
          {prev.length > 1 ? <Text style={styles.meta}>- - El anterior</Text> : null}
        </View>
        {parts.length ? <Text style={styles.cardTitle}>{parts.join(' · ')}</Text> : null}
      </View>
    </SystemSection>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {note ? <Text style={styles.meta}>{note}</Text> : null}
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

function Summary({ a, entityId, range, firstDays, onDetail }: { a: Analytics; entityId: string; range: DateRange; firstDays: boolean; onDetail: (t: 'products' | 'inventory') => void }) {
  const router = useRouter();
  const outbox = useLedgerOutbox();
  const c = a.current;
  const p = a.previous;
  // Lo que aún no sale del teléfono cuenta igual que en Hoy, si el rango llega hasta hoy.
  const pending = range.to >= todayCO() ? pendingTotals(outbox.items, entityId) : { sales: 0, expenses: 0 };
  const sold = c.sales_total + pending.sales;
  const spent = c.expenses_total + pending.expenses;
  const profit = leftOf(c) + (range.to >= todayCO() ? pending.sales - pendingCredit(outbox.items, entityId) - pending.expenses : 0);
  const m = marginPct(c);
  const best = bestSlot(a.heat);
  const delta = deltaWords(profit, leftOf(p));
  const cats = Object.entries(c.expenses_by_category).sort(([, x], [, y]) => y - x);
  const source = c.by_source;
  const sourceTotal = source ? source.manual + source.offers + source.agenda : 0;
  const pays = ([['cash', METHOD_LABEL.cash], ['transfer', METHOD_LABEL.transfer], ['card', METHOD_LABEL.card], ['credit', 'Fiado']] as const).map(([k, label]) => ({ label, value: c.by_method[k] })).filter((x) => x.value > 0);
  const payTotal = pays.reduce((s, x) => s + x.value, 0);
  const ranked = rankProducts(a.products, 'profit');
  const hasCosts = a.products.some((x) => x.profit !== null);
  const topList = (hasCosts ? ranked.filter((x) => x.profit !== null) : rankProducts(a.products, 'revenue')).slice(0, 3);
  const topMax = Math.max(1, ...topList.map((x) => (hasCosts ? x.profit ?? 0 : x.revenue)));
  const low = lowMargin(a.products)[0];
  const inv = a.inventory;
  const goDebts = () => router.push({ pathname: '/business/ledger/debts/[id]', params: { id: entityId } });
  const goCosts = () => router.push({ pathname: '/business/ledger/costs/[id]', params: { id: entityId } });

  // Qué hacer: hasta tres cosas, primero lo que trae plata y luego lo que hace confiables los números.
  const todo: { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; alert?: boolean; onPress: () => void }[] = [
    ...(a.receivable > 0 ? [{ key: 'cobra', icon: 'person-outline' as const, title: 'Cobra lo que te deben', sub: `${formatPesos(a.receivable)}. Cuenta en «Te quedó» cuando te paguen`, alert: true, onPress: goDebts }] : []),
    ...(low ? [{ key: 'precio', icon: 'pricetag-outline' as const, title: `Revisa el precio de ${low.name}`, sub: (low.profit ?? 0) < 0 ? `Perdiste ${formatPesos(-(low.profit ?? 0))} con este producto` : `Te deja ${Math.round(low.margin_pct ?? 0)} % en cada venta`, onPress: () => onDetail('products') }] : []),
    ...(a.uncosted_count > 0 ? [{ key: 'costo', icon: 'create-outline' as const, title: a.uncosted_count === 1 ? 'Ponle costo a 1 producto' : `Ponles costo a ${a.uncosted_count} productos`, sub: `Sin costo, su ganancia no se cuenta (${sold > 0 ? Math.round((a.uncosted_revenue / sold) * 100) : 0} % de tus ventas)`, onPress: goCosts }] : []),
    ...(inv.idle_total > 0 ? [{ key: 'quieta', icon: 'hourglass-outline' as const, title: `Mueve ${formatPesos(inv.idle_total)} quietos`, sub: 'No se venden hace más de 4 semanas', onPress: () => onDetail('inventory') }] : []),
  ].slice(0, 3);

  if (c.sales_count === 0 && c.expenses_total === 0 && pending.sales === 0 && pending.expenses === 0) {
    return <EmptyState icon="bar-chart-outline" title="Sin movimientos en estas fechas" body="Registra ventas y gastos y aquí verás cómo te va. Prueba otras fechas." />;
  }
  return (
    <>
      <View style={styles.main}>
        <View style={styles.mainTop}>
          <View style={styles.heroTop}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.kpiLabel}>{profit >= 0 ? (firstDays ? `Te quedó en ${a.series.filter((x) => x.sales > 0).length === 1 ? '1 día' : `${a.series.filter((x) => x.sales > 0).length} días`}` : 'Te quedó') : 'Salió más de lo que entró'}</Text>
              <Text style={[styles.heroValue, profit < 0 && { color: colors.warning }]} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">
                {formatPesos(Math.abs(profit))}
              </Text>
            </View>
            {delta ? <Text style={styles.delta}>{delta}</Text> : null}
          </View>
          <ProfitBars series={a.series} bucket={a.bucket} />
        </View>
        <View style={styles.mainFoot}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={styles.footHead} numberOfLines={1} adjustsFontSizeToFit>
              Vendiste {formatPesos(sold)}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              Gastaste {formatPesos(spent)}
            </Text>
          </View>
          {a.receivable > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Cobrar ${formatPesos(a.receivable)} que te deben`} onPress={goDebts} style={styles.btnRed}>
              <Text style={styles.btnRedText} numberOfLines={1}>
                Cobrar {formatPesos(a.receivable)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {todo.length > 0 ? (
        <EmpreAICard title="Qué hacer">
          <View>
            {todo.map(({ key, ...t }, i) => (
              <SystemRow key={key} first={i === 0} {...t} />
            ))}
          </View>
        </EmpreAICard>
      ) : null}

      {topList.length > 0 ? (
        <SystemSection title={hasCosts ? 'Lo que más te deja' : 'Lo que más vendes'} link={a.products.length > 3 || low ? 'Ver todos' : undefined} onLink={() => onDetail('products')}>
          <SystemGroup>
            {topList.map((x, i) => (
              <View key={x.ref}>
                <ShareRow first={i === 0} label={x.name} value={formatPesos(hasCosts ? x.profit ?? 0 : x.revenue)} share={((hasCosts ? x.profit ?? 0 : x.revenue) / topMax) * 100} />
                <Text style={[styles.meta, { marginTop: -6, paddingBottom: 8 }]}>{hasCosts ? `Vendiste ${formatPesos(x.revenue)} · te deja ${Math.round(x.margin_pct ?? 0)} %` : `${String(Math.round(x.qty * 10) / 10).replace('.', ',')} und`}</Text>
              </View>
            ))}
          </SystemGroup>
        </SystemSection>
      ) : null}

      {!firstDays ? (
        <>
          <UnderstandWeek a={a} onOffer={() => router.push({ pathname: '/business/offers/new', params: { entityId } })} />
          <View style={[styles.card, styles.stats]}>
            {m !== null ? <Stat label="Margen" value={`${m} %`} note={c.margin_coverage_pct < 100 ? `${c.margin_coverage_pct} % con costo` : undefined} /> : null}
            <Stat label="Por venta" value={formatPesos(c.avg_ticket)} />
            <Stat label="Ventas" value={`${c.sales_count}`} />
          </View>
          <SalesTrend a={a} />
          {c.sales_count >= MIN_FOR_HEAT ? (
            <SystemSection title="Cuándo vendes más">
              <View style={styles.card}>
                {best ? <Text style={styles.cardTitle}>Tu mejor momento: {best}</Text> : null}
                <HeatGrid heat={a.heat} />
              </View>
            </SystemSection>
          ) : null}
          {source && sourceTotal > 0 ? (
            <SystemSection title="De dónde vinieron">
              <SystemGroup>
                <ShareRow first label="Manual" value={formatPesos(source.manual)} share={(source.manual / sourceTotal) * 100} />
                <ShareRow label="Empre Offers" value={formatPesos(source.offers)} share={(source.offers / sourceTotal) * 100} color={colors.accent} />
                <ShareRow label="Agenda" value={formatPesos(source.agenda)} share={(source.agenda / sourceTotal) * 100} />
              </SystemGroup>
            </SystemSection>
          ) : null}
          {cats.length > 0 ? (
            <SystemSection title="En qué gastaste">
              <SystemGroup>
                {cats.slice(0, 4).map(([k, v], i) => (
                  <ShareRow key={k} first={i === 0} label={categoryLabel(k)} value={formatPesos(v)} share={(v / cats[0][1]) * 100} />
                ))}
              </SystemGroup>
            </SystemSection>
          ) : null}
          {pays.length > 0 ? (
            <SystemSection title="Cómo te pagaron">
              <SystemGroup>
                {pays.map((x, i) => (
                  <ShareRow key={x.label} first={i === 0} label={x.label} value={formatPesos(x.value)} share={(x.value / payTotal) * 100} />
                ))}
              </SystemGroup>
            </SystemSection>
          ) : null}
          {inv.value_cost > 0 ? (
            <SystemSection title="Tu mercancía" link="Ver inventario" onLink={() => onDetail('inventory')}>
              <SystemGroup>
                <SystemRow first icon="cube-outline" title={`${formatPesos(inv.value_cost)} en mercancía`} sub={inv.value_price > inv.value_cost ? `Si lo vendes todo, ganarías ${formatPesos(inv.value_price - inv.value_cost)}` : `Con ${inv.valued} de ${inv.products} productos`} onPress={() => onDetail('inventory')} />
                {inv.lost_total > 0 ? <SystemRow icon="alert-circle-outline" title={`Perdiste ${formatPesos(inv.lost_total)}`} sub="Se dañó, venció o se perdió en estas fechas" onPress={() => onDetail('inventory')} /> : null}
              </SystemGroup>
            </SystemSection>
          ) : null}
        </>
      ) : (
        <SystemSection title="Lo que viene">
          <SystemGroup>
            <SystemRow first icon="bar-chart-outline" title="Cómo van tus ventas" sub={`Faltan ${Math.max(1, FIRST_DAYS - a.series.filter((x) => x.sales > 0).length)} días con ventas para comparar`} />
            <SystemRow icon="time-outline" title="Cuándo vendes más" sub="Con más ventas lo sabrás" />
          </SystemGroup>
        </SystemSection>
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
        <View style={styles.callout}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.ink} />
          <Text style={styles.calloutText}>{mismatch}</Text>
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
              <Text style={[styles.lineTag, { color: (p.profit ?? 0) < 0 ? colors.danger : colors.ink }]}>
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
  return (
    <View style={[styles.pRow, rank > 1 && styles.pLine]}>
      <View style={styles.pHead}>
        <Text style={styles.rank}>{rank}</Text>
        <Text style={[styles.lineName, { flex: 1 }]} numberOfLines={1}>
          {p.name}
        </Text>
        <Text style={[styles.lineName, by === 'profit' && (p.profit ?? 0) < 0 && { color: colors.danger }]}>{main === null ? 'Sin costo' : formatPesos(main)}</Text>
      </View>
      <View style={[styles.track, { marginLeft: 30 }]}>
        <View style={[styles.fill, { width: `${Math.max(0, ((main ?? 0) / max) * 100)}%`, backgroundColor: colors.ink }]} />
      </View>
      <View style={[styles.pHead, { marginLeft: 30 }]}>
        <Text style={[styles.meta, { flex: 1 }]}>
          {by === 'profit' ? `Vendiste ${formatPesos(p.revenue)}` : p.profit !== null ? `Te dejó ${formatPesos(p.profit)}` : 'Sin costo'} · {String(Math.round(p.qty * 10) / 10).replace('.', ',')} und
        </Text>
        {p.margin_pct !== null ? (
          <View style={[styles.pill, { backgroundColor: colors.selectedSoft }]}>
            <Text style={[styles.pillText, { color: colors.ink }]}>{Math.round(p.margin_pct)} %</Text>
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
          {r.tone !== 'muted' ? <View style={[styles.dot, { backgroundColor: colors.brand }]} /> : null}
          <Text style={[styles.lineName, { flex: 1 }]} numberOfLines={1}>
            {r.name}
          </Text>
          <Text style={[styles.lineTag, { color: r.tone === 'muted' ? colors.muted : colors.ink }]}>{r.text}</Text>
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
          <Text style={[styles.meta, { color: colors.ink, fontFamily: fonts.ui.bold }]}>
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

      <Card title="Compra pronto" right={inv.soon_count > 0 ? <Text style={[styles.lineTag, { color: colors.ink }]}>{inv.soon_count === 1 ? '1 se acaba' : `${inv.soon_count} se acaban`}</Text> : null}>
        <Lines rows={inv.soon} empty="Nada se está acabando. Bien." onPress={goList} />
        <Pressable accessibilityRole="button" onPress={goList} style={styles.outlineBtn}>
          <Text style={styles.link}>Ver todo en el inventario</Text>
        </Pressable>
      </Card>

      <Card title="Lo que perdiste" right={inv.lost_total > 0 ? <Text style={styles.lineName}>{formatPesos(inv.lost_total)}</Text> : null}>
        <Text style={styles.meta}>Se dañó, venció o se perdió en estas fechas.</Text>
        <Lines rows={inv.lost} empty="No registraste pérdidas en estas fechas." />
      </Card>

      <Card title="Plata quieta" right={inv.idle_total > 0 ? <Text style={styles.lineName}>{formatPesos(inv.idle_total)}</Text> : null}>
        <Text style={styles.meta}>Lo que no se vende hace más de 4 semanas. Una oferta puede moverlo.</Text>
        <Lines rows={inv.idle} empty="Todo lo que cuentas se está moviendo." onPress={goItem} />
        {inv.idle.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/offers/new', params: { entityId } })} style={styles.outlineBtn}>
            <Text style={styles.link}>Crear una oferta</Text>
          </Pressable>
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, gap: 24 },
  top: { gap: 14 },
  detail: { gap: spacing.md },
  periods: { minHeight: 52, flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  period: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  periodOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  periodText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  firstBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  firstText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  meta: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.muted },
  link: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  main: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  mainTop: { gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  mainFoot: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 },
  footHead: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: colors.ink },
  btnRed: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary },
  btnRedText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  heroValue: { fontSize: 34, lineHeight: 38, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  delta: { flexShrink: 1, paddingTop: 4, textAlign: 'right', fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  heroLine: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  pBars: { height: 54, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  pSlot: { flex: 1, height: 54, justifyContent: 'flex-end' },
  pBar: { borderRadius: 4 },
  pLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontFamily: fonts.ui.bold, color: colors.faint },
  stats: { flexDirection: 'row', gap: 12 },
  statValue: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  trendLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpiLabel: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  big: { fontSize: 30, fontFamily: fonts.display.bold, color: colors.ink },
  card: { gap: spacing.sm, padding: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  callout: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  calloutText: { flexShrink: 1, fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.bold, color: colors.ink },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  segText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  segTextOn: { color: colors.ink },
  pRow: { gap: 6, padding: spacing.md },
  pLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  pHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { width: 22, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.selectedSoft },
  fill: { height: 6, borderRadius: 3 },
  pill: { minHeight: 24, paddingHorizontal: 8, borderRadius: radius.pill, justifyContent: 'center' },
  pillText: { fontSize: 12, fontFamily: fonts.ui.extrabold },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 46, borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  lineName: { fontSize: 14.5, fontFamily: fonts.ui.bold, color: colors.ink },
  lineTag: { fontSize: 12.5, fontFamily: fonts.ui.extrabold },
  lineValue: { minWidth: 76, textAlign: 'right', fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4 },
  outlineBtn: { minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  smallBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center' },
  smallBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
