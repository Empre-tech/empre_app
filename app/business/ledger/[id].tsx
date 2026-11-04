import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type Expense, type Insight, type Sale } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { Delta } from '@/components/finance/Charts';
import { RangeSheet } from '@/components/finance/RangeSheet';
import { Chip } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { addDays, compareText, deltaLabel, presetRange, rangeTitle, todayCO, type DateRange, type Preset } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL, pendingTotals, salePayText } from '@/lib/ledger';
import { useParkedSales } from '@/ledger/parkedSales';
import { discardLedgerItem, flushLedger, queueVoid, retryLedgerItem, useLedgerOutbox } from '@/ledger/ledgerStore';
import { FEATURES } from '@/config';
import { colors, fonts, softShadow, spacing } from '@/theme';

// Los tres de siempre; cualquier otro rango sale de «Fechas».
const PERIODS: { key: Exclude<Preset, 'custom' | 'yesterday' | '30d' | 'year' | 'lastMonth'>; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: 'Semana' },
  { key: 'month', label: 'Mes' },
];

/** Inicio del día en Colombia, como fecha-hora para filtrar ventas y gastos. */
const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;

/** Avisos que tienen que ver con plata: pérdidas, plata quieta, márgenes bajos y cuentas sin cobrar. */
const MONEY_INSIGHTS = ['loss', 'idle', 'margin', 'tabs'];

interface Movement {
  origin?: 'manual' | 'offers' | 'agenda';
  key: string;
  kind: 'sale' | 'expense';
  id: string;
  at: string;
  amount: number;
  title: string;
  sub: string;
  voided: boolean;
  pending: boolean;
}

/** El periodo en una frase, armada con los números: sin modelo y sin inventar causas. */
function daySentence(isToday: boolean, sold: number, left: number, count: number): string {
  const when = isToday ? 'Hoy' : 'En estas fechas';
  if (sold === 0) return isToday ? 'Hoy todavía no registras ventas.' : 'En estas fechas no hay ventas registradas.';
  const sales = count === 1 ? '1 venta' : `${count} ventas`;
  return left >= 0 ? `${when} vendiste ${formatPesos(sold)} en ${sales} y te quedaron ${formatPesos(left)}.` : `${when} vendiste ${formatPesos(sold)} en ${sales}, pero gastaste ${formatPesos(-left)} más de lo que vendiste.`;
}

function timeOf(iso: string, withDay = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const t = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return withDay ? `${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} ${t}` : t;
}

const ORIGINS: { key: 'all' | 'manual' | 'offers' | 'agenda'; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'manual', label: 'Manual' },
  { key: 'offers', label: 'Empre Offers' },
  { key: 'agenda', label: 'Agenda' },
];
const originOf = (source: Sale['source']): 'manual' | 'offers' | 'agenda' => (source === 'offer_claim' ? 'offers' : source === 'appointment' ? 'agenda' : 'manual');

function saleMovement(s: Sale): Movement {
  const what = s.lines?.length ? s.lines.map((l) => (l.qty === 1 ? l.name : `${l.qty} × ${l.name}`)).join(', ') : s.note || 'Venta';
  return { key: `s${s.id}`, kind: 'sale', id: s.id, at: s.occurred_at, amount: s.total, title: what, origin: originOf(s.source), sub: `${originOf(s.source) === 'offers' ? 'Empre Offers · ' : originOf(s.source) === 'agenda' ? 'Agenda · ' : ''}${salePayText({ ...s, partyName: s.party?.name })}${s.source === 'voice' ? ' · por voz' : ''}`, voided: s.status === 'voided', pending: false };
}

function expenseMovement(e: Expense): Movement {
  return { key: `e${e.id}`, kind: 'expense', id: e.id, at: e.occurred_at, amount: e.amount, title: e.note || categoryLabel(e.category), sub: `${categoryLabel(e.category)} · ${e.method === 'credit' ? 'A crédito' : METHOD_LABEL[e.method]}${e.party ? ` · ${e.party.name}` : ''}`, voided: e.status === 'voided', pending: false };
}

