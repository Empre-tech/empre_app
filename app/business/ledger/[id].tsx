import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type Expense, type Insight, type Sale } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { Delta, Sparkline } from '@/components/finance/Charts';
import { RangeSheet } from '@/components/finance/RangeSheet';
import { Chip, Stat } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { addDays, compareText, deltaLabel, presetRange, rangeTitle, todayCO, type DateRange, type Preset } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL, pendingTotals } from '@/lib/ledger';
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

function timeOf(iso: string, withDay = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const t = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return withDay ? `${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} ${t}` : t;
}

function saleMovement(s: Sale): Movement {
  const what = s.lines?.length ? s.lines.map((l) => (l.qty === 1 ? l.name : `${l.qty} × ${l.name}`)).join(', ') : s.note || 'Venta';
  const who = s.method === 'credit' && s.party ? ` · ${s.party.name}` : '';
  return { key: `s${s.id}`, kind: 'sale', id: s.id, at: s.occurred_at, amount: s.total, title: what, sub: `${METHOD_LABEL[s.method]}${who}${s.source === 'voice' ? ' · por voz' : ''}`, voided: s.status === 'voided', pending: false };
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
  const goTabs = () => router.push({ pathname: '/business/ledger/tabs/[id]', params: { id: entityId } });

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
        const p = x.payload as { total?: number; amount?: number; note?: string; method: Sale['method']; category?: string };
        return { key: `q${x.id}`, kind: x.kind as 'sale' | 'expense', id: x.id, at: new Date(x.createdAt).toISOString(), amount: Number(p.total ?? p.amount ?? 0), title: p.note || (x.kind === 'sale' ? 'Venta' : categoryLabel(p.category ?? 'otro')), sub: METHOD_LABEL[p.method] ?? '', voided: false, pending: true };
      });
    return [...queued, ...sent].sort((a, b) => b.at.localeCompare(a.at));
  }, [sales.data, expenses.data, outbox.items, entityId, includesToday]);

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
      <SubScreenHeader title="Ventas y gastos" />
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
            <View style={styles.kpiTop}>
              <View style={{ flex: 1 }}>
                <Stat title="Vendiste" value={salesTotal} big />
              </View>
              {sum ? <Delta d={deltaLabel(salesTotal, sum.previous.sales_total)} /> : null}
            </View>
            {sum && sum.series.length > 1 && sum.current.sales_total > 0 ? <Sparkline values={sum.series.map((p) => p.sales)} /> : null}
            {sum && sum.current.sales_count > 0 ? (
              <Text style={styles.compare}>
                {sum.current.sales_count} {sum.current.sales_count === 1 ? 'venta' : 'ventas'} · ticket promedio {formatPesos(sum.current.avg_ticket)}
              </Text>
            ) : null}
            <View style={styles.statRow}>
              <View style={{ flex: 1 }}>
                <Stat title="Gastaste" value={expensesTotal} />
                {sum ? <Delta d={deltaLabel(expensesTotal, sum.previous.expenses_total, true)} worseIsWarn /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Stat title={profit >= 0 ? 'Te quedó' : 'Perdiste'} value={Math.abs(profit)} tone={profit >= 0 ? 'good' : 'bad'} />
                {sum ? <Delta d={deltaLabel(profit, sum.previous.profit)} /> : null}
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={goAnalytics} style={({ pressed }) => [styles.analyticsBtn, pressed && { opacity: 0.85 }]}>
              <Ionicons name="bar-chart-outline" size={18} color={colors.primary} />
              <Text style={styles.analyticsText}>Ver análisis del negocio</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.actions}>
          <ActionButton icon="add-circle" label="Vender" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } })} tone="primary" />
          <ActionButton icon="remove-circle" label="Gastar" onPress={() => router.push({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } })} tone="accent" />
        </View>

        {quick ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/ledger/quick/[id]', params: { id: entityId } })} style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.85 }]}>
            <View style={styles.linkIcon}>
              <Ionicons name="flash-outline" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>Atención rápida</Text>
              <Text style={styles.linkMeta}>Toca los platos del pedido y cobra en un paso</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
        {quick && FEATURES.tabs ? (
          <Pressable accessibilityRole="button" onPress={goTabs} style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.85 }]}>
            <View style={styles.linkIcon}>
              <Ionicons name="restaurant-outline" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>Mesas</Text>
              <Text style={styles.linkMeta}>Lo que va pidiendo cada mesa; se cobra al final</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ) : null}

        {moneyInsights.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>Para que no se te pase</Text>
            {moneyInsights.slice(0, 3).map((i) => (
              <InsightCard key={`${i.kind}-${i.ref ?? i.title}`} insight={i} onPress={() => openInsight(i)} />
            ))}
          </View>
        ) : null}

        {sum && sum.inventory.value_cost > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => goAnalyticsTab('inventory')} style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.85 }]}>
            <View style={styles.linkIcon}>
              <Ionicons name="cube-outline" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>{formatPesos(sum.inventory.value_cost)} en mercancía</Text>
              <Text style={styles.linkMeta}>
                {[
                  sum.inventory.lost_total > 0 ? `Perdiste ${formatPesos(sum.inventory.lost_total)}` : null,
                  sum.inventory.idle_total > 0 ? `Quieta ${formatPesos(sum.inventory.idle_total)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Tu inventario en plata'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ) : null}

        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/ledger/debts/[id]', params: { id: entityId } })} style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.85 }]}>
          <View style={styles.linkIcon}>
            <Ionicons name="people-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Fiados</Text>
            <Text style={styles.linkMeta}>
              {sum ? `Te deben ${formatPesos(sum.receivable)}${sum.payable > 0 ? ` · Debes ${formatPesos(sum.payable)}` : ''}` : 'Quién te debe y a quién le debes'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/ledger/costs/[id]', params: { id: entityId } })} style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.85 }]}>
          <View style={styles.linkIcon}>
            <Ionicons name="pricetags-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Costo de tus productos</Text>
            <Text style={styles.linkMeta}>Para saber cuánto ganas en cada venta</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <Text style={styles.sectionTitle}>{range.preset === 'today' ? 'Movimientos de hoy' : 'Movimientos'}</Text>
        {movements.length === 0 && !sales.isLoading ? (
          <EmptyState icon="receipt-outline" title="Aún no hay movimientos" body="Registra tu primera venta con el botón «Vender» o dictándola con el micrófono." />
        ) : (
          movements.map((m) => (
            <Pressable key={m.key} accessibilityRole="button" accessibilityLabel={`${m.kind === 'sale' ? 'Venta' : 'Gasto'} de ${formatPesos(m.amount)}, ${m.title}${m.voided ? ', anulada' : ''}. Toca para anular`} onPress={() => (m.pending ? undefined : askVoid(m))} style={styles.move}>
              <View style={[styles.moveIcon, { backgroundColor: m.kind === 'sale' ? colors.primarySoft : colors.accentSoft }]}>
                <Ionicons name={m.kind === 'sale' ? 'arrow-up' : 'arrow-down'} size={16} color={m.kind === 'sale' ? colors.primary : colors.accentInk} />
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
              <Text style={[styles.moveAmount, m.voided && styles.struck, m.kind === 'expense' && { color: colors.accentInk }]}>
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
      <Ionicons name={icon} size={26} color="#fff" />
      <Text style={styles.actionText}>{label}</Text>
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
  body: { padding: spacing.lg, gap: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  kpiTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  analyticsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 46, borderRadius: radius.md, backgroundColor: colors.primarySoft, marginTop: spacing.xs },
  analyticsText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  compare: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  statRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  method: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  margin: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.verified },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1, minHeight: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm },
  actionPrimary: { backgroundColor: colors.primary },
  actionAccent: { backgroundColor: colors.accent },
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
