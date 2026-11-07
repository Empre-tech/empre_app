import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { ledgerApi, type Analytics } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { HeatGrid } from '@/components/finance/Charts';
import { MethodDeck } from '@/components/finance/MethodDeck';
import { expenseMovement, MoveRows, saleMovement, timeOf } from '@/components/finance/Moves';
import { RangeSheet } from '@/components/finance/RangeSheet';
import { FinanceTop, Mini3 } from '@/components/finance/Top';
import { UnderstandWeek } from '@/components/finance/UnderstandWeek';
import { EmpreAICard, ShareRow, StatusCap, SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { plataReadings } from '@/lib/empreAI';
import { addDays, bestSlot, bucketLabel, dayLong, deltaWords, expectedToday, moneyIn, moneyOut, pointIn, pointOut, presetRange, rangeName, todayCO, type DateRange } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL, pendingCredit, pendingTotals } from '@/lib/ledger';
import { useTodayDeck } from '@/components/finance/useTodayDeck';
import { buildDeck, deckEntered } from '@/lib/methodDeck';
import { useFinanceSetup } from '@/ledger/financeSetup';
import { useLedgerOutbox } from '@/ledger/ledgerStore';
import { colors, fonts, softShadow, spacing } from '@/theme';

const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;
const MIN_FOR_HEAT = 10;
const BAR_MAX = 70;
const READING_ICON = { best: 'bar-chart-outline', credit: 'card-outline', delta: 'swap-vertical-outline' } as const;

/** Plata: lo que entró y lo que salió. Lo fiado y lo comprado a crédito cuentan cuando se pagan. */
export default function PlataScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const today = todayCO();
  const [range, setRange] = useState<DateRange>(() => presetRange('7d', today));
  const [sheet, setSheet] = useState(false);
  const q = useQuery({
    queryKey: ['ledger', entityId, 'analytics', range.from, range.to, range.compare],
    queryFn: () => ledgerApi.analytics(entityId, { from: range.from, to: range.to, compare: range.compare }),
    enabled: Boolean(entityId),
    staleTime: 30_000,
  });
  const a = q.data;
  const outbox = useLedgerOutbox();
  const pending = range.to >= today ? pendingTotals(outbox.items, entityId) : { sales: 0, expenses: 0 };
  const pendingFiado = range.to >= today ? pendingCredit(outbox.items, entityId) : 0;
  const hasAny = Boolean(a) && (a!.current.sales_count > 0 || a!.current.expenses_total > 0 || (a!.current.debts_collected ?? 0) > 0 || (a!.current.debts_paid ?? 0) > 0 || pending.sales > 0 || pending.expenses > 0);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + spacing.xxl }]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        <FinanceTop entityId={entityId} space="plata" title="Lo que entra y sale" />
        {q.isLoading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : q.isError || !a ? (
          <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tu plata" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void q.refetch() }} />
        ) : hasAny ? (
          <Full key={`${range.from}${range.to}`} a={a} entityId={entityId} range={range} entered={moneyIn(a.current) + pending.sales - pendingFiado} out={moneyOut(a.current) + pending.expenses} onRange={() => setSheet(true)} />
        ) : range.preset === '7d' ? (
          <FirstDays entityId={entityId} />
        ) : (
          <EmptyState icon="bar-chart-outline" title="Sin movimientos en estas fechas" body="Prueba otras fechas: lo que registres aparecerá aquí." action={{ title: 'Cambiar fechas', onPress: () => setSheet(true) }} />
        )}
      </ScrollView>
      <StatusCap />
      <RangeSheet visible={sheet} value={range} onApply={setRange} onClose={() => setSheet(false)} />
    </View>
  );
}

