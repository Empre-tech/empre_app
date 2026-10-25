import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type Expense, type Period, type Sale } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { Chip, Stat } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { categoryLabel, changeText, formatPesos, METHOD_LABEL, pendingTotals } from '@/lib/ledger';
import { discardLedgerItem, flushLedger, queueVoid, retryLedgerItem, useLedgerOutbox } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

const PERIODS: { key: Period; label: string; versus: string }[] = [
  { key: 'day', label: 'Hoy', versus: 'ayer' },
  { key: 'week', label: 'Esta semana', versus: 'la semana pasada' },
  { key: 'month', label: 'Este mes', versus: 'el mes pasado' },
];

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

function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function saleMovement(s: Sale): Movement {
  const what = s.lines?.length ? s.lines.map((l) => (l.qty === 1 ? l.name : `${l.qty} × ${l.name}`)).join(', ') : s.note || 'Venta';
  const who = s.method === 'credit' && s.party ? ` · ${s.party.name}` : '';
  return { key: `s${s.id}`, kind: 'sale', id: s.id, at: s.occurred_at, amount: s.total, title: what, sub: `${METHOD_LABEL[s.method]}${who}${s.source === 'voice' ? ' · por voz' : ''}`, voided: s.status === 'voided', pending: false };
}

function expenseMovement(e: Expense): Movement {
  return { key: `e${e.id}`, kind: 'expense', id: e.id, at: e.occurred_at, amount: e.amount, title: e.note || categoryLabel(e.category), sub: `${categoryLabel(e.category)} · ${e.method === 'credit' ? 'A crédito' : METHOD_LABEL[e.method]}${e.party ? ` · ${e.party.name}` : ''}`, voided: e.status === 'voided', pending: false };
}

/** «Mi negocio»: cómo va el día (y la semana y el mes), con los dos botones de siempre: vender y gastar. */
export default function LedgerHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('day');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const outbox = useLedgerOutbox();
  const pending = pendingTotals(outbox.items, entityId);

  const summary = useQuery({ queryKey: ['ledger', entityId, 'summary', period], queryFn: () => ledgerApi.summary(entityId, period), enabled: Boolean(entityId), staleTime: 15_000 });
  const range = summary.data ? { from: summary.data.from, to: summary.data.to } : null;
  const sales = useQuery({ queryKey: ['ledger', entityId, 'sales', range?.from], queryFn: () => ledgerApi.sales(entityId, { from: range?.from, to: range?.to, limit: 100 }), enabled: Boolean(range) });
  const expenses = useQuery({ queryKey: ['ledger', entityId, 'expenses', range?.from], queryFn: () => ledgerApi.expenses(entityId, { from: range?.from, to: range?.to, limit: 100 }), enabled: Boolean(range) });
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });

  const sum = summary.data;
  const versus = PERIODS.find((p) => p.key === period)?.versus ?? 'ayer';

  const movements = useMemo<Movement[]>(() => {
    const sent = [...(sales.data ?? []).map(saleMovement), ...(expenses.data ?? []).map(expenseMovement)];
    // Lo que aún no salió del teléfono se muestra también, marcado «sin enviar».
    const queued: Movement[] = outbox.items
      .filter((x) => x.entityId === entityId && x.status !== 'failed' && (x.kind === 'sale' || x.kind === 'expense'))
      .filter((x) => !sent.some((m) => m.id === x.id))
      .map((x) => {
        const p = x.payload as { total?: number; amount?: number; note?: string; method: Sale['method']; category?: string };
        return { key: `q${x.id}`, kind: x.kind as 'sale' | 'expense', id: x.id, at: new Date(x.createdAt).toISOString(), amount: Number(p.total ?? p.amount ?? 0), title: p.note || (x.kind === 'sale' ? 'Venta' : categoryLabel(p.category ?? 'otro')), sub: METHOD_LABEL[p.method] ?? '', voided: false, pending: x.status === 'pending' };
      });
    return [...queued, ...sent].sort((a, b) => b.at.localeCompare(a.at));
  }, [sales.data, expenses.data, outbox.items, entityId]);

  const salesTotal = (sum?.sales_total ?? 0) + pending.sales;
  const expensesTotal = (sum?.expenses_total ?? 0) + pending.expenses;
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
      <SubScreenHeader title="Mi negocio" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.tabs}>
          {PERIODS.map((p) => (
            <Chip key={p.key} label={p.label} selected={period === p.key} onPress={() => setPeriod(p.key)} />
          ))}
        </View>

        {outbox.items.some((x) => x.entityId === entityId && x.status !== 'sent') ? <OutboxBanner entityId={entityId} /> : null}

        {summary.isLoading ? (
          <ActivityIndicator style={{ marginVertical: spacing.xl }} color={colors.primary} />
        ) : summary.isError && !sum ? (
          <EmptyState icon="cloud-offline-outline" title="No pudimos cargar el resumen" body="Sin conexión puedes seguir registrando ventas y gastos: se envían solos cuando vuelva la señal." action={{ title: 'Reintentar', onPress: onRefresh }} />
        ) : (
          <View style={styles.card}>
            <Stat title="Vendiste" value={salesTotal} big />
            {sum ? <Text style={styles.compare}>{changeText(sum.sales_total, sum.prev_sales_total, versus) ?? `${sum.sales_count} ${sum.sales_count === 1 ? 'venta' : 'ventas'}`}</Text> : null}
            <View style={styles.statRow}>
              <Stat title="Gastaste" value={expensesTotal} />
              <Stat title={profit >= 0 ? 'Te quedó' : 'Perdiste'} value={Math.abs(profit)} tone={profit >= 0 ? 'good' : 'bad'} />
            </View>
            {sum && sum.sales_total > 0 ? (
              <View style={styles.methods}>
                {(['cash', 'transfer', 'card', 'credit'] as const).map((m) => (sum.by_method[m] > 0 ? (
                  <Text key={m} style={styles.method}>
                    {METHOD_LABEL[m]} {formatPesos(sum.by_method[m])}
                  </Text>
                ) : null))}
              </View>
            ) : null}
            {sum && sum.margin_coverage_pct >= 50 ? (
              <Text style={styles.margin}>
                Ganancia por lo vendido: {formatPesos(sum.gross_margin)}
                {sum.margin_coverage_pct < 100 ? ` (con costo en el ${sum.margin_coverage_pct} % de las ventas)` : ''}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.actions}>
          <ActionButton icon="add-circle" label="Vender" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } })} tone="primary" />
          <ActionButton icon="remove-circle" label="Gastar" onPress={() => router.push({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } })} tone="accent" />
        </View>

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

        {sum && sum.top_items && sum.top_items.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Lo que más vendiste</Text>
            {sum.top_items.slice(0, 3).map((t) => (
              <View key={t.name} style={styles.topRow}>
                <Text style={styles.topName} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={styles.topQty}>{Number.isInteger(t.qty) ? t.qty : t.qty.toFixed(1)} u.</Text>
                <Text style={styles.topValue}>{formatPesos(t.revenue)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{period === 'day' ? 'Movimientos de hoy' : 'Movimientos'}</Text>
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
                  {timeOf(m.at)} · {m.sub}
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
    </View>
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
  tabs: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
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
