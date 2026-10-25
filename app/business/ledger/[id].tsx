import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type Expense, type Period, type Sale } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { CashCard, InsightList, LedgerActions, overviewStyles, PendingCard, PeriodTabs, ResultCard, SectionTitle, ShareList } from '@/components/ledger/Overview';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { fin } from '@/finance/tokens';
import { colombiaDay } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL, pendingTotals } from '@/lib/ledger';
import { categoryRows, dayNets, insights, methodSlices, periodResult, topRows } from '@/lib/ledgerInsights';
import { discardLedgerItem, flushLedger, queueVoid, retryLedgerItem, useLedgerOutbox } from '@/ledger/ledgerStore';
import { alpha, colors, fonts, radius, spacing } from '@/theme';

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

/** Movimientos que se ven antes de «Ver todos». */
const FIRST_MOVES = 6;
const WORDS = { pesos: formatPesos, category: categoryLabel };

/**
 * «Mi negocio» (3.52): con la lógica de Empre Finance, en tres partes como las diría un contador en palabras sencillas.
 * Resultado (cuánto te quedó, de cada $100 y cada día), caja (cómo te pagaron y lo que quedó) y pendiente (fiados).
 * Encima, hasta tres frases de «Lo que dicen tus números». Todo sale del resumen del servidor (ledgerInsights.ts).
 */
export default function LedgerHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('day');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [allMoves, setAllMoves] = useState(false);
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

  const result = sum ? periodResult(sum, pending) : null;
  const today = colombiaDay();
  const days = sum && period !== 'day' ? dayNets(sum, today, pending.sales - pending.expenses) : [];
  const ledgerHref = (pathname: '/business/ledger/sale/[id]' | '/business/ledger/expense/[id]' | '/business/ledger/debts/[id]' | '/business/ledger/costs/[id]') =>
    router.push({ pathname, params: { id: entityId } });
  const shown = allMoves ? movements : movements.slice(0, FIRST_MOVES);

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Mi negocio" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <PeriodTabs value={period} onChange={setPeriod} />
        {outbox.items.some((x) => x.entityId === entityId && x.status !== 'sent') ? <OutboxBanner entityId={entityId} /> : null}

        {summary.isLoading ? (
          <ActivityIndicator style={{ marginVertical: spacing.xl }} color={colors.primary} />
        ) : summary.isError && !sum ? (
          <EmptyState icon="cloud-offline-outline" title="No pudimos cargar el resumen" body="Sin conexión puedes seguir registrando ventas y gastos: se envían solos cuando vuelva la señal." action={{ title: 'Reintentar', onPress: onRefresh }} />
        ) : sum && result ? (
          <ResultCard r={result} sum={sum} versus={versus} days={days} />
        ) : null}

        <LedgerActions onSale={() => ledgerHref('/business/ledger/sale/[id]')} onExpense={() => ledgerHref('/business/ledger/expense/[id]')} onVoice={() => setVoiceOpen(true)} />

        {sum && result ? (
          <>
            <InsightList list={insights(sum, result, today, WORDS)} onAction={(a) => ledgerHref(a === 'debts' ? '/business/ledger/debts/[id]' : '/business/ledger/costs/[id]')} />
            <CashCard slices={methodSlices(sum)} cashIn={sum.cash_in} cashOut={sum.cash_out} />
            <ShareList title="En qué se fue tu plata" hint={formatPesos(sum.expenses_total)} rows={categoryRows(sum, WORDS)} tone="out" />
            <ShareList title="Lo que más vendiste" hint={`de ${formatPesos(sum.sales_total)}`} rows={topRows(sum)} tone="in" />
            <PendingCard receivable={sum.receivable} payable={sum.payable} onOpen={() => ledgerHref('/business/ledger/debts/[id]')} />
          </>
        ) : null}

        <View style={overviewStyles.stack}>
          <SectionTitle title={period === 'day' ? 'Movimientos de hoy' : 'Movimientos'} hint={movements.length > 0 ? 'toca uno para anularlo' : undefined} />
          {movements.length === 0 && sales.isFetched && expenses.isFetched ? (
            <EmptyState icon="receipt-outline" title="Aún no hay movimientos" body="Registra tu primera venta con «Venta» o díctala con el micrófono. Con dos o tres registros ya te muestro en qué se va tu plata." />
          ) : (
            <View style={[overviewStyles.card, overviewStyles.listCard]}>
              {shown.map((m, i) => (
                <Pressable
                  key={m.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.kind === 'sale' ? 'Venta' : 'Gasto'} de ${formatPesos(m.amount)}, ${m.title}${m.voided ? ', anulada' : ''}${m.pending ? ', sin enviar' : '. Toca para anular'}`}
                  onPress={() => (m.pending ? undefined : askVoid(m))}
                  style={({ pressed }) => [styles.move, i > 0 && overviewStyles.divider, pressed && !m.pending && { opacity: 0.7 }]}
                >
                  <View style={[styles.moveIcon, { backgroundColor: m.kind === 'sale' ? fin.color.in.soft : fin.color.out.soft }]}>
                    <Ionicons name={m.kind === 'sale' ? 'add' : 'remove'} size={16} color={m.kind === 'sale' ? fin.color.in.ink : fin.color.out.ink} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.moveTitle, m.voided && styles.struck]} numberOfLines={1}>
                      {m.title}
                    </Text>
                    <Text style={styles.moveSub} numberOfLines={1}>
                      {timeOf(m.at)} · {m.sub}
                      {m.pending ? ' · sin enviar' : ''}
                      {m.voided ? ' · anulada' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.moveAmount, { color: m.kind === 'sale' ? fin.color.in.ink : fin.color.out.ink }, m.voided && styles.struck]}>
                    {m.kind === 'expense' ? '−' : '+'}
                    {formatPesos(m.amount)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {movements.length > FIRST_MOVES ? (
            <Pressable accessibilityRole="button" onPress={() => setAllMoves((v) => !v)} style={styles.more}>
              <Text style={styles.moreText}>{allMoves ? 'Ver menos' : `Ver todos los movimientos (${movements.length})`}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <VoiceSheet entityId={entityId} visible={voiceOpen} onClose={() => setVoiceOpen(false)} hints={hints} />
    </View>
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
        <View key={f.id} style={[styles.banner, styles.bannerFailed]}>
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
  move: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 58 },
  moveIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moveTitle: { ...fin.type.body },
  moveSub: { ...fin.type.small, fontFamily: fin.font.uiSemibold, color: fin.color.textSoft },
  moveAmount: { fontSize: 15, fontFamily: fin.font.display },
  struck: { textDecorationLine: 'line-through', color: fin.color.textSoft },
  more: { minHeight: fin.size.touch, borderRadius: fin.radius.key, backgroundColor: fin.color.action.soft, alignItems: 'center', justifyContent: 'center' },
  moreText: { ...fin.type.button, fontSize: 13, color: fin.color.action.link },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md },
  bannerFailed: { backgroundColor: alpha(colors.danger, 0.12) },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.accentInk },
  bannerLink: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primary },
});