function Full({ a, entityId, range, entered, out, onRange }: { a: Analytics; entityId: string; range: DateRange; entered: number; out: number; onRange: () => void }) {
  const router = useRouter();
  const [sel, setSel] = useState<number | null>(null);
  const c = a.current;
  const series = a.series;
  const point = sel !== null ? series[sel] : null;
  const name = point ? (a.bucket === 'day' ? `El ${dayLong(point.start)}` : a.bucket === 'week' ? `La semana del ${dayLong(point.start)}` : `En ${bucketLabel('month', point.start, 0)}`) : rangeName(range);
  const shownIn = point ? pointIn(point) : entered;
  const shownOut = point ? pointOut(point) : out;
  const left = shownIn - shownOut;
  const top = Math.max(1, ...series.map((p) => Math.max(pointIn(p), pointOut(p))));
  const every = series.length > 16 ? Math.ceil(series.length / 8) : 1;

  // Los movimientos del periodo o de la barra elegida.
  const spanFrom = point ? point.start : range.from;
  const spanTo = sel !== null ? series[sel + 1]?.start ?? addDays(range.to, 1) : addDays(range.to, 1);
  const limit = point ? 30 : 8;
  const sales = useQuery({ queryKey: ['ledger', entityId, 'sales', spanFrom, spanTo, limit], queryFn: () => ledgerApi.sales(entityId, { from: startCO(spanFrom), to: startCO(spanTo), limit }), enabled: Boolean(entityId) });
  const expenses = useQuery({ queryKey: ['ledger', entityId, 'expenses', spanFrom, spanTo, limit], queryFn: () => ledgerApi.expenses(entityId, { from: startCO(spanFrom), to: startCO(spanTo), limit }), enabled: Boolean(entityId) });
  const moves = useMemo(() => [...(sales.data ?? []).map(saleMovement), ...(expenses.data ?? []).map(expenseMovement)].sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit), [sales.data, expenses.data, limit]);
  const cash = useQuery({ queryKey: ['ledger', entityId, 'cash'], queryFn: () => ledgerApi.cash(entityId), enabled: Boolean(entityId), staleTime: 30_000 });

  const prevLeft = moneyIn(a.previous) - moneyOut(a.previous);
  const delta = a.previous.sales_count > 0 ? deltaWords(entered - out, prevLeft, 'el periodo anterior') : null;
  const readings = plataReadings(series.map((p) => ({ start: p.start, left: pointIn(p) - pointOut(p) })), a.bucket, c.expenses_credit ?? 0, delta);
  const best = bestSlot(a.heat);
  const entries = ([['cash', METHOD_LABEL.cash], ['transfer', METHOD_LABEL.transfer], ['card', METHOD_LABEL.card]] as const).map(([k, label]) => ({ label, value: c.by_method[k] })).concat((c.debts_collected ?? 0) > 0 ? [{ label: 'Abonos de fiados', value: c.debts_collected ?? 0 }] : []).filter((x) => x.value > 0).sort((x, y) => y.value - x.value);
  const outs = Object.entries(c.out_by_category ?? c.expenses_by_category).map(([k, value]) => ({ label: categoryLabel(k), value })).concat((c.debts_paid ?? 0) > 0 ? [{ label: 'Pagos a proveedores', value: c.debts_paid ?? 0 }] : []).filter((x) => x.value > 0).sort((x, y) => y.value - x.value);
  const source = c.by_source;
  const sourceTotal = source ? source.manual + source.offers + source.agenda : 0;

  return (
    <>
      <TodayDeck entityId={entityId} />
      <View style={styles.main}>
        <View style={styles.mainTop}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1, minWidth: 0 }} accessibilityLiveRegion="polite">
              <Text style={styles.label} numberOfLines={1}>
                {left >= 0 ? `${name} te quedaron` : `${name} salió más de lo que entró`}
              </Text>
              <Text style={[styles.hero, left < 0 && { color: colors.warning }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatPesos(Math.abs(left))}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cambiar las fechas" onPress={onRange} style={styles.rangeBtn}>
              <Ionicons name="calendar-outline" size={18} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.bars}>
            {series.map((p, i) => {
              const on = sel === i;
              const dim = sel !== null && !on;
              const vIn = pointIn(p);
              const vOut = pointOut(p);
              return (
                <Pressable key={p.start} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${dayLong(p.start)}: entró ${formatPesos(vIn)}, salió ${formatPesos(vOut)}`} onPress={() => setSel(on ? null : i)} style={[styles.barSlot, on && styles.barSlotOn]}>
                  <View style={styles.barPair}>
                    <View style={[styles.bar, { height: vIn > 0 ? Math.max(4, (vIn / top) * BAR_MAX) : 2, backgroundColor: dim ? colors.placeholder : colors.ink }]} />
                    <View style={[styles.bar, { height: vOut > 0 ? Math.max(4, (vOut / top) * BAR_MAX) : 2, backgroundColor: dim ? colors.hairline : '#8796AB' }]} />
                  </View>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {i % every === 0 ? bucketLabel(a.bucket, p.start, series.length) : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>{sel === null ? 'Toca una barra para ver qué pasó' : 'Toca otra vez para ver todo'}</Text>
        </View>
        <View style={styles.legend}>
          <Legend color={colors.ink} label="Entró" value={formatPesos(shownIn)} />
          <Legend color="#8796AB" label="Salió" value={formatPesos(shownOut)} />
        </View>
      </View>

      {readings.length > 0 ? (
        <EmpreAICard title="Lo que dice tu plata">
          <View>
            {readings.map((r, i) => (
              <SystemRow key={r.kind} first={i === 0} icon={READING_ICON[r.kind]} title={r.title} sub={r.sub} />
            ))}
          </View>
        </EmpreAICard>
      ) : null}

      <SystemSection title={point ? 'Lo que pasó' : 'Últimas ventas y gastos'}>
        <SystemGroup>
          {moves.length > 0 ? <MoveRows entityId={entityId} moves={moves} when={(m) => (point && a.bucket === 'day' ? timeOf(m.at) : dayLong(m.at.slice(0, 10)))} /> : <Text style={styles.noMoves}>{sales.isLoading || expenses.isLoading ? 'Cargando…' : 'Sin ventas ni gastos aquí. Los abonos están en Cuentas.'}</Text>}
        </SystemGroup>
      </SystemSection>

      {entries.length > 0 ? (
        <SystemSection title="De dónde entró">
          <SystemGroup>
            {entries.map((x, i) => (
              <ShareRow key={x.label} first={i === 0} label={x.label} value={formatPesos(x.value)} share={(x.value / entries[0].value) * 100} />
            ))}
          </SystemGroup>
        </SystemSection>
      ) : null}
      {outs.length > 0 ? (
        <SystemSection title="En qué salió">
          <SystemGroup>
            {outs.slice(0, 5).map((x, i) => (
              <ShareRow key={x.label} first={i === 0} label={x.label} value={formatPesos(x.value)} share={(x.value / outs[0].value) * 100} />
            ))}
          </SystemGroup>
        </SystemSection>
      ) : null}
      {source && sourceTotal > 0 && source.manual < sourceTotal ? (
        <SystemSection title="Quién te trajo las ventas">
          <SystemGroup>
            <ShareRow first label="Registradas por ti" value={formatPesos(source.manual)} share={(source.manual / sourceTotal) * 100} />
            <ShareRow label="Empre Offers" value={formatPesos(source.offers)} share={(source.offers / sourceTotal) * 100} color={colors.accent} />
            <ShareRow label="Agenda" value={formatPesos(source.agenda)} share={(source.agenda / sourceTotal) * 100} />
          </SystemGroup>
        </SystemSection>
      ) : null}

      <UnderstandWeek a={a} onOffer={() => router.push({ pathname: '/business/offers/new', params: { entityId } })} />
      {c.sales_count >= MIN_FOR_HEAT ? (
        <SystemSection title="Cuándo vendes más">
          <View style={styles.card}>
            {best ? <Text style={styles.cardTitle}>Tu mejor momento: {best}</Text> : null}
            <HeatGrid heat={a.heat} />
          </View>
        </SystemSection>
      ) : null}

      <SystemGroup>
        <SystemRow first icon="cash-outline" title={cash.data && cash.data.expected > 0 ? `Caja de hoy: ${formatPesos(cash.data.expected)}` : 'Caja de hoy'} sub={cash.data && cash.data.expected > 0 ? 'Lo que debería haber · ciérrala al terminar' : 'Cuenta lo que hay y mira si cuadra'} onPress={() => router.push({ pathname: '/business/ledger/cash/[id]', params: { id: entityId } })} />
      </SystemGroup>
    </>
  );
}

/** Hoy, por cómo te pagaron: una tarjeta por medio. Sin movimientos hoy no aparece. */
function TodayDeck({ entityId }: { entityId: string }) {
  const { entries } = useTodayDeck(entityId);
  const cards = useMemo(() => buildDeck(entries), [entries]);
  if (cards.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.deckHead}>
        <Text style={styles.deckTitle} accessibilityRole="header">
          Hoy, por cómo te pagaron
        </Text>
        <Text style={styles.label}>Entró {formatPesos(deckEntered(cards))}</Text>
      </View>
      <MethodDeck cards={cards} mode="plata" timeOf={timeOf} />
    </View>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
      <View style={styles.legendHead}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.legendValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** Sin movimientos todavía: lo que ya se sabe por la agenda y por lo que contó el dueño. */
function FirstDays({ entityId }: { entityId: string }) {
  const router = useRouter();
  const setup = useFinanceSetup(entityId);
  const today = todayCO();
  const agenda = useQuery({ queryKey: ['agenda', entityId, today, 'finance'], queryFn: () => agendaApi.agenda(entityId, startCO(today), startCO(addDays(today, 1))), enabled: Boolean(entityId), staleTime: 60_000 });
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const expected = expectedToday(agenda.data ?? [], items.data ?? []);
  const owed = setup.debts.filter((d) => d.kind === 'customer').reduce((s, d) => s + d.amount, 0);
  const facts: [string, string][] = [
    ...(expected.total > 0 ? ([['Hoy esperas', formatPesos(expected.total)]] as [string, string][]) : []),
    ...(setup.monthly ? ([['Gastos del mes', formatPesos(setup.monthly)]] as [string, string][]) : []),
    ...(owed > 0 ? ([['Te deben', formatPesos(owed)]] as [string, string][]) : []),
  ];
  const goSale = () => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } });
  return (
    <>
      {setup.cash !== null || facts.length > 0 ? (
        <View style={[styles.card, { padding: 16, gap: 14 }]}>
          {setup.cash !== null ? (
            <View>
              <Text style={styles.label}>Dijiste que tienes en caja</Text>
              <Text style={styles.hero}>{formatPesos(setup.cash)}</Text>
            </View>
          ) : null}
          {facts.length > 0 ? <Mini3 items={facts} /> : null}
        </View>
      ) : null}
      <EmpreAICard title="Lo que ya se puede saber">
        <View>
          {expected.count > 0 ? <SystemRow first icon="calendar-outline" title={expected.total > 0 ? `Hoy esperas ${formatPesos(expected.total)}` : `Hoy tienes ${expected.count === 1 ? '1 cita' : `${expected.count} citas`}`} sub={expected.total > 0 ? `${expected.priced === 1 ? '1 cita confirmada' : `${expected.priced} citas confirmadas`}, con el precio de tu catálogo. Cuenta cuando las cobres` : 'Con precio en tu catálogo, te decimos cuánto esperar'} /> : null}
          {setup.monthly ? <SystemRow first={expected.count === 0} icon="wallet-outline" title={`Este mes necesitas cubrir ${formatPesos(setup.monthly)}`} sub="Lo que nos contaste que pagas cada mes" /> : null}
          <SystemRow first={expected.count === 0 && !setup.monthly} icon="bar-chart-outline" title="Con 3 ventas verás tu primer resumen" sub="Te toma dos toques cada una" />
        </View>
      </EmpreAICard>
      <SystemGroup>
        <SystemRow first icon="add-outline" title="Registrar tu primera venta" sub="Aquí empieza a verse qué entra" onPress={goSale} />
        {!setup.done ? <SystemRow icon="help-circle-outline" title="Cuéntanos tres cosas" sub="Tu caja, quién te debe y lo que pagas al mes. Son opcionales" onPress={() => router.push({ pathname: '/business/ledger/arranque/[id]', params: { id: entityId } })} /> : null}
      </SystemGroup>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, gap: 24 },
  main: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  mainTop: { gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  label: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  hero: { fontSize: 34, lineHeight: 38, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  rangeBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barSlot: { flex: 1, minWidth: 0, minHeight: 98, justifyContent: 'flex-end', alignItems: 'center', gap: 4, paddingVertical: 4, borderRadius: 8 },
  barSlotOn: { backgroundColor: colors.selectedSoft },
  barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, maxWidth: '100%' },
  bar: { width: 9, flexShrink: 1, borderRadius: 3 },
  barLabel: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  legend: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  legendHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 3 },
  legendValue: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  noMoves: { minHeight: 58, paddingVertical: 18, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  card: { gap: spacing.sm, padding: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  cardTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  deckHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  deckTitle: { flexShrink: 1, fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
});
