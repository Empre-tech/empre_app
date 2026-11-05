import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type Sale } from '@/api/ledger';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { EmptyState } from '@/components/EmptyState';
import { EmpreAICard, StatusCap, SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { expenseMovement, MoveRows, saleMovement, type Movement } from '@/components/finance/Moves';
import { FinanceTop } from '@/components/finance/Top';
import { addDays, atHour, dayReadings, expectedToday, hourBars, hourCO, hourLabel, leftOf, moneyIn, moneyOut, monthlyGap, presetRange, showHours, todayCO, todayTitle, WEEK_NAMES, weekdayIndex, type DaySale } from '@/lib/finance';
import { categoryLabel, formatPesos, pendingCredit, pendingTotals, salePayText } from '@/lib/ledger';
import { useFinanceSetup } from '@/ledger/financeSetup';
import { useParkedSales } from '@/ledger/parkedSales';
import { discardLedgerItem, flushLedger, retryLedgerItem, useLedgerOutbox } from '@/ledger/ledgerStore';
import { FEATURES } from '@/config';
import { colors, fonts, softShadow, spacing } from '@/theme';

/** Inicio del día en Colombia, como fecha-hora para filtrar ventas y gastos. */
const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;
/** El máximo que entrega el servidor en una lista. Con más ventas, las horas quedarían incompletas. */
const SALES_LIMIT = 500;
const READING_ICON = { best: 'time-outline', top: 'pricetag-outline', quiet: 'hourglass-outline' } as const;
const EXAMPLE_BARS = [10, 30, 62, 44, 18, 8, 26, 52, 36, 14, 8, 4];

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
  const monthRange = useMemo(() => presetRange('month', today), [today]);
  const month = useQuery({
    queryKey: ['ledger', entityId, 'analytics', monthRange.from, monthRange.to, monthRange.compare],
    queryFn: () => ledgerApi.analytics(entityId, { from: monthRange.from, to: monthRange.to, compare: monthRange.compare }),
    enabled: Boolean(entityId),
    staleTime: 60_000,
  });
  const agenda = useQuery({ queryKey: ['agenda', entityId, today, 'finance'], queryFn: () => agendaApi.agenda(entityId, startCO(today), startCO(addDays(today, 1))), enabled: Boolean(entityId), staleTime: 60_000 });
  const setup = useFinanceSetup(entityId);
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

  const localOwed = setup.debts.filter((d) => d.kind === 'customer').reduce((s, d) => s + d.amount, 0);
  const localOwe = setup.debts.filter((d) => d.kind === 'supplier').reduce((s, d) => s + d.amount, 0);
  const owedAll = (sum?.receivable ?? 0) + localOwed;
  const oweAll = (sum?.payable ?? 0) + localOwe;
  const accountsSub = owedAll > 0 || oweAll > 0 ? [owedAll > 0 ? `Te deben ${formatPesos(owedAll)}` : null, oweAll > 0 ? `Debes ${formatPesos(oweAll)}` : null].filter(Boolean).join(' · ') : null;
  const w = week.data;
  const hasHistory = Boolean(w) && w!.current.sales_count + w!.previous.sales_count > 0;
  const goPlata = () => router.push({ pathname: '/business/ledger/plata/[id]', params: { id: entityId } });

  // Cuánto falta para cubrir lo del mes, con lo que el dueño nos contó que paga.
  const gap = setup.monthly && month.data ? monthlyGap(setup.monthly, leftOf(month.data.current)) : null;
  const monthlyRow = !setup.monthly ? null : !gap ? { title: `Este mes necesitas cubrir ${formatPesos(setup.monthly)}`, sub: 'Lo que nos contaste que pagas cada mes' } : gap.covered ? { title: 'Este mes ya cubres lo que pagas', sub: `Te han quedado más de ${formatPesos(setup.monthly)}` } : gap.missing === setup.monthly ? { title: `Este mes necesitas cubrir ${formatPesos(setup.monthly)}`, sub: 'Lo que nos contaste que pagas cada mes' } : { title: `Este mes te faltan ${formatPesos(gap.missing)}`, sub: `Para cubrir los ${formatPesos(setup.monthly)} que pagas cada mes` };

  // Sin ventas hoy nunca se muestra un cero: lo que se espera, lo normal o lo de ayer; si no hay nada, el siguiente paso.
  const expected = expectedToday(agenda.data ?? [], items.data ?? []);
  const todayIndex = w ? w.series.findIndex((p) => p.start === today) : -1;
  const normalToday = w?.normal?.length === w?.series.length && todayIndex >= 0 ? w?.normal?.[todayIndex] ?? 0 : 0;
  const yesterday = todayIndex > 0 ? w?.series[todayIndex - 1]?.sales ?? 0 : 0;
  const openingHero = salesTotal > 0 ? null : expected.total > 0
    ? { label: 'Hoy esperas', value: formatPesos(expected.total), words: '', note: `${expected.priced === 1 ? '1 cita en tu agenda' : `${expected.priced} citas en tu agenda`}, si se cumplen. Cuenta cuando las cobres.` }
    : expected.count > 0
      ? { label: 'Hoy', value: '', words: expected.count === 1 ? 'Tienes 1 cita' : `Tienes ${expected.count} citas`, note: 'Con precio en tu catálogo, te decimos cuánto esperar.' }
      : normalToday > 0
        ? { label: `Un ${WEEK_NAMES[weekdayIndex(today)]} normal vendes`, value: formatPesos(normalToday), words: '', note: 'Registra tu primera venta de hoy.' }
        : yesterday > 0
          ? { label: 'Ayer vendiste', value: formatPesos(yesterday), words: '', note: 'Registra tu primera venta de hoy.' }
          : { label: 'Hoy', value: '', words: 'Empieza por tu primera venta', note: 'Te toma dos toques.' };

  const refreshing = summary.isRefetching || sales.isRefetching;
  const onRefresh = () => {
    void flushLedger();
    void summary.refetch();
    void sales.refetch();
    void expenses.refetch();
    void week.refetch();
  };

  const goSale = () => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } });
  const goExpense = () => router.push({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <FinanceTop entityId={entityId} space="hoy" title={`Hoy, ${todayTitle(today)}`} />

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
                  <Text style={styles.label}>{openingHero ? openingHero.label : 'Vendiste hoy'}</Text>
                  {openingHero && !openingHero.value ? (
                    <Text style={styles.heroWords} accessibilityLiveRegion="polite">
                      {openingHero.words}
                    </Text>
                  ) : (
                    <Text style={styles.hero} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">
                      {openingHero ? openingHero.value : formatPesos(salesTotal)}
                    </Text>
                  )}
                </View>
                {count === 0 && expensesTotal === 0 ? (
                  <Text style={styles.invite}>{openingHero?.note ?? 'Registra tu primera venta. Te toma dos toques.'}</Text>
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
          {!setup.done && !hasHistory ? <SystemRow first icon="help-circle-outline" title="Cuéntanos tres cosas" sub="Tu caja, quién te debe y lo que pagas al mes. Son opcionales" onPress={() => router.push({ pathname: '/business/ledger/arranque/[id]', params: { id: entityId } })} /> : null}
          {w && hasHistory ? <SystemRow first icon="bar-chart-outline" title={leftOf(w.current) >= 0 ? `Estos 7 días te quedaron ${formatPesos(leftOf(w.current))}` : `Estos 7 días salieron ${formatPesos(-leftOf(w.current))} de más`} sub={`Entró ${formatPesos(moneyIn(w.current))} · salió ${formatPesos(moneyOut(w.current))}`} onPress={goPlata} /> : null}
          {monthlyRow ? <SystemRow first={!w || (!hasHistory && setup.done)} icon="wallet-outline" title={monthlyRow.title} sub={monthlyRow.sub} onPress={goPlata} /> : null}
          {accountsSub ? <SystemRow icon="people-outline" title="Te deben y debes" sub={accountsSub} onPress={goDebts} /> : null}
          <SystemRow icon="cube-outline" title="Inventario" sub={stockAlerts.length ? `${stockAlerts.length === 1 ? '1 producto se acaba' : `${stockAlerts.length} productos se acaban`}` : 'Lo que tienes y lo que te queda'} alert={stockAlerts.length > 0} onPress={() => router.push({ pathname: '/business/products/[id]', params: { id: entityId } })} />
        </SystemGroup>

        {movements.length > 0 ? (
          <SystemSection title={selected ? `Movimientos de ${atHour(selected.hour)}` : 'Movimientos de hoy'}>
            <SystemGroup>
              {shownMoves.length === 0 ? <Text style={styles.noMoves}>Sin movimientos en esta hora</Text> : null}
              <MoveRows entityId={entityId} moves={shownMoves} />
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
  main: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  mainTop: { minHeight: 168, justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  label: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  hero: { fontSize: 40, lineHeight: 46, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  heroWords: { fontSize: 26, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink },
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
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 12, borderRadius: 12, backgroundColor: colors.selectedSoft },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  bannerLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
});
