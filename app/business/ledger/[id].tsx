import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type Expense, type Insight, type Sale } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { Delta } from '@/components/finance/Charts';
import { RangeSheet } from '@/components/finance/RangeSheet';
import { Chip, Stat } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { addDays, compareText, deltaLabel, presetRange, rangeTitle, todayCO, type DateRange, type Preset } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL, pendingTotals, salePayText } from '@/lib/ledger';
import { useParkedSales } from '@/ledger/parkedSales';
import { discardLedgerItem, flushLedger, queueVoid, retryLedgerItem, useLedgerOutbox } from '@/ledger/ledgerStore';
import { FEATURES } from '@/config';
import { colors, fonts, radius, spacing } from '@/theme';

// Los atajos de siempre; cualquier otro rango sale de «Fechas».
const QUICK: { key: Exclude<Preset, 'custom' | 'yesterday' | '30d' | 'year'>; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'lastMonth', label: 'Mes pasado' },
];

/** Inicio del día en Colombia, como fecha-hora para filtrar ventas y gastos. */
const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;

/** Avisos que tienen que ver con plata: pérdidas, plata quieta, márgenes bajos y cuentas sin cobrar. */
const MONEY_INSIGHTS = ['loss', 'idle', 'margin', 'tabs'];

interface Movement {
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

function saleMovement(s: Sale): Movement {
  const what = s.lines?.length ? s.lines.map((l) => (l.qty === 1 ? l.name : `${l.qty} × ${l.name}`)).join(', ') : s.note || 'Venta';
  return { key: `s${s.id}`, kind: 'sale', id: s.id, at: s.occurred_at, amount: s.total, title: what, sub: `${salePayText({ ...s, partyName: s.party?.name })}${s.source === 'voice' ? ' · por voz' : ''}`, voided: s.status === 'voided', pending: false };
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
  const outbox = useLedgerOutbox();
  const includesToday = range.to >= today;
  // Lo que aún no sale del teléfono cuenta solo si el rango llega hasta hoy.
  const pendingAll = pendingTotals(outbox.items, entityId);
  const pending = includesToday ? pendingAll : { sales: 0, expenses: 0 };

  const parked = useParkedSales(entityId);
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
      <SubScreenHeader title="Finanzas" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {QUICK.map((p) => (
            <Chip key={p.key} label={p.label} selected={range.preset === p.key} onPress={() => setRange(presetRange(p.key, todayCO()))} />
          ))}
          <Chip label={range.preset === 'custom' ? rangeTitle(range) : 'Fechas'} icon="calendar-outline" selected={!QUICK.some((p) => p.key === range.preset)} onPress={() => setRangeOpen(true)} />
        </ScrollView>
        <Text style={styles.compare}>
          {rangeTitle(range)}
          {sum ? ` · ${compareText(sum)}` : ''}
        </Text>

        {outbox.items.some((x) => x.entityId === entityId) ? <OutboxBanner entityId={entityId} /> : null}

        {summary.isLoading ? (
          <ActivityIndicator style={{ marginVertical: spacing.xl }} color={colors.primary} />
        ) : summary.isError && !sum ? (
          <EmptyState icon="cloud-offline-outline" title="No pudimos cargar el resumen" body="Sin conexión puedes seguir registrando ventas y gastos: se envían solos cuando vuelva la señal." action={{ title: 'Reintentar', onPress: onRefresh }} />
        ) : (
          <View style={styles.card}>
            {sum ? <Text style={styles.daySentence}>{daySentence(range.preset === 'today', salesTotal, profit, sum.current.sales_count)}</Text> : null}
            <Text style={styles.heroLabel}>{profit >= 0 ? 'TE QUEDÓ' : 'PERDISTE'}</Text>
            <View style={styles.kpiTop}>
              <Text style={[styles.heroValue, profit < 0 && { color: colors.danger }]} accessibilityLiveRegion="polite">
                {formatPesos(Math.abs(profit))}
              </Text>
              {sum ? <Delta d={deltaLabel(profit, sum.previous.profit)} /> : null}
            </View>
            <View style={styles.statRow}>
              <View style={{ flex: 1 }}>
                <Stat title="Vendiste" value={salesTotal} />
                {sum ? <Delta d={deltaLabel(salesTotal, sum.previous.sales_total)} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Stat title="Gastaste" value={expensesTotal} />
                {sum ? <Delta d={deltaLabel(expensesTotal, sum.previous.expenses_total, true)} worseIsWarn /> : null}
              </View>
            </View>
            {source && sourceTotal > 0 ? (
              <View style={{ gap: 6, marginTop: spacing.xs }} accessible accessibilityLabel={sourceText}>
                <View style={styles.splitBar}>
                  {source.manual > 0 ? <View style={{ flex: source.manual, backgroundColor: colors.ink }} /> : null}
                  {source.offers > 0 ? <View style={{ flex: source.offers, backgroundColor: colors.accent }} /> : null}
                  {source.agenda > 0 ? <View style={{ flex: source.agenda, backgroundColor: colors.verified }} /> : null}
                </View>
                <Text style={styles.compare}>{sourceText}</Text>
              </View>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/ledger/cash/[id]', params: { id: entityId } })} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.85 }]}>
              <Ionicons name="cash-outline" size={18} color={colors.ink} />
              <Text style={styles.closeText}>Cerrar caja de hoy</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.zone}>REGISTRAR</Text>
        <View style={styles.actions}>
          <ActionButton icon="add-circle" label="Venta" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } })} tone="primary" />
          <ActionButton icon="remove-circle" label="Gasto" onPress={() => router.push({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } })} tone="accent" />
        </View>

