import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type Expense, type Sale } from '@/api/ledger';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { EmptyState } from '@/components/EmptyState';
import { EmpreAICard, StatusCap, SystemGroup, SystemHead, SystemRow, SystemSection, SystemTitle } from '@/components/system/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { addDays, atHour, dayReadings, deltaWords, hourBars, hourCO, hourLabel, presetRange, showHours, todayCO, todayTitle, type DaySale } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL, pendingCredit, pendingTotals, salePayText } from '@/lib/ledger';
import { useParkedSales } from '@/ledger/parkedSales';
import { discardLedgerItem, flushLedger, queueVoid, retryLedgerItem, useLedgerOutbox } from '@/ledger/ledgerStore';
import { FEATURES } from '@/config';
import { colors, fonts, softShadow, spacing } from '@/theme';

/** Inicio del día en Colombia, como fecha-hora para filtrar ventas y gastos. */
const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;
/** El máximo que entrega el servidor en una lista. Con más ventas, las horas quedarían incompletas. */
const SALES_LIMIT = 500;
const READING_ICON = { best: 'time-outline', top: 'pricetag-outline', quiet: 'hourglass-outline' } as const;
const EXAMPLE_BARS = [10, 30, 62, 44, 18, 8, 26, 52, 36, 14, 8, 4];

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

const originText = (source: Sale['source']) => (source === 'offer_claim' ? 'Empre Offers · ' : source === 'appointment' ? 'Agenda · ' : '');

function saleMovement(s: Sale): Movement {
  const what = s.lines?.length ? s.lines.map((l) => (l.qty === 1 ? l.name : `${l.qty} × ${l.name}`)).join(', ') : s.note || 'Venta';
  return { key: `s${s.id}`, kind: 'sale', id: s.id, at: s.occurred_at, amount: s.total, title: what, sub: `${originText(s.source)}${salePayText({ ...s, partyName: s.party?.name })}${s.source === 'voice' ? ' · por voz' : ''}`, voided: s.status === 'voided', pending: false };
}

function expenseMovement(e: Expense): Movement {
  return { key: `e${e.id}`, kind: 'expense', id: e.id, at: e.occurred_at, amount: e.amount, title: e.note || categoryLabel(e.category), sub: `${categoryLabel(e.category)} · ${e.method === 'credit' ? 'A crédito' : METHOD_LABEL[e.method]}${e.party ? ` · ${e.party.name}` : ''}`, voided: e.status === 'voided', pending: false };
}

/** El horario de hoy en horas enteras para las barras; sin horario, null. Los días 24 horas tampoco lo acotan. */
function hoursToday(rows: { weekday: number; closed: boolean; is_24h: boolean; open_time: string; close_time: string }[] | undefined, now: Date): { open: number; close: number } | null {
  const weekday = new Date(now.getTime() - 5 * 3600 * 1000).getUTCDay();
  const t = rows?.find((h) => h.weekday === weekday);
  if (!t || t.closed || t.is_24h || !t.open_time || !t.close_time) return null;
  const [oh] = t.open_time.split(':').map(Number);
  const [ch, cm] = t.close_time.split(':').map(Number);
  const close = cm > 0 ? ch : ch - 1;
  return close >= oh ? { open: oh, close } : null;
}