/** «Ventas y gastos» (dentro de Mi negocio): cómo va el día (y la semana y el mes), con los dos botones de siempre: vender y gastar. */
export default function LedgerHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = todayCO();
  const [range, setRange] = useState<DateRange>(() => presetRange('today', today));
  const [rangeOpen, setRangeOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [origin, setOrigin] = useState<'all' | 'manual' | 'offers' | 'agenda'>('all');
  const outbox = useLedgerOutbox();
  const includesToday = range.to >= today;
  // Lo que aún no sale del teléfono cuenta solo si el rango llega hasta hoy.
  const pendingAll = pendingTotals(outbox.items, entityId);
  const pending = includesToday ? pendingAll : { sales: 0, expenses: 0 };

  const parked = useParkedSales(entityId);
  const entity = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const summary = useQuery({
    queryKey: ['ledger', entityId, 'analytics', range.from, range.to, range.compare],
    queryFn: () => ledgerApi.analytics(entityId, { from: range.from, to: range.to, compare: range.compare }),
    enabled: Boolean(entityId),
    staleTime: 15_000,
  });
  const span = { from: startCO(range.from), to: startCO(addDays(range.to, 1)) };
  const sales = useQuery({ queryKey: ['ledger', entityId, 'sales', range.from, range.to], queryFn: () => ledgerApi.sales(entityId, { ...span, limit: 100 }), enabled: Boolean(entityId) });
  const expenses = useQuery({ queryKey: ['ledger', entityId, 'expenses', range.from, range.to], queryFn: () => ledgerApi.expenses(entityId, { ...span, limit: 100 }), enabled: Boolean(entityId) });
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });

  // Inventario y avisos: si el negocio no los usa, simplemente no se muestran (nada es obligatorio).
  const insights = useQuery({ queryKey: ['ledger', entityId, 'insights'], queryFn: () => ledgerApi.insights(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const inventory = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const quick = inventory.data?.quick_sale === true;
  // Aquí solo van los avisos que son plata; los de existencias (se acaba, sin inventario) viven en Productos e inventario.
  const moneyInsights = (insights.data ?? []).filter((i) => MONEY_INSIGHTS.includes(i.kind));
  const stockAlerts = (insights.data ?? []).filter((i) => i.kind === 'soon' || i.kind === 'out' || i.kind === 'low');
  const goTabs = () => router.push({ pathname: '/business/ledger/tabs/[id]', params: { id: entityId } });
  const goDebts = () => router.push({ pathname: '/business/ledger/debts/[id]', params: { id: entityId } });

  const sum = summary.data;
  const multiDay = range.from !== range.to;
  const goAnalyticsTab = (tab?: 'inventory' | 'products') =>
    router.push({ pathname: '/business/ledger/analytics/[id]', params: { id: entityId, from: range.from, to: range.to, compare: range.compare, preset: range.preset, ...(tab ? { tab } : {}) } });
  const goAnalytics = () => goAnalyticsTab();
  const openInsight = (i: Insight) => {
    if (i.kind === 'tabs') return goTabs();
    if (i.kind === 'margin' && i.ref) return router.push({ pathname: '/business/products/item', params: { entityId, itemId: i.ref } });
    goAnalyticsTab('inventory');
  };

  const movements = useMemo<Movement[]>(() => {
    const sent = [...(sales.data ?? []).map(saleMovement), ...(expenses.data ?? []).map(expenseMovement)];
    // Lo que aún no salió del teléfono se muestra también, marcado «sin enviar».
    const queued: Movement[] = outbox.items
      .filter((x) => includesToday && x.entityId === entityId && x.status === 'pending' && (x.kind === 'sale' || x.kind === 'expense'))
      .filter((x) => !sent.some((m) => m.id === x.id))
      .map((x) => {
        const p = x.payload as { total?: number; amount?: number; note?: string; method: Sale['method']; method2?: Sale['method']; amount2?: number; category?: string };
        return { key: `q${x.id}`, kind: x.kind as 'sale' | 'expense', id: x.id, at: new Date(x.createdAt).toISOString(), amount: Number(p.total ?? p.amount ?? 0), title: p.note || (x.kind === 'sale' ? 'Venta' : categoryLabel(p.category ?? 'otro')), sub: salePayText({ total: Number(p.total ?? p.amount ?? 0), method: p.method, method2: p.method2, amount2: p.amount2 }) ?? '', voided: false, pending: true };
      });
    return [...queued, ...sent].sort((a, b) => b.at.localeCompare(a.at));
  }, [sales.data, expenses.data, outbox.items, entityId, includesToday]);

  const source = sum?.current.by_source;
  const sourceTotal = source ? source.manual + source.offers + source.agenda : 0;
  const sourceText = source
    ? [source.manual > 0 ? `Manual ${formatPesos(source.manual)}` : null, source.offers > 0 ? `Empre Offers ${formatPesos(source.offers)}` : null, source.agenda > 0 ? `Agenda ${formatPesos(source.agenda)}` : null].filter(Boolean).join(' · ')
    : '';
  const bars = (sum?.series ?? []).slice(-12);
  const barTop = Math.max(1, ...bars.map((b) => Math.max(b.sales, b.expenses)));
  const salesTotal = (sum?.current.sales_total ?? 0) + pending.sales;
  const expensesTotal = (sum?.current.expenses_total ?? 0) + pending.expenses;
  const profit = salesTotal - expensesTotal;

  const askVoid = (m: Movement) => {
    if (m.voided) return;
    Alert.alert(m.kind === 'sale' ? 'Anular esta venta' : 'Anular este gasto', `${m.title} · ${formatPesos(m.amount)}\n\nNo se borra: queda marcada como anulada y deja de contar.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Anular', style: 'destructive', onPress: () => queueVoid(m.kind, entityId, m.id, 'Anulada por el dueño') },
    ]);
  };

  const refreshing = summary.isRefetching || sales.isRefetching;
  const onRefresh = () => {
    void flushLedger();
    void summary.refetch();
    void sales.refetch();
    void expenses.refetch();
  };

  const hints = (items.data ?? []).map((i) => i.name);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 100 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <EmpreSymbol product="finance" size={32} />
          <View style={styles.headText}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              EMPRE FINANCE{entity.data?.name ? ` · ${entity.data.name.toUpperCase()}` : ''}
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              Finanzas
            </Text>
          </View>
        </View>

        {outbox.items.some((x) => x.entityId === entityId) ? <OutboxBanner entityId={entityId} /> : null}

        <View style={styles.section}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>{range.preset === 'today' ? `HOY · ${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' }).replace(',', '').toUpperCase()}` : rangeTitle(range).toUpperCase()}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Elegir otras fechas" onPress={() => setRangeOpen(true)} hitSlop={10} style={styles.datesBtn}>
              <Ionicons name="calendar-outline" size={14} color={colors.primaryDark} />
              <Text style={styles.datesText}>Fechas</Text>
            </Pressable>
          </View>
          {summary.isLoading ? (
            <ActivityIndicator style={{ marginVertical: spacing.xl }} color={colors.primary} />
          ) : summary.isError && !sum ? (
            <EmptyState icon="cloud-offline-outline" title="No pudimos cargar el resumen" body="Sin conexión puedes seguir registrando ventas y gastos: se envían solos cuando vuelva la señal." action={{ title: 'Reintentar', onPress: onRefresh }} />
          ) : (
            <View style={styles.card}>
              {sum ? (
                <View style={styles.sentenceBox}>
                  <EmpreSymbol product="finance" size={26} />
                  <View style={styles.sentenceText}>
                    <Text style={styles.sentence}>{daySentence(range.preset === 'today', salesTotal, profit, sum.current.sales_count)}</Text>
                    <Text style={styles.sentenceFrom}>EMPRE AI · con tus ventas registradas</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.segment} accessibilityRole="tablist">
                {PERIODS.map((o) => {
                  const on = range.preset === o.key;
                  return (
                    <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setRange(presetRange(o.key, todayCO()))} style={[styles.segmentItem, on && styles.segmentOn]}>
                      <Text style={styles.segmentText}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.heroRow}>
                <View style={styles.heroLeft}>
                  <Text style={styles.eyebrow}>{profit >= 0 ? 'TE QUEDÓ' : 'PERDISTE'}</Text>
                  <Text style={[styles.heroValue, profit < 0 && { color: colors.danger }]} accessibilityLiveRegion="polite">
                    {formatPesos(Math.abs(profit))}
                  </Text>
                </View>
                {sum ? <Delta d={deltaLabel(profit, sum.previous.profit)} /> : null}
              </View>
              {sum ? <Text style={styles.compare}>{compareText(sum)}</Text> : null}
              <View style={styles.stats}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Vendiste</Text>
                  <Text style={styles.statValue}>{formatPesos(salesTotal)}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Gastaste</Text>
                  <Text style={styles.statValue}>{formatPesos(expensesTotal)}</Text>
                </View>
              </View>
              {source && sourceTotal > 0 ? (
                <View style={styles.splitWrap} accessible accessibilityLabel={sourceText}>
                  <View style={styles.splitBar}>
                    {source.manual > 0 ? <View style={{ flex: source.manual, backgroundColor: colors.ink }} /> : null}
                    {source.offers > 0 ? <View style={{ flex: source.offers, backgroundColor: colors.accent }} /> : null}
                    {source.agenda > 0 ? <View style={{ flex: source.agenda, backgroundColor: '#14B8B0' }} /> : null}
                  </View>
                  <Text style={styles.splitText}>{sourceText}</Text>
                </View>
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/ledger/cash/[id]', params: { id: entityId } })} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.85 }]}>
                <Ionicons name="cash-outline" size={18} color={colors.ink} />
                <Text style={styles.closeText}>Cerrar caja de hoy</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.eyebrow}>REGISTRAR</Text>
          <View style={styles.actions}>
            <ActionButton icon="add" label="Venta" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } })} tone="primary" />
            <ActionButton icon="remove" label="Gasto" onPress={() => router.push({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } })} tone="accent" />
          </View>
          <Text style={[styles.eyebrow, { paddingTop: 4 }]}>OTRAS FORMAS DE VENDER</Text>
          <View style={styles.group}>
            {quick ? <GroupRow first icon="flash-outline" title="Modo mostrador" meta="Para cuando hay fila: un toque, una venta" onPress={() => router.push({ pathname: '/business/ledger/quick/[id]', params: { id: entityId } })} /> : null}
            {quick && FEATURES.tabs ? <GroupRow icon="restaurant-outline" title="Mesas y cuentas" meta="El cliente va pidiendo y paga al final" onPress={goTabs} /> : null}
            <GroupRow first={!quick} icon="person-outline" title="Fiado" meta="Lo paga después; queda en «Te deben»" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId, fiado: '1' } })} />
            {parked.length > 0 ? <GroupRow icon="time-outline" title={parked.length === 1 ? '1 venta en espera' : `${parked.length} ventas en espera`} meta="No cuentan en la caja hasta que las cobres" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } })} /> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.eyebrow}>PENDIENTES</Text>
          {sum && (sum.receivable > 0 || sum.payable > 0) || stockAlerts.length > 0 ? (
            <View style={styles.group}>
              {sum && sum.receivable > 0 ? <GroupRow first icon="person-outline" title="Te deben" meta="Toca para ver quién y recordarles" amount={formatPesos(sum.receivable)} onPress={goDebts} /> : null}
              {sum && sum.payable > 0 ? <GroupRow first={!sum.receivable} icon="car-outline" title="Debes" meta="A tus proveedores" amount={formatPesos(sum.payable)} onPress={goDebts} /> : null}
              {stockAlerts.slice(0, 2).map((a, i) => (
                <GroupRow key={`${a.kind}-${a.ref ?? a.title}`} first={i === 0 && !sum?.receivable && !sum?.payable} warn icon="cube-outline" title="Se acaba" meta={a.title} onPress={() => goAnalyticsTab('inventory')} />
              ))}
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={goDebts} style={styles.allClear}>
              <Text style={styles.compare}>Nada espera por ti. Ver fiados</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.placeholder} />
            </Pressable>
          )}
        </View>

        {moneyInsights.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>PARA QUE NO SE TE PASE</Text>
            {moneyInsights.slice(0, 3).map((i) => (
              <InsightCard key={`${i.kind}-${i.ref ?? i.title}`} insight={i} onPress={() => openInsight(i)} />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.eyebrow}>ENTENDER</Text>
          <View style={styles.card} accessible={bars.length > 1} accessibilityLabel={`Ventas y gastos de ${rangeTitle(range)}`}>
            {bars.length > 1 ? (
              <>
                <View style={styles.chartHead}>
                  <Text style={styles.eyebrow} numberOfLines={1}>
                    {rangeTitle(range).toUpperCase()}
                  </Text>
                  <View style={styles.legend}>
                    <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
                    <Text style={styles.legendText}>Ventas</Text>
                    <View style={[styles.legendDot, { backgroundColor: colors.line }]} />
                    <Text style={styles.legendText}>Gastos</Text>
                  </View>
                </View>
                <View style={styles.bars}>
                  {bars.map((b) => (
                    <View key={b.start} style={styles.barCol}>
                      <View style={styles.barPair}>
                        <View style={[styles.bar, { height: Math.max(2, (b.sales / barTop) * 100), backgroundColor: colors.brand }]} />
                        <View style={[styles.bar, { height: Math.max(2, (b.expenses / barTop) * 100), backgroundColor: colors.line }]} />
                      </View>
                      <Text style={styles.barLabel}>{Number(b.start.slice(8, 10))}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            <Pressable accessibilityRole="button" onPress={goAnalytics} style={styles.analysisBtn}>
              <Text style={styles.analysisText}>Ver análisis del negocio</Text>
            </Pressable>
          </View>
          <View style={styles.group}>
            {sum && sum.inventory.value_cost > 0 ? (
              <GroupRow
                first
                icon="cube-outline"
                title={`${formatPesos(sum.inventory.value_cost)} en mercancía`}
                meta={[sum.inventory.lost_total > 0 ? `Perdiste ${formatPesos(sum.inventory.lost_total)}` : null, sum.inventory.idle_total > 0 ? `Quieta ${formatPesos(sum.inventory.idle_total)}` : null].filter(Boolean).join(' · ') || 'Tu inventario en plata'}
                onPress={() => goAnalyticsTab('inventory')}
              />
            ) : null}
            <GroupRow first={!(sum && sum.inventory.value_cost > 0)} icon="pricetags-outline" title="Costo de tus productos" meta="Para saber cuánto ganas en cada venta" onPress={() => router.push({ pathname: '/business/ledger/costs/[id]', params: { id: entityId } })} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>{range.preset === 'today' ? 'Movimientos de hoy' : 'Movimientos'}</Text>
        {(sales.data ?? []).some((s) => originOf(s.source) !== 'manual') ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {ORIGINS.map((o) => (
              <Chip key={o.key} label={o.label} selected={origin === o.key} onPress={() => setOrigin(o.key)} />
            ))}
          </ScrollView>
        ) : null}
        {movements.length === 0 && !sales.isLoading ? (
          <EmptyState icon="receipt-outline" title="Aún no hay movimientos" body="Registra tu primera venta con el botón «Vender» o dictándola con el micrófono." />
        ) : (
          movements.filter((m) => origin === 'all' || (m.kind === 'sale' && (m.origin ?? 'manual') === origin)).map((m) => (
            <Pressable key={m.key} accessibilityRole="button" accessibilityLabel={`${m.kind === 'sale' ? 'Venta' : 'Gasto'} de ${formatPesos(m.amount)}, ${m.title}${m.voided ? ', anulada' : ''}. Toca para anular`} onPress={() => (m.pending ? undefined : askVoid(m))} style={styles.move}>
              <View style={[styles.moveIcon, { backgroundColor: m.kind === 'sale' ? colors.primarySoft : colors.selectedSoft }]}>
                <Ionicons name={m.kind === 'sale' ? 'arrow-up' : 'arrow-down'} size={16} color={m.kind === 'sale' ? colors.primary : colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moveTitle, m.voided && styles.struck]} numberOfLines={1}>
                  {m.title}
                </Text>
                <Text style={styles.moveSub} numberOfLines={1}>
                  {timeOf(m.at, multiDay)} · {m.sub}
                  {m.pending ? ' · sin enviar' : ''}
                  {m.voided ? ' · anulada' : ''}
                </Text>
              </View>
              <Text style={[styles.moveAmount, m.voided && styles.struck, m.kind === 'expense' && { color: colors.muted }]}>
                {m.kind === 'expense' ? '−' : ''}
                {formatPesos(m.amount)}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable accessibilityRole="button" onPress={() => setVoiceOpen(true)} style={({ pressed }) => [styles.dictate, pressed && { opacity: 0.85 }]}>
          <Ionicons name="mic-outline" size={20} color={colors.ink} />
          <Text style={styles.dictateText}>Dictar una venta o gasto</Text>
        </Pressable>
      </View>

      <VoiceSheet entityId={entityId} visible={voiceOpen} onClose={() => setVoiceOpen(false)} hints={hints} />
      <RangeSheet visible={rangeOpen} value={range} onApply={setRange} onClose={() => setRangeOpen(false)} />
    </View>
  );
}

const SEVERITY_COLOR: Record<Insight['severity'], string> = { high: colors.danger, medium: '#D98E04', low: colors.primary };

/** Un aviso en palabras sencillas; tocarlo lleva al inventario, donde se resuelve. */
function InsightCard({ insight, onPress }: { insight: Insight; onPress: () => void }) {
  const tone = SEVERITY_COLOR[insight.severity] ?? colors.primary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.insight, { borderLeftColor: tone }, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkTitle}>{insight.title}</Text>
        <Text style={styles.linkMeta}>{insight.body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function ActionButton({ icon, label, onPress, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone: 'primary' | 'accent' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, tone === 'primary' ? styles.actionPrimary : styles.actionAccent, pressed && { opacity: 0.88 }]}>
      <Ionicons name={icon} size={20} color={tone === 'primary' ? '#fff' : colors.ink} />
      <Text style={[styles.actionText, tone !== 'primary' && { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

function GroupRow({ icon, title, meta, amount, onPress, first, warn }: { icon: keyof typeof Ionicons.glyphMap; title: string; meta: string; amount?: string; onPress: () => void; first?: boolean; warn?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, amount, meta].filter(Boolean).join('. ')} onPress={onPress} style={({ pressed }) => [styles.groupRow, !first && styles.groupLine, pressed && { opacity: 0.85 }]}>
      <View style={[styles.groupIcon, warn && { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={18} color={warn ? colors.warning : colors.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={[styles.linkMeta, warn && { color: colors.warning, fontFamily: fonts.ui.bold }]}>{meta}</Text>
      </View>
      {amount ? <Text style={styles.groupAmount}>{amount}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
    </Pressable>
  );
}

/** Registros guardados en el teléfono que aún no llegan al servidor, y los que el servidor rechazó. */
function OutboxBanner({ entityId }: { entityId: string }) {
  const { items, flushing } = useLedgerOutbox();
  const mine = items.filter((x) => x.entityId === entityId);
  const waiting = mine.filter((x) => x.status === 'pending').length;
  const failed = mine.filter((x) => x.status === 'failed');
  if (mine.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {waiting > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => void flushLedger()} style={styles.banner}>
          {flushing ? <ActivityIndicator size="small" color={colors.accentInk} /> : <Ionicons name="cloud-upload-outline" size={18} color={colors.accentInk} />}
          <Text style={styles.bannerText}>
            {waiting === 1 ? '1 registro sin enviar' : `${waiting} registros sin enviar`}. Se envían solos cuando hay señal. Toca para intentar ahora.
          </Text>
        </Pressable>
      ) : null}
      {failed.map((f) => (
        <View key={f.id} style={[styles.banner, { backgroundColor: '#FBE4E4' }]}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={[styles.bannerText, { color: colors.danger }]}>No se pudo enviar un registro: {f.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => retryLedgerItem(f.id)} hitSlop={8}>
            <Text style={styles.bannerLink}>Reintentar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => discardLedgerItem(f.id)} hitSlop={8}>
            <Text style={styles.bannerLink}>Descartar</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 18, gap: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 24, lineHeight: 29, fontFamily: fonts.display.bold, color: colors.ink },
  eyebrow: { flexShrink: 1, fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  datesBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  datesText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  section: { gap: 10 },
  card: { padding: 16, gap: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  sentenceBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.bg },
  sentenceText: { flex: 1, minWidth: 0, gap: 4 },
  sentence: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.bold, color: colors.ink },
  sentenceFrom: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.faint },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: colors.selectedSoft },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  heroLeft: { flexShrink: 1, gap: 4 },
  heroValue: { fontSize: 38, lineHeight: 42, fontFamily: fonts.display.bold, color: colors.verified },
  compare: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  stats: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bg },
  statLabel: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  statValue: { fontSize: 17, fontFamily: fonts.ui.extrabold, color: colors.ink },
  splitWrap: { gap: 8 },
  splitBar: { flexDirection: 'row', height: 8, gap: 2, borderRadius: 4, overflow: 'hidden' },
  splitText: { fontSize: 12, lineHeight: 17, fontFamily: fonts.ui.bold, color: colors.muted },
  closeBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, borderColor: colors.ink },
  closeText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16 },
  actionPrimary: { backgroundColor: colors.primary },
  actionAccent: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  actionText: { fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  group: { paddingVertical: 2, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface },
  groupRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  groupLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  groupIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  groupAmount: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  linkTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  linkMeta: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.faint },
  allClear: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface },
  insight: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderLeftWidth: 4, backgroundColor: colors.surface },
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 3, marginLeft: 6 },
  legendText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  bars: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barCol: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 7, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barLabel: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  analysisBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.bg },
  analysisText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  sectionTitle: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint, textTransform: 'uppercase', marginBottom: -10 },
  move: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -10, padding: 12, borderRadius: 16, backgroundColor: colors.surface },
  moveIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moveTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  moveSub: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.faint },
  moveAmount: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 12, borderRadius: 12, backgroundColor: colors.accentSoft },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.accentInk },
  bannerLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline },
  dictate: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  dictateText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