        <Text style={styles.zoneSub}>OTRAS FORMAS DE VENDER</Text>
        <View style={styles.group}>
          {quick ? <GroupRow icon="flash-outline" title="Modo mostrador" meta="Para cuando hay fila: un toque, una venta" onPress={() => router.push({ pathname: '/business/ledger/quick/[id]', params: { id: entityId } })} /> : null}
          {quick && FEATURES.tabs ? <GroupRow icon="restaurant-outline" title="Mesas y cuentas" meta="El cliente va pidiendo y paga al final" onPress={goTabs} /> : null}
          <GroupRow icon="person-outline" title="Fiado" meta="Lo paga después; queda en «Te deben»" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId, fiado: '1' } })} />
          {parked.length > 0 ? <GroupRow icon="time-outline" title={parked.length === 1 ? '1 venta en espera' : `${parked.length} ventas en espera`} meta="No cuentan en la caja hasta que las cobres" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } })} /> : null}
        </View>

        <Text style={styles.zone}>PENDIENTES</Text>
        {sum && (sum.receivable > 0 || sum.payable > 0) || stockAlerts.length > 0 ? (
          <View style={styles.group}>
            {sum && sum.receivable > 0 ? <GroupRow icon="person-outline" title="Te deben" meta="Toca para ver quién y recordarles" amount={formatPesos(sum.receivable)} onPress={goDebts} /> : null}
            {sum && sum.payable > 0 ? <GroupRow icon="car-outline" title="Debes" meta="A tus proveedores" amount={formatPesos(sum.payable)} onPress={goDebts} /> : null}
            {stockAlerts.slice(0, 2).map((a) => (
              <GroupRow key={`${a.kind}-${a.ref ?? a.title}`} icon="cube-outline" title="Se acaba" meta={a.title} onPress={() => goAnalyticsTab('inventory')} />
            ))}
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={goDebts} style={styles.allClear}>
            <Text style={styles.compare}>Nada espera por ti. Ver fiados</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        )}

        {moneyInsights.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>Para que no se te pase</Text>
            {moneyInsights.slice(0, 3).map((i) => (
              <InsightCard key={`${i.kind}-${i.ref ?? i.title}`} insight={i} onPress={() => openInsight(i)} />
            ))}
          </View>
        ) : null}

        <Text style={styles.zone}>ENTENDER</Text>
        {bars.length > 1 ? (
          <View style={styles.card} accessible accessibilityLabel={`Ventas y gastos de ${rangeTitle(range)}`}>
            <View style={styles.legend}>
              <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
              <Text style={styles.compare}>Ventas</Text>
              <View style={[styles.legendDot, { backgroundColor: '#8796AB' }]} />
              <Text style={styles.compare}>Gastos</Text>
            </View>
            <View style={styles.bars}>
              {bars.map((b) => (
                <View key={b.start} style={styles.barCol}>
                  <View style={styles.barPair}>
                    <View style={[styles.bar, { height: Math.max(2, (b.sales / barTop) * 84), backgroundColor: colors.brand }]} />
                    <View style={[styles.bar, { height: Math.max(2, (b.expenses / barTop) * 84), backgroundColor: '#8796AB' }]} />
                  </View>
                  <Text style={styles.barLabel}>{Number(b.start.slice(8, 10))}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.group}>
          <GroupRow icon="bar-chart-outline" title="Ver análisis del negocio" meta="Márgenes, productos y días que más venden" onPress={goAnalytics} />
          {sum && sum.inventory.value_cost > 0 ? (
            <GroupRow
              icon="cube-outline"
              title={`${formatPesos(sum.inventory.value_cost)} en mercancía`}
              meta={[sum.inventory.lost_total > 0 ? `Perdiste ${formatPesos(sum.inventory.lost_total)}` : null, sum.inventory.idle_total > 0 ? `Quieta ${formatPesos(sum.inventory.idle_total)}` : null].filter(Boolean).join(' · ') || 'Tu inventario en plata'}
              onPress={() => goAnalyticsTab('inventory')}
            />
          ) : null}
          <GroupRow icon="pricetags-outline" title="Costo de tus productos" meta="Para saber cuánto ganas en cada venta" onPress={() => router.push({ pathname: '/business/ledger/costs/[id]', params: { id: entityId } })} />
        </View>

        <Text style={styles.sectionTitle}>{range.preset === 'today' ? 'Movimientos de hoy' : 'Movimientos'}</Text>
        {movements.length === 0 && !sales.isLoading ? (
          <EmptyState icon="receipt-outline" title="Aún no hay movimientos" body="Registra tu primera venta con el botón «Vender» o dictándola con el micrófono." />
        ) : (
          movements.map((m) => (
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

      <Pressable accessibilityRole="button" accessibilityLabel="Dictar una venta o un gasto" onPress={() => setVoiceOpen(true)} style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}>
        <Ionicons name="mic" size={26} color="#fff" />
        <Text style={styles.fabText}>Dictar</Text>
      </Pressable>

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
      <Ionicons name={icon} size={26} color={tone === 'primary' ? '#fff' : colors.ink} />
      <Text style={[styles.actionText, tone !== 'primary' && { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

function GroupRow({ icon, title, meta, amount, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; meta: string; amount?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, amount, meta].filter(Boolean).join('. ')} onPress={onPress} style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.85 }]}>
      <View style={styles.groupIcon}>
        <Ionicons name={icon} size={18} color={colors.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.linkMeta}>{meta}</Text>
      </View>
      {amount ? <Text style={styles.groupAmount}>{amount}</Text> : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
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
  heroLabel: { fontSize: 11.5, letterSpacing: 0.8, fontFamily: fonts.ui.extrabold, color: colors.muted },
  heroValue: { flex: 1, fontSize: 36, lineHeight: 42, fontFamily: fonts.display.bold, color: colors.ink },
  splitBar: { flexDirection: 'row', height: 8, gap: 2, borderRadius: 4, overflow: 'hidden' },
  closeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 46, marginTop: spacing.xs, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  closeText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  zone: { marginTop: spacing.sm, fontSize: 12, letterSpacing: 1, fontFamily: fonts.ui.extrabold, color: colors.muted },
  zoneSub: { fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.ui.bold, color: colors.muted },
  group: { borderRadius: radius.md, overflow: 'hidden', gap: 1, backgroundColor: colors.line, borderWidth: 1, borderColor: colors.line },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 62, padding: spacing.md, backgroundColor: colors.surface },
  groupIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  groupAmount: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  allClear: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 3, marginLeft: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 108 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 7, borderRadius: 3 },
  barLabel: { fontSize: 11, fontFamily: fonts.ui.semibold, color: colors.muted },
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  kpiTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  analyticsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 46, borderRadius: radius.md, backgroundColor: colors.primarySoft, marginTop: spacing.xs },
  analyticsText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  daySentence: { fontSize: 15, lineHeight: 21, fontFamily: fonts.ui.bold, color: colors.ink, marginBottom: spacing.sm },
  compare: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  statRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  method: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  margin: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.verified },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1, minHeight: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm },
  actionPrimary: { backgroundColor: colors.primary },
  actionAccent: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  actionText: { fontSize: 18, fontFamily: fonts.display.bold, color: '#fff' },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  linkIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  insight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4 },
  linkTitle: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  linkMeta: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  sectionTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topName: { flex: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  topQty: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  topValue: { minWidth: 80, textAlign: 'right', fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  move: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  moveIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  moveTitle: { fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  moveSub: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  moveAmount: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.accentInk },
  bannerLink: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primary },
  fab: { position: 'absolute', right: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.verified, paddingHorizontal: spacing.lg, height: 56, borderRadius: 28, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  fabText: { fontSize: 16, fontFamily: fonts.display.bold, color: '#fff' },
});