/** Empre Finance, Hoy: cómo va el día y qué hacer ahora. Los periodos viven en Análisis. */
export default function LedgerHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = todayCO();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [selHour, setSelHour] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const outbox = useLedgerOutbox();
  const inbox = useInboxSummary();
  const parked = useParkedSales(entityId);
  const dayRange = useMemo(() => presetRange('today', today), [today]);
  const weekRange = useMemo(() => presetRange('7d', today), [today]);
  const span = { from: startCO(today), to: startCO(addDays(today, 1)) };

  // La hora actual avanza sola con la pantalla abierta.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const entity = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const summary = useQuery({
    queryKey: ['ledger', entityId, 'analytics', dayRange.from, dayRange.to, dayRange.compare],
    queryFn: () => ledgerApi.analytics(entityId, { from: dayRange.from, to: dayRange.to, compare: dayRange.compare }),
    enabled: Boolean(entityId),
    staleTime: 15_000,
  });
  const week = useQuery({
    queryKey: ['ledger', entityId, 'analytics', weekRange.from, weekRange.to, weekRange.compare],
    queryFn: () => ledgerApi.analytics(entityId, { from: weekRange.from, to: weekRange.to, compare: weekRange.compare }),
    enabled: Boolean(entityId),
    staleTime: 60_000,
  });
  const sales = useQuery({ queryKey: ['ledger', entityId, 'sales', today], queryFn: () => ledgerApi.sales(entityId, { ...span, limit: SALES_LIMIT }), enabled: Boolean(entityId) });
  const expenses = useQuery({ queryKey: ['ledger', entityId, 'expenses', today], queryFn: () => ledgerApi.expenses(entityId, { ...span, limit: 100 }), enabled: Boolean(entityId) });
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const insights = useQuery({ queryKey: ['ledger', entityId, 'insights'], queryFn: () => ledgerApi.insights(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const inventory = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const quick = inventory.data?.quick_sale === true;

  const sum = summary.data;
  const pending = pendingTotals(outbox.items, entityId);
  const queued = useMemo(() => outbox.items.filter((x) => x.entityId === entityId && x.status === 'pending' && (x.kind === 'sale' || x.kind === 'expense')), [outbox.items, entityId]);

  // Lo que aún no sale del teléfono también cuenta, marcado «sin enviar».
  const movements = useMemo<Movement[]>(() => {
    const sent = [...(sales.data ?? []).map(saleMovement), ...(expenses.data ?? []).map(expenseMovement)];
    const local: Movement[] = queued
      .filter((x) => !sent.some((m) => m.id === x.id))
      .map((x) => {
        const p = x.payload as { total?: number; amount?: number; note?: string; method: Sale['method']; method2?: Sale['method']; amount2?: number; category?: string };
        return { key: `q${x.id}`, kind: x.kind as 'sale' | 'expense', id: x.id, at: new Date(x.createdAt).toISOString(), amount: Number(p.total ?? p.amount ?? 0), title: p.note || (x.kind === 'sale' ? 'Venta' : categoryLabel(p.category ?? 'otro')), sub: salePayText({ total: Number(p.total ?? p.amount ?? 0), method: p.method, method2: p.method2, amount2: p.amount2 }) ?? '', voided: false, pending: true };
      });
    return [...local, ...sent].sort((a, b) => b.at.localeCompare(a.at));
  }, [sales.data, expenses.data, queued]);

  const daySales = useMemo<DaySale[]>(() => {
    const sent: DaySale[] = (sales.data ?? [])
      .filter((s) => s.status !== 'voided')
      .map((s) => ({ at: s.occurred_at, amount: s.total, items: s.lines?.length ? s.lines.map((l) => ({ name: l.name, qty: l.qty })) : s.note ? [{ name: s.note, qty: 1 }] : [] }));
    const sentIds = new Set((sales.data ?? []).map((s) => s.id));
    const local: DaySale[] = queued
      .filter((x) => x.kind === 'sale' && !sentIds.has(x.id))
      .map((x) => {
        const p = x.payload as { total?: number; note?: string };
        return { at: new Date(x.createdAt).toISOString(), amount: Number(p.total ?? 0), items: p.note ? [{ name: p.note, qty: 1 }] : [] };
      });
    return [...sent, ...local];
  }, [sales.data, queued]);

  const salesTotal = (sum?.current.sales_total ?? 0) + pending.sales;
  const expensesTotal = (sum?.current.expenses_total ?? 0) + pending.expenses;
  const fiado = (sum?.current.by_method.credit ?? 0) + pendingCredit(outbox.items, entityId);
  const entered = salesTotal - fiado;
  const count = daySales.length;

  const nowHour = hourCO(now.toISOString());
  const hasHours = showHours(daySales);
  const bars = useMemo(() => hourBars(daySales, nowHour, hoursToday(entity.data?.hours, now)), [daySales, nowHour, entity.data?.hours, now]);
  const topBar = Math.max(1, ...bars.map((b) => b.total));
  const selected = selHour === null ? null : bars.find((b) => b.hour === selHour) ?? null;
  const readings = dayReadings(daySales, now, entity.data?.is_open_now === true);
  const truncated = (sales.data?.length ?? 0) >= SALES_LIMIT;
  const shownMoves = selected ? movements.filter((m) => hourCO(m.at) === selected.hour) : movements;
  const selectedNames = selected ? [...new Set(movements.filter((m) => m.kind === 'sale' && !m.voided && hourCO(m.at) === selected.hour).map((m) => m.title))].join(' · ') : '';

  const goAnalytics = (tab?: 'inventory' | 'products') =>
    router.push({ pathname: '/business/ledger/analytics/[id]', params: { id: entityId, from: weekRange.from, to: weekRange.to, compare: weekRange.compare, preset: weekRange.preset, ...(tab ? { tab } : {}) } });
  const goDebts = () => router.push({ pathname: '/business/ledger/debts/[id]', params: { id: entityId } });

  // Lo que no puede esperar: hasta tres cosas, primero las personas y luego la plata.
  const requests = inbox.byEntity.get(entityId)?.requests ?? 0;
  const stockAlerts = (insights.data ?? []).filter((i) => i.kind === 'soon' || i.kind === 'out' || i.kind === 'low');
  const urgent: { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; alert?: boolean; amount?: string; onPress: () => void }[] = [
    ...(requests > 0 && FEATURES.agenda ? [{ key: 'agenda', icon: 'calendar-outline' as const, title: requests === 1 ? '1 cita por responder' : `${requests} citas por responder`, sub: 'Toca para verlas en la agenda', alert: true, onPress: () => router.push({ pathname: '/business/agenda/[id]', params: { id: entityId } }) }] : []),
    ...stockAlerts.slice(0, 2).map((a) => ({ key: `${a.kind}-${a.ref ?? a.title}`, icon: 'cube-outline' as const, title: a.title, sub: a.body, alert: true, onPress: () => goAnalytics('inventory') })),
  ].slice(0, 3);

  const accountsSub = sum && (sum.receivable > 0 || sum.payable > 0) ? [sum.receivable > 0 ? `Te deben ${formatPesos(sum.receivable)}` : null, sum.payable > 0 ? `Debes ${formatPesos(sum.payable)}` : null].filter(Boolean).join(' · ') : 'Nada pendiente por ahora';
  const w = week.data;
  const weekSub = w && w.current.sales_total > 0 ? [`Vendiste ${formatPesos(w.current.sales_total)}`, deltaWords(w.current.sales_total, w.previous.sales_total, 'la anterior')].filter(Boolean).join(' · ') : 'Tu primer resumen, con lo que llevas';

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
    void week.refetch();
  };

  const hints = (items.data ?? []).map((i) => i.name);
  const goSale = () => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } });
  const goExpense = () => router.push({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.top}>
          <SystemHead lead="Finanzas de" name={entity.data?.name} />
          <SystemTitle>{`Hoy, ${todayTitle(today)}`}</SystemTitle>
          <Pressable accessibilityRole="button" accessibilityLabel="Dictar una venta o gasto" onPress={() => setVoiceOpen(true)} style={styles.field}>
            <Text style={styles.fieldText} numberOfLines={1}>
              Dicta una venta o un gasto
            </Text>
            <View style={styles.fieldSlot}>
              <Ionicons name="mic-outline" size={18} color={colors.ink} />
            </View>
          </Pressable>
        </View>

        {outbox.items.some((x) => x.entityId === entityId) ? <OutboxBanner entityId={entityId} /> : null}

        <View style={styles.main}>
          <View style={styles.mainTop}>
            {summary.isLoading ? (
              <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
            ) : summary.isError && !sum ? (
              <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tu día" body="Sin conexión puedes seguir registrando ventas y gastos: se envían solos cuando vuelva la señal." action={{ title: 'Reintentar', onPress: onRefresh }} />
            ) : (
              <>
                <View>
                  <Text style={styles.label}>Vendiste hoy</Text>
                  <Text style={styles.hero} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">
                    {formatPesos(salesTotal)}
                  </Text>
                </View>
                {count === 0 && expensesTotal === 0 ? (
                  <Text style={styles.invite}>Registra tu primera venta. Te toma dos toques.</Text>
                ) : (
                  <View style={styles.minis}>
                    <Mini label="Te entró" value={formatPesos(entered)} />
                    <Mini label="Te fiaron" value={formatPesos(fiado)} />
                    <Mini label="Gastaste" value={formatPesos(expensesTotal)} />
                  </View>
                )}
              </>
            )}
          </View>
          <View style={styles.mainFoot}>
            <Text style={styles.count} numberOfLines={2}>
              {count === 0 ? 'Aún sin ventas hoy' : count === 1 ? '1 venta' : `${count} ventas`}
            </Text>
            <Pressable accessibilityRole="button" onPress={goExpense} style={styles.btnOutline}>
              <Ionicons name="remove" size={16} color={colors.ink} />
              <Text style={styles.btnOutlineText}>Gasto</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={goSale} style={styles.btnRed}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.btnRedText}>Venta</Text>
            </Pressable>
          </View>
        </View>

        {hasHours ? (
          <>
            <SystemSection title="Tu día por horas">
              <View style={styles.card}>
                <View style={styles.hours}>
                  {bars.map((b) => {
                    const on = selHour === b.hour;
                    const isTop = selHour === null && b.total === topBar && b.total > 0;
                    return (
                      <Pressable
                        key={b.hour}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: b.isFuture }}
                        accessibilityLabel={`${hourLabel(b.hour)}: ${b.isFuture ? 'aún no llega' : b.total > 0 ? formatPesos(b.total) : 'sin ventas'}`}
                        disabled={b.isFuture}
                        onPress={() => setSelHour(on ? null : b.hour)}
                        style={styles.hourSlot}
                      >
                        <View style={[styles.hourBar, { height: b.total > 0 ? Math.max(10, (b.total / topBar) * 88) : 4, backgroundColor: on || isTop ? colors.ink : b.total > 0 ? colors.placeholder : b.isFuture ? colors.selectedSoft : colors.line }]} />
                        {b.isNow ? <View style={styles.nowLine} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.hourLabels}>
                  {bars.map((b, i) => (
                    <Text key={b.hour} style={[styles.hourLabel, selHour === b.hour && { color: colors.ink }]} numberOfLines={1}>
                      {i % 2 === 0 ? String(b.hour === 12 ? 12 : b.hour > 12 ? b.hour - 12 : b.hour) : ''}
                    </Text>
                  ))}
                </View>
                <View style={styles.hourDetail} accessibilityLiveRegion="polite">
                  <Text style={styles.detailHead}>{selected ? (selected.total > 0 ? `${hourLabel(selected.hour)}: ${formatPesos(selected.total)} en ${selected.count === 1 ? '1 venta' : `${selected.count} ventas`}` : `${hourLabel(selected.hour)}: sin ventas`) : 'Toca una hora para ver qué vendiste'}</Text>
                  <Text style={styles.detailSub}>{selected ? selectedNames || 'En esta hora no se registró ninguna venta' : 'Abajo se filtran los movimientos de esa hora'}</Text>
                </View>
                {truncated ? <Text style={styles.detailSub}>Hoy tienes más de {SALES_LIMIT} ventas: las horas cuentan solo las últimas.</Text> : null}
              </View>
            </SystemSection>

            {readings.length > 0 ? (
              <EmpreAICard title="Lo que dice tu día">
                <View>
                  {readings.map((r, i) => (
                    <SystemRow key={r.kind} first={i === 0} icon={READING_ICON[r.kind]} title={r.title} sub={r.sub} />
                  ))}
                  {readings.some((r) => r.kind === 'quiet') ? <SystemRow icon="pricetag-outline" title="Una oferta puede mover estas horas" sub="Prepárala en un minuto; tú decides si la publicas" onPress={() => router.push({ pathname: '/business/offers/new', params: { entityId } })} /> : null}
                </View>
              </EmpreAICard>
            ) : null}
          </>
        ) : count === 0 ? (
          <SystemSection title="Tu día por horas">
            <View style={styles.card}>
              <View style={styles.hours} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {EXAMPLE_BARS.map((h, i) => (
                  <View key={i} style={[styles.hourSlot, styles.exampleSlot]}>
                    <View style={[styles.hourBar, { height: h, backgroundColor: colors.hairline }]} />
                  </View>
                ))}
                <View style={styles.exampleTag}>
                  <Text style={styles.exampleText}>Ejemplo</Text>
                </View>
              </View>
              <Text style={styles.invite}>Con tus ventas, aquí verás a qué hora vendes más y qué es lo que más sale.</Text>
            </View>
          </SystemSection>
        ) : (
          <Text style={styles.nextStep}>{count === 1 ? 'Con 2 ventas más verás tu día por horas' : count === 2 ? 'Con 1 venta más verás tu día por horas' : 'Cuando vendas en otras horas verás tu día completo'}</Text>
        )}

        {urgent.length > 0 ? (
          <SystemSection title="Lo que no puede esperar">
            <SystemGroup>
              {urgent.map(({ key, ...u }, i) => (
                <SystemRow key={key} first={i === 0} {...u} />
              ))}
            </SystemGroup>
          </SystemSection>
        ) : null}

        <SystemGroup>
          <SystemRow first icon="bar-chart-outline" title="Ver cómo te ha ido esta semana" sub={weekSub} onPress={() => goAnalytics()} />
          <SystemRow icon="people-outline" title="Te deben y debes" sub={accountsSub} onPress={goDebts} />
          <SystemRow icon="cube-outline" title="Inventario" sub={stockAlerts.length ? `${stockAlerts.length === 1 ? '1 producto se acaba' : `${stockAlerts.length} productos se acaban`}` : 'Lo que tienes y lo que te queda'} alert={stockAlerts.length > 0} onPress={() => router.push({ pathname: '/business/products/[id]', params: { id: entityId } })} />
        </SystemGroup>

        {movements.length > 0 ? (
          <SystemSection title={selected ? `Movimientos de ${atHour(selected.hour)}` : 'Movimientos de hoy'}>
            <SystemGroup>
              {shownMoves.length === 0 ? <Text style={styles.noMoves}>Sin movimientos en esta hora</Text> : null}
              {shownMoves.map((m, i) => (
                <Pressable key={m.key} accessibilityRole="button" accessibilityLabel={`${m.kind === 'sale' ? 'Venta' : 'Gasto'} de ${formatPesos(m.amount)}, ${m.title}${m.voided ? ', anulada' : ''}. Toca para anular`} onPress={() => (m.pending ? undefined : askVoid(m))} style={[styles.move, i > 0 && styles.moveLine]}>
                  <View style={styles.moveIcon}>
                    <Ionicons name={m.kind === 'sale' ? 'arrow-up' : 'arrow-down'} size={16} color={colors.ink} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.moveTitle, m.voided && styles.struck]} numberOfLines={1}>
                      {m.title}
                    </Text>
                    <Text style={styles.moveSub} numberOfLines={2}>
                      {timeOf(m.at)} · {m.sub}
                      {m.pending ? ' · sin enviar' : ''}
                      {m.voided ? ' · anulada' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.moveAmount, m.voided && styles.struck, m.kind === 'expense' && { color: colors.muted }]}>
                    {m.kind === 'expense' ? '−' : ''}
                    {formatPesos(m.amount)}
                  </Text>
                </Pressable>
              ))}
            </SystemGroup>
          </SystemSection>
        ) : null}

        <SystemSection title="Otras formas de vender">
          <SystemGroup>
            {quick ? <SystemRow first icon="flash-outline" title="Modo mostrador" sub="Para cuando hay fila: un toque, una venta" onPress={() => router.push({ pathname: '/business/ledger/quick/[id]', params: { id: entityId } })} /> : null}
            {quick && FEATURES.tabs ? <SystemRow icon="restaurant-outline" title="Mesas y cuentas" sub="El cliente va pidiendo y paga al final" onPress={() => router.push({ pathname: '/business/ledger/tabs/[id]', params: { id: entityId } })} /> : null}
            <SystemRow first={!quick} icon="person-outline" title="Fiado" sub="Lo paga después; queda en «Te deben»" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId, fiado: '1' } })} />
            {parked.length > 0 ? <SystemRow icon="time-outline" title={parked.length === 1 ? '1 venta en espera' : `${parked.length} ventas en espera`} sub="No cuentan en la caja hasta que las cobres" onPress={goSale} /> : null}
          </SystemGroup>
        </SystemSection>

        <SystemGroup>
          <SystemRow first icon="cash-outline" title="Cerrar la caja de hoy" sub="Cuenta lo que hay y mira si cuadra" onPress={() => router.push({ pathname: '/business/ledger/cash/[id]', params: { id: entityId } })} />
        </SystemGroup>
      </ScrollView>
      <StatusCap />

      <VoiceSheet entityId={entityId} visible={voiceOpen} onClose={() => setVoiceOpen(false)} hints={hints} />
    </View>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.miniValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
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
          {flushing ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="cloud-upload-outline" size={18} color={colors.ink} />}
          <Text style={styles.bannerText}>
            {waiting === 1 ? '1 registro sin enviar' : `${waiting} registros sin enviar`}. Se envían solos cuando hay señal. Toca para intentar ahora.
          </Text>
        </Pressable>
      ) : null}
      {failed.map((f) => (
        <View key={f.id} style={[styles.banner, { backgroundColor: colors.primarySoft }]}>
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
  body: { paddingHorizontal: 20, gap: 24 },
  top: { gap: 14 },
  field: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  fieldText: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.faint },
  fieldSlot: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  main: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  mainTop: { minHeight: 168, justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  label: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  hero: { fontSize: 40, lineHeight: 46, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  invite: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted },
  minis: { flexDirection: 'row', gap: 12 },
  mini: { flex: 1, minWidth: 0, gap: 1 },
  miniValue: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  mainFoot: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 },
  count: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: colors.ink },
  btnOutline: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  btnOutlineText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  btnRed: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary },
  btnRedText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  card: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  hours: { height: 96, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  hourSlot: { flex: 1, minWidth: 0, height: 96, justifyContent: 'flex-end' },
  hourBar: { borderRadius: 4 },
  nowLine: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: colors.brand },
  hourLabels: { flexDirection: 'row', gap: 3, marginTop: -6 },
  hourLabel: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 12, fontFamily: fonts.ui.bold, color: colors.faint },
  hourDetail: { minHeight: 44, justifyContent: 'center', gap: 1, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  detailHead: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  detailSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  exampleSlot: { height: 72 },
  exampleTag: { position: 'absolute', left: 0, top: 0, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.selectedSoft },
  exampleText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  nextStep: { textAlign: 'center', fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted },
  noMoves: { minHeight: 58, paddingVertical: 18, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  move: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  moveLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  moveIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  moveTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  moveSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  moveAmount: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 12, borderRadius: 12, backgroundColor: colors.selectedSoft },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  bannerLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
});
