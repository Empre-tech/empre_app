import { Ionicons } from '@/components/Icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { reviewsApi } from '@/api/endpoints';
import { goalsApi } from '@/api/goals';
import { ledgerApi } from '@/api/ledger';
import { novedadesApi } from '@/api/novedades';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { FEATURES } from '@/config';
import {
  daySummary,
  FILTER_LABEL,
  filterCounts,
  fromAppointments,
  fromExpenses,
  fromReviews,
  fromSales,
  goalProgress,
  matches,
  monthName,
  onDay,
  suggestedTarget,
  type ActivityFilter,
  type ActivityItem,
  type ActivityKind,
  type Goal,
} from '@/lib/activity';
import { addDays, todayCO } from '@/lib/finance';
import { categoryLabel, formatPesos, METHOD_LABEL } from '@/lib/ledger';
import { colors, fonts, spacing } from '@/theme';

const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const WEEKDAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Cada tipo con su color, solo en su ícono (tablero «Actividad y meta»): plata en verde, clientes en rojo, gastos en arena. */
const LOOK: Record<ActivityKind, { icon: keyof typeof Ionicons.glyphMap; tint: string; ink: string; value: string }> = {
  venta: { icon: 'add', tint: colors.financeSoft, ink: colors.finance, value: colors.finance },
  oferta: { icon: 'pricetag-outline', tint: colors.accentSoft, ink: colors.accentInk, value: colors.finance },
  cita: { icon: 'calendar-outline', tint: colors.primarySoft, ink: colors.primaryDark, value: colors.finance },
  fiado: { icon: 'cash-outline', tint: colors.selectedSoft, ink: colors.ink, value: colors.ink },
  gasto: { icon: 'remove', tint: colors.selectedSoft, ink: colors.ink, value: colors.ink },
  resena: { icon: 'star-outline', tint: colors.primarySoft, ink: colors.primaryDark, value: colors.ink },
};

/**
 * Actividad y meta (tablero «Actividad y meta», 2026-11-15): la meta del mes al centro, los días, qué ver y lo que pasó
 * en orden, cada cosa con de dónde vino. Tocar un movimiento muestra qué fue y lleva a su detalle en Finance. Abajo, la
 * semana en un vistazo. Solo hechos anotados: seguidores uno a uno, «me gusta» y quién cambió qué aún no los trae el
 * servidor, y no se inventan.
 */
export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const today = todayCO();
  const month = today.slice(0, 7);
  const [day, setDay] = useState(today);
  const [filter, setFilter] = useState<ActivityFilter>('todo');
  const [open, setOpen] = useState<ActivityItem | null>(null);
  const [editing, setEditing] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -6 + i));
  const on = Boolean(entityId) && FEATURES.ledger;

  const sales = useQuery({ queryKey: ['ledger', entityId, 'sales', day], queryFn: () => ledgerApi.sales(entityId, { from: day, to: day, limit: 200 }), enabled: on, retry: false });
  const expenses = useQuery({ queryKey: ['ledger', entityId, 'expenses', day], queryFn: () => ledgerApi.expenses(entityId, { from: day, to: day, limit: 200 }), enabled: on, retry: false });
  const agenda = useQuery({ queryKey: ['agenda', entityId, 'activity', day], queryFn: () => agendaApi.agenda(entityId, startCO(day), startCO(addDays(day, 1))), enabled: Boolean(entityId) && FEATURES.agenda, retry: false });
  const reviews = useQuery({ queryKey: ['reviews', entityId, 'activity'], queryFn: () => reviewsApi.page(entityId, { pageSize: 30 }), enabled: Boolean(entityId), staleTime: 60_000 });
  const goal = useQuery({ queryKey: ['goal', entityId, month], queryFn: () => goalsApi.get(entityId, month), enabled: Boolean(entityId), retry: false });
  const monthTotals = useQuery({
    queryKey: ['ledger', entityId, 'analytics', `${month}-01`, today, 'prev'],
    queryFn: () => ledgerApi.analytics(entityId, { from: `${month}-01`, to: today, compare: 'prev' }),
    enabled: on,
    retry: false,
    staleTime: 60_000,
  });
  const week = useQuery({
    queryKey: ['ledger', entityId, 'analytics', addDays(today, -6), today, 'prev'],
    queryFn: () => ledgerApi.analytics(entityId, { from: addDays(today, -6), to: today, compare: 'prev' }),
    enabled: on,
    retry: false,
    staleTime: 60_000,
  });
  const followers = useQuery({ queryKey: ['followers', entityId], queryFn: () => novedadesApi.followers(entityId), enabled: Boolean(entityId) });
  // El mes pasado completo: de ahí sale la meta que se propone (sin historia, no se propone nada).
  const prevEnd = addDays(`${month}-01`, -1);
  const prevStart = `${prevEnd.slice(0, 7)}-01`;
  const lastMonth = useQuery({
    queryKey: ['ledger', entityId, 'analytics', prevStart, prevEnd, 'prev'],
    queryFn: () => ledgerApi.analytics(entityId, { from: prevStart, to: prevEnd, compare: 'prev' }),
    enabled: on && editing,
    retry: false,
    staleTime: 10 * 60_000,
  });

  const all = useMemo(
    () => onDay([...fromSales(sales.data ?? []), ...fromExpenses(expenses.data ?? []), ...fromReviews(reviews.data?.data ?? []), ...fromAppointments(agenda.data ?? [], timeOf)], day),
    [sales.data, expenses.data, reviews.data, agenda.data, day],
  );
  const shown = all.filter((i) => matches(i, filter));
  const counts = filterCounts(all);
  const loading = sales.isLoading || expenses.isLoading;

  const g = goal.data;
  const doneOf = (kind: Goal['kind']) => (kind === 'left' ? (monthTotals.data?.current.left ?? monthTotals.data?.current.profit ?? 0) : (monthTotals.data?.current.sales_total ?? 0));
  const progress = g ? goalProgress(g, doneOf(g.kind), today) : null;
  const weekReviews = (reviews.data?.data ?? []).filter((r) => Date.parse(r.created_at) >= Date.parse(startCO(addDays(today, -6)))).length;
  const wk = week.data;
  const weekLeft = wk ? (wk.current.left ?? wk.current.profit) : null;
  const weekPrevLeft = wk ? (wk.previous.left ?? wk.previous.profit) : null;
  const weekDiff = weekLeft !== null && weekPrevLeft ? Math.round(((weekLeft - weekPrevLeft) / Math.abs(weekPrevLeft)) * 100) : null;

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Actividad" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 28 }]}>
        {/* La meta, al centro: lo que da sentido a todo lo que pasa */}
        {g && progress ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Meta de ${monthName(month)}: ${progress.pct}%. Cambiar la meta`} onPress={() => setEditing(true)} style={styles.goal}>
            <View style={styles.ring}>
              <View style={[styles.ringFill, { height: `${progress.pct}%` }]} />
              <Text style={styles.ringText}>{`${progress.pct}%`}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={styles.goalLabel}>{`Meta de ${monthName(month)} · ${g.kind === 'left' ? 'lo que te queda' : 'ventas'}`}</Text>
              <Text style={styles.goalValue}>{formatPesos(doneOf(g.kind))}</Text>
              <Text style={styles.goalSub}>{progress.reached ? `Llegaste a ${formatPesos(g.target)}` : `de ${formatPesos(g.target)} · faltan ${progress.daysLeft} ${progress.daysLeft === 1 ? 'día' : 'días'}`}</Text>
              {!progress.reached && progress.daysLeft > 0 ? (
                <Text style={styles.goalPace}>{`Para llegar, ${formatPesos(progress.perDay)} al día. Tu día normal deja ${formatPesos(progress.normalDay)}.`}</Text>
              ) : null}
            </View>
          </Pressable>
        ) : goal.isLoading ? null : (
          <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={styles.goalEmpty}>
            <Ionicons name="flag-outline" size={20} color={colors.ink} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.goalLabelInk}>{`Ponle una meta a ${monthName(month)}`}</Text>
              <Text style={styles.goalSub}>Una sola: lo que quieres vender o lo que te quede. Te dice cuánto hace falta al día.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
          </Pressable>
        )}

        {/* Los días: el periodo que se mira */}
        <View style={styles.days}>
          {days.map((d) => {
            const sel = d === day;
            return (
              <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={d === today ? 'Hoy' : d} onPress={() => setDay(d)} style={[styles.day, sel && styles.daySel]}>
                <Text style={[styles.dayWeek, sel && styles.dayTextSel]}>{d === today ? 'hoy' : WEEKDAY[new Date(`${d}T12:00:00-05:00`).getDay()]}</Text>
                <Text style={[styles.dayNum, sel && styles.dayTextSel]}>{Number(d.slice(8, 10))}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Qué ver: cada tipo con cuántos hay */}
        {all.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {counts.map((f) => {
              const sel = f.key === filter;
              return (
                <Pressable key={f.key} accessibilityRole="button" accessibilityState={{ selected: sel }} onPress={() => setFilter(f.key)} style={[styles.filter, sel && styles.filterSel]}>
                  <Text style={[styles.filterText, sel && { color: colors.onPrimary }]}>{`${FILTER_LABEL[f.key]} ${f.n}`}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        <Text style={styles.summary} accessibilityLiveRegion="polite">
          {loading ? 'Cargando lo que pasó…' : daySummary(all)}
        </Text>

        {/* Lo que pasó, en orden: cada tarjeta dice de dónde viene, qué fue y a qué hora */}
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={{ gap: 8 }}>
            {shown.map((i) => {
              const look = LOOK[i.kind];
              return (
                <Pressable key={i.id} accessibilityRole="button" accessibilityLabel={`${i.from}. ${i.title}. ${timeOf(i.at)}${i.value ? `. ${i.value}` : ''}`} onPress={() => setOpen(i)} style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}>
                  <View style={[styles.itemIcon, { backgroundColor: look.tint }]}>
                    <Ionicons name={look.icon} size={17} color={look.ink} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={styles.itemFrom} numberOfLines={1}>
                      {i.from}
                    </Text>
                    <Text style={styles.itemTitle} numberOfLines={2}>
                      {i.title}
                    </Text>
                    <Text style={styles.itemTime}>{timeOf(i.at)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {i.value ? <Text style={[styles.itemValue, { color: look.value }]}>{i.value}</Text> : null}
                    <Text style={[styles.itemTag, { backgroundColor: look.tint, color: look.ink }]}>{i.tag}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* El periodo en un vistazo: la plata y la gente de la semana */}
        {wk ? (
          <View style={styles.week}>
            <Text style={styles.weekTitle}>Esta semana</Text>
            {weekLeft !== null ? (
              <View style={{ gap: 2 }}>
                <Text style={styles.goalLabel}>Te quedaron</Text>
                <Text style={styles.goalValue}>{formatPesos(weekLeft)}</Text>
                <Text style={styles.goalSub}>{`Entró ${formatPesos(wk.current.entered ?? wk.current.sales_total)} · salió ${formatPesos(wk.current.out ?? wk.current.expenses_total)}`}</Text>
              </View>
            ) : null}
            <View style={styles.weekPeople}>
              <Text style={styles.weekLine}>{`${wk.current.sales_count} ${wk.current.sales_count === 1 ? 'venta' : 'ventas'}`}</Text>
              {weekReviews ? <Text style={styles.weekLine}>{`${weekReviews} ${weekReviews === 1 ? 'reseña nueva' : 'reseñas nuevas'}`}</Text> : null}
              {followers.data ? <Text style={styles.weekLine}>{`${followers.data} ${followers.data === 1 ? 'te sigue' : 'te siguen'}`}</Text> : null}
            </View>
            {weekDiff !== null ? (
              <Text style={styles.weekAi}>{`Empre AI · Esta semana vas ${Math.abs(weekDiff)} % ${weekDiff >= 0 ? 'arriba' : 'abajo'} de la anterior.`}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <MovementSheet item={open} onClose={() => setOpen(null)} onFinance={() => { setOpen(null); router.push({ pathname: '/business/ledger/[id]', params: { id: entityId } }); }} />
      {editing ? (
      <GoalSheet
        month={month}
        current={g ?? null}
        lastMonth={lastMonth.data ? { name: monthName(prevEnd.slice(0, 7)), sales: lastMonth.data.current.sales_total, left: lastMonth.data.current.left ?? lastMonth.data.current.profit } : null}
        onClose={() => setEditing(false)}
        onSave={async (next) => {
          await goalsApi.set(entityId, next);
          await queryClient.invalidateQueries({ queryKey: ['goal', entityId, month] });
          setEditing(false);
        }}
      />
      ) : null}
    </View>
  );
}

/** Un movimiento y su rastro: qué fue, de dónde vino y lo que se le hizo. El detalle completo vive en Finance. */
function MovementSheet({ item, onClose, onFinance }: { item: ActivityItem | null; onClose: () => void; onFinance: () => void }) {
  const insets = useSafeAreaInsets();
  const r = item?.ref;
  const rows: { k: string; v: string }[] = !r
    ? []
    : r.type === 'sale'
      ? [
          { k: 'Cómo pagó', v: `${METHOD_LABEL[r.sale.method] ?? r.sale.method}${r.sale.method2 && r.sale.amount2 ? ` + ${METHOD_LABEL[r.sale.method2]} ${formatPesos(r.sale.amount2)}` : ''}` },
          ...r.sale.lines.map((l) => ({ k: `${l.name} ×${l.qty}`, v: formatPesos(l.unit_price * l.qty) })),
          { k: 'De dónde vino', v: r.sale.source === 'offer_claim' ? 'Un canje de Empre Offers' : r.sale.source === 'appointment' ? 'Una cita por Empre' : r.sale.source === 'voice' ? 'La dictaste' : 'La anotaste' },
        ]
      : r.type === 'expense'
        ? [
            { k: 'En qué', v: categoryLabel(r.expense.category) },
            { k: 'Cómo pagaste', v: METHOD_LABEL[r.expense.method] ?? r.expense.method },
            ...(r.expense.party?.name ? [{ k: 'A quién', v: r.expense.party.name }] : []),
          ]
        : r.type === 'appointment'
          ? [
              { k: 'Para', v: timeOf(r.appointment.starts_at) },
              ...(r.appointment.service?.name ? [{ k: 'Servicio', v: r.appointment.service.name }] : []),
              { k: 'La pidió', v: timeOf(r.appointment.created_at) },
            ]
          : [{ k: 'Estrellas', v: '★'.repeat(Math.round(r.review.rating)) }, ...(r.review.verified ? [{ k: 'Respaldada', v: 'Por un canje en tu negocio' }] : [])];
  const money = r?.type === 'sale' || r?.type === 'expense';
  return (
    <Modal visible={Boolean(item)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={onClose} />
      {item ? (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.handle} />
          <Text style={styles.goalLabel}>{`${item.tag} · ${timeOf(item.at)}`}</Text>
          <Text style={styles.sheetTitle}>{item.title}</Text>
          {item.value ? <Text style={[styles.goalValue, { color: LOOK[item.kind].value }]}>{item.value}</Text> : null}
          <View style={styles.sheetCard}>
            {rows.map((x, i) => (
              <View key={`${x.k}-${i}`} style={[styles.sheetRow, i > 0 && styles.sheetLine]}>
                <Text style={styles.sheetKey} numberOfLines={2}>
                  {x.k}
                </Text>
                <Text style={styles.sheetVal} numberOfLines={2}>
                  {x.v}
                </Text>
              </View>
            ))}
          </View>
          {money ? (
            <Pressable accessibilityRole="button" onPress={onFinance} style={({ pressed }) => [styles.owner, pressed && { opacity: 0.85 }]}>
              <Text style={styles.ownerText}>Ver el detalle en Empre Finance</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.finance} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Modal>
  );
}

/** La meta del mes: una sola, la que elige el dueño. Se propone lo del mes pasado (si hay) un poco más arriba. */
function GoalSheet({ month, current, lastMonth, onClose, onSave }: { month: string; current: Goal | null; lastMonth: { name: string; sales: number; left: number } | null; onClose: () => void; onSave: (g: Goal) => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<Goal['kind']>(current?.kind ?? 'sales');
  const [text, setText] = useState(current ? String(current.target) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = Number(text.replace(/\D/g, ''));
  const base = lastMonth ? (kind === 'left' ? lastMonth.left : lastMonth.sales) : 0;
  const suggestion = suggestedTarget(base);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{`La meta de ${monthName(month)}`}</Text>
          <View style={styles.segment}>
            {(['sales', 'left'] as const).map((k) => (
              <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={[styles.segmentItem, kind === k && styles.segmentOn]}>
                <Text style={styles.segmentText}>{k === 'sales' ? 'Lo que vendo' : 'Lo que me queda'}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={text ? formatPesos(target) : ''}
            onChangeText={(v) => {
              setText(v.replace(/\D/g, ''));
              setError(null);
            }}
            keyboardType="number-pad"
            placeholder="$3.000.000"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            accessibilityLabel="Cuánto quieres en el mes"
          />
          {suggestion && !text ? (
            <Pressable accessibilityRole="button" onPress={() => setText(String(suggestion))} style={styles.suggest}>
              <Text style={styles.suggestText}>{`En ${lastMonth?.name} ${kind === 'left' ? 'te quedaron' : 'vendiste'} ${formatPesos(base)}: ¿${formatPesos(suggestion)}?`}</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={async () => {
              if (!target) {
                setError('Escribe cuánto quieres en el mes.');
                return;
              }
              setSaving(true);
              try {
                await onSave({ month, kind, target });
              } catch {
                setError('No pudimos guardar tu meta. Inténtalo de nuevo.');
              } finally {
                setSaving(false);
              }
            }}
            style={({ pressed }) => [styles.save, (pressed || saving) && { opacity: 0.85 }]}
          >
            <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar meta'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, paddingTop: spacing.sm, gap: 14 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  ring: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.financeSoft },
  ringFill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#BFDCC8' },
  ringText: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.finance },
  goalLabel: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  goalLabelInk: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  goalValue: { fontSize: 24, lineHeight: 29, fontFamily: fonts.display.bold, color: colors.finance, fontVariant: ['tabular-nums'] },
  goalSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  goalPace: { marginTop: 2, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  goalEmpty: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.nightSoft },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  daySel: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayWeek: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  dayNum: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dayTextSel: { color: colors.onPrimary},
  filters: { gap: 6 },
  filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  filterSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  summary: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  itemIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemFrom: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  itemTitle: { fontSize: 14.5, lineHeight: 19, fontFamily: fonts.ui.extrabold, color: colors.ink },
  itemTime: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  itemValue: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, fontVariant: ['tabular-nums'] },
  itemTag: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, fontSize: 11.5, fontFamily: fonts.ui.extrabold },
  week: { gap: 10, padding: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  weekTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  weekPeople: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  weekLine: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  weekAi: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.ink },
  veil: { flex: 1, backgroundColor: 'rgba(43,38,34,0.32)' },
  sheet: { gap: 10, paddingTop: 10, paddingHorizontal: 18, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.bg },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  sheetTitle: { fontSize: 19, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  sheetCard: { paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  sheetRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetLine: { borderTopWidth: 1, borderTopColor: colors.line },
  sheetKey: { flex: 1, fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted },
  sheetVal: { flexShrink: 1, fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'right' },
  owner: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 24, borderWidth: 1.5, borderColor: colors.finance, backgroundColor: colors.surface },
  ownerText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.finance },
  segment: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: colors.selectedSoft },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink },
  suggest: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.financeSoft },
  suggestText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.finance },
  error: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.danger },
  save: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: colors.finance },
  saveText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
});
