import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type CashMoveInput } from '@/api/ledger';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { AmountField, Chip } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { queueCashClose, queueCashMove, queueVoid, useLedgerOutbox } from '@/ledger/ledgerStore';
import { cashReasonLabel, CASH_REASONS, formatPesos, newClientId, type CashDirection } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

const BILLS: { value: number; label: string; bg: string; fg: string }[] = [
  { value: 100000, label: '$100.000', bg: '#DDD3EC', fg: '#3D2A6B' },
  { value: 50000, label: '$50.000', bg: '#E8D3B5', fg: '#5A3D17' },
  { value: 20000, label: '$20.000', bg: '#F2C9A8', fg: '#6B3410' },
  { value: 10000, label: '$10.000', bg: '#E8B9C9', fg: '#6B1E3A' },
  { value: 5000, label: '$5.000', bg: '#D9C9A8', fg: '#5A4517' },
  { value: 2000, label: '$2.000', bg: '#C9D9E8', fg: '#1B3A73' },
  { value: 1000, label: '$1.000', bg: '#D5E3C9', fg: '#2F4F1B' },
];
const STEPS = ['Lo que debería haber', 'Contar', 'Resultado'];
const QUICK_AMOUNTS = [20000, 50000, 100000];
const PAID_SOMEONE = 'le_pague';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const signed = (n: number) => `${n < 0 ? '−' : '+'}${formatPesos(Math.abs(n))}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface MoveDraft {
  direction: CashDirection;
  amount: number;
  custom: boolean;
  reason: string | null;
}

/** Cerrar la caja: lo que debería haber en efectivo, contar billete por billete y ver si cuadra. Sacar o meter plata cambia lo que debería haber, no las ganancias. */
export default function CashScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const outbox = useLedgerOutbox();

  const cash = useQuery({ queryKey: ['ledger', entityId, 'cash'], queryFn: () => ledgerApi.cash(entityId), enabled: Boolean(entityId) });
  const [step, setStep] = useState(1);
  const [opening, setOpening] = useState(0);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [coins, setCoins] = useState(0);
  const [baseNext, setBaseNext] = useState<number | null>(null);
  const [draft, setDraft] = useState<MoveDraft | null>(null);

  const mine = useMemo(() => outbox.items.filter((x) => x.entityId === entityId && x.status === 'pending'), [outbox.items, entityId]);
  const queued = mine.filter((x) => x.kind === 'cash_move').map((x) => x.payload as unknown as CashMoveInput);
  const voiding = new Set(mine.filter((x) => x.kind === 'void_cash_move').map((x) => (x.payload as { id: string }).id));
  const unsent = mine.filter((x) => x.kind === 'sale' || x.kind === 'expense' || x.kind === 'payment').length;

  const data = cash.data;
  const moves = [
    ...(data?.moves ?? []).filter((m) => m.status === 'active' && !voiding.has(m.id)).map((m) => ({ id: m.id, direction: m.direction, amount: m.amount, reason: m.reason, at: m.occurred_at })),
    ...queued.map((m) => ({ id: m.client_id, direction: m.direction, amount: m.amount, reason: m.reason, at: m.occurred_at ?? new Date().toISOString() })),
  ];
  const flow = data?.flow;
  const baseKnown = data?.base_known ?? false;
  const base = baseKnown ? (data?.base ?? 0) : opening;
  const movesNet = moves.reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);
  const expected = base + (flow ? flow.sales + flow.debts_in - flow.expenses - flow.debts_out : 0) + movesNet;

  const billsTotal = BILLS.reduce((s, b) => s + b.value * (counts[b.value] ?? 0), 0);
  const total = billsTotal + coins;
  const diff = total - expected;
  const matches = diff === 0;
  const leave = baseNext ?? Math.min(base > 0 ? base : total, total);
  const baseTooBig = leave > total;

  const setCount = (value: number, n: number) => setCounts((c) => ({ ...c, [value]: Math.max(0, Math.min(99999, n)) }));
  const openMove = (direction: CashDirection = 'out', amount = 0) => setDraft({ direction, amount, custom: amount > 0 && !QUICK_AMOUNTS.includes(amount), reason: null });
  const saveMove = () => {
    if (!draft?.reason || draft.amount <= 0) return;
    queueCashMove(entityId, { client_id: newClientId(), occurred_at: new Date().toISOString(), direction: draft.direction, amount: draft.amount, reason: draft.reason });
    setDraft(null);
  };
  const askVoid = (m: (typeof moves)[number]) =>
    Alert.alert('Quitar este movimiento', `${m.direction === 'in' ? 'Metiste' : 'Sacaste'} ${formatPesos(m.amount)}: ${cashReasonLabel(m.reason)}. Deja de contar en la caja.`, [
      { text: 'Dejarlo', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => queueVoid('cash_move', entityId, m.id, '') },
    ]);
  const closeDay = () => {
    if (!data || baseTooBig) return;
    queueCashClose(entityId, { day: data.day, opening: baseKnown ? undefined : opening, counted: total, base_next: leave });
    setStep(4);
  };
  const goExpense = () => {
    setDraft(null);
    router.push({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } });
  };
  const goSale = () => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } });

  const causes =
    diff < 0
      ? [
          { key: 'out', title: 'Sacaste plata y no la anotaste', body: 'Por ejemplo, para el almuerzo o para ti. Anótala y la cuenta se ajusta.', onPress: () => openMove('out', -diff) },
          { key: 'fiado', title: 'Alguien se llevó algo fiado y no lo anotaste', body: 'Regístralo como venta fiada: queda en «Te deben» y deja de contar en la caja.', onPress: goSale },
          { key: 'method', title: 'Una venta por transferencia quedó como efectivo', body: 'Vuelve a tus movimientos, anula esa venta y regístrala con el medio correcto.', onPress: () => router.back() },
        ]
      : [
          { key: 'in', title: 'Metiste plata y no la anotaste', body: 'Por ejemplo, sencillo para dar cambio. Anótala y la cuenta se ajusta.', onPress: () => openMove('in', diff) },
          { key: 'sale', title: 'Una venta en efectivo no quedó anotada', body: 'Regístrala ahora y entra en la cuenta del día.', onPress: goSale },
        ];

  if (cash.isLoading) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Cerrar la caja" />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} accessibilityLabel="Cargando la caja" />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Cerrar la caja" />
        <EmptyState icon="cloud-offline-outline" title="No pudimos traer tu caja" body="Revisa tu conexión e inténtalo otra vez. Lo que ya anotaste sigue guardado." action={{ title: 'Reintentar', onPress: () => void cash.refetch() }} />
      </View>
    );
  }

  const primary =
    step === 1
      ? { title: 'Contar lo que hay', disabled: false, onPress: () => setStep(2) }
      : step === 2
        ? { title: total > 0 ? `Listo, conté ${formatPesos(total)}` : 'Cuenta billetes y monedas', disabled: total === 0 && expected !== 0, onPress: () => setStep(3) }
        : step === 3
          ? { title: matches ? 'Cerrar el día' : 'Cerrar y anotar la diferencia', disabled: baseTooBig, onPress: closeDay }
          : { title: 'Volver a Finanzas', disabled: false, onPress: () => router.back() };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubScreenHeader title={step === 4 ? 'Día cerrado' : 'Cerrar la caja'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step < 4 ? (
          <View style={{ gap: spacing.xs }} accessibilityLabel={`Paso ${step} de 3: ${STEPS[step - 1]}`} accessible>
            <View style={styles.steps}>
            {STEPS.map((name, i) => {
              const n = i + 1;
              return (
                <View key={name} style={[styles.step, i < 2 && { flex: 1 }]}>
                  <View style={[styles.stepDot, n === step && styles.stepDotNow, n < step && styles.stepDotPast]}>
                    {n < step ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={[styles.stepNum, n === step && { color: '#fff' }]}>{n}</Text>}
                  </View>
                  {i < 2 ? <View style={[styles.stepBar, n < step && { backgroundColor: colors.verified }]} /> : null}
                </View>
              );
            })}
            </View>
            <Text style={styles.stepName}>{STEPS[step - 1]}</Text>
          </View>
        ) : null}

        {step === 1 ? (
          <>
            {data.close ? (
              <View style={styles.notice}>
                <Ionicons name="checkmark-circle" size={18} color={colors.verified} />
                <Text style={styles.noticeText}>Ya cerraste hoy con {formatPesos(data.close.counted)}. Si cierras otra vez, reemplaza ese cierre.</Text>
              </View>
            ) : null}
            <View style={styles.card}>
              <Text style={styles.eyebrow}>En efectivo deberías tener</Text>
              <Text style={styles.hero} accessibilityLiveRegion="polite">{formatPesos(expected)}</Text>
              {baseKnown ? (
                <CalcRow title="Base con la que abriste" sub={data.carried ? 'Lo que dejaste, más lo de los días sin cerrar' : 'Lo que dejaste en el último cierre'} value={formatPesos(data.base)} />
              ) : (
                <View style={styles.openingBox}>
                  <Text style={styles.rowTitle}>¿Con cuánto abriste hoy?</Text>
                  <Text style={styles.rowSub}>Solo te lo preguntamos la primera vez. Desde mañana sale de tu cierre.</Text>
                  <AmountField value={opening} onChange={setOpening} />
                </View>
              )}
              {flow && flow.sales > 0 ? <CalcRow title="Ventas en efectivo" sub={plural(flow.sales_count, 'venta', 'ventas')} value={signed(flow.sales)} good /> : null}
              {flow && flow.expenses > 0 ? <CalcRow title="Gastos en efectivo" sub={plural(flow.expenses_count, 'gasto', 'gastos')} value={signed(-flow.expenses)} /> : null}
              {flow && flow.debts_in > 0 ? <CalcRow title="Fiados que te pagaron" sub="En efectivo" value={signed(flow.debts_in)} good /> : null}
              {flow && flow.debts_out > 0 ? <CalcRow title="Abonos a proveedores" sub="En efectivo" value={signed(-flow.debts_out)} /> : null}
              {moves.map((m) => (
                <CalcRow key={m.id} title={`${m.direction === 'in' ? 'Metiste' : 'Sacaste'}: ${cashReasonLabel(m.reason).toLowerCase()}`} sub={`No es venta ni gasto · ${clock(m.at)}`} value={signed(m.direction === 'in' ? m.amount : -m.amount)} onPress={() => askVoid(m)} />
              ))}
            </View>
            {unsent > 0 ? <Text style={styles.warn}>Tienes {plural(unsent, 'registro', 'registros')} sin enviar. Cuando salgan, esta cuenta puede cambiar.</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => openMove()} style={({ pressed }) => [styles.moveLink, pressed && { opacity: 0.85 }]}>
              <Ionicons name="swap-vertical" size={19} color={colors.ink} />
              <Text style={styles.moveLinkText}>Saqué o metí plata</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <Text style={styles.note}>Transferencias y tarjeta no van en la caja: ya están en tu cuenta. Sacar o meter plata cambia lo que debería haber, no lo que te quedó.</Text>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.note}>Cuenta lo que hay y Empre suma por ti. Puedes tocar el número para escribirlo.</Text>
            <View style={styles.card}>
              {BILLS.map((b, i) => {
                const n = counts[b.value] ?? 0;
                return (
                  <View key={b.value} style={[styles.billRow, i > 0 && styles.line]}>
                    <View style={[styles.bill, { backgroundColor: b.bg }]}>
                      <Text style={[styles.billText, { color: b.fg }]}>{b.label}</Text>
                    </View>
                    <Text style={styles.billSum} numberOfLines={1}>{n ? formatPesos(n * b.value) : ''}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Quitar uno de ${b.label}`} disabled={n === 0} onPress={() => setCount(b.value, n - 1)} style={[styles.stepper, n === 0 && { opacity: 0.4 }]}>
                      <Ionicons name="remove" size={20} color={colors.ink} />
                    </Pressable>
                    <TextInput
                      value={String(n)}
                      onChangeText={(t) => setCount(b.value, Number(t.replace(/\D/g, '')) || 0)}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      maxLength={5}
                      accessibilityLabel={`Billetes de ${b.label}`}
                      style={styles.countInput}
                    />
                    <Pressable accessibilityRole="button" accessibilityLabel={`Agregar uno de ${b.label}`} onPress={() => setCount(b.value, n + 1)} style={styles.stepper}>
                      <Ionicons name="add" size={20} color={colors.ink} />
                    </Pressable>
                  </View>
                );
              })}
              <View style={[styles.coinsRow, styles.line]}>
                <Text style={styles.rowTitle}>Monedas</Text>
                <View style={styles.coinsField}>
                  <Text style={styles.coinsSign}>$</Text>
                  <TextInput
                    value={coins ? coins.toLocaleString('es-CO').replace(/,/g, '.') : ''}
                    onChangeText={(t) => setCoins(Math.min(99999999, Number(t.replace(/\D/g, '')) || 0))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Total en monedas, en pesos"
                    style={styles.coinsInput}
                  />
                </View>
              </View>
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <View accessibilityLiveRegion="polite" style={[styles.result, matches ? styles.resultOk : styles.resultOff]}>
              <Ionicons name={matches ? 'checkmark-circle' : 'alert-circle'} size={26} color={matches ? colors.verified : colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle}>{matches ? 'La caja cuadra' : `${diff < 0 ? 'Faltan' : 'Sobran'} ${formatPesos(Math.abs(diff))}`}</Text>
                <Text style={styles.resultBody}>{matches ? `Contaste ${formatPesos(total)}, justo lo que debía haber.` : `Contaste ${formatPesos(total)} y debía haber ${formatPesos(expected)}.`}</Text>
              </View>
            </View>
            {!matches ? (
              <View style={styles.card}>
                <Text style={styles.eyebrow}>Puede ser</Text>
                {causes.map((c, i) => (
                  <Pressable key={c.key} accessibilityRole="button" onPress={c.onPress} style={({ pressed }) => [styles.causeRow, i > 0 && styles.line, pressed && { opacity: 0.85 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{c.title}</Text>
                      <Text style={styles.rowSub}>{c.body}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.card}>
              <Text style={styles.rowTitle}>Base para mañana</Text>
              <Text style={styles.rowSub}>Lo que dejas en la caja. Lo demás lo puedes guardar o consignar.</Text>
              <AmountField value={leave} onChange={setBaseNext} />
              {baseTooBig ? <Text style={styles.warn}>No puedes dejar más de lo que contaste ({formatPesos(total)}).</Text> : null}
            </View>
            {!matches ? <Text style={styles.note}>Si no sabes qué pasó, cierra igual: la diferencia queda anotada para revisarla y no cuenta como gasto del negocio.</Text> : null}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>Base para mañana</Text>
              <Text style={styles.hero}>{formatPesos(leave)}</Text>
              {base > leave ? <Text style={styles.rowSub}>Es menos que hoy ({formatPesos(base)}). Si te hace falta, mete plata mañana con «Saqué o metí plata».</Text> : null}
              <Text style={styles.closedLine}>
                {matches ? `La caja cuadró con ${formatPesos(total)}.` : `Quedó anotada una diferencia de ${formatPesos(Math.abs(diff))}. No cuenta como gasto del negocio.`}
              </Text>
            </View>
            <View style={styles.notice}>
              <Ionicons name="checkmark-circle" size={18} color={colors.verified} />
              <Text style={styles.noticeText}>
                Caja de hoy cerrada · {formatPesos(total)}
                {moves.length ? ` · ${plural(moves.length, 'movimiento de plata', 'movimientos de plata')}` : ''}
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.sm }]}>
        {step === 2 || step === 3 ? <Button title="Atrás" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
        <Button title={primary.title} disabled={primary.disabled} onPress={primary.onPress} style={{ flex: 2 }} />
      </View>

      <Modal visible={draft !== null} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setDraft(null)} />
          {draft ? (
            <ScrollView style={styles.sheet} contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + spacing.md }]} keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle} accessibilityRole="header">Saqué o metí plata</Text>
              <View style={styles.segment}>
                {(['out', 'in'] as const).map((d) => {
                  const on = draft.direction === d;
                  return (
                    <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setDraft({ ...draft, direction: d, reason: null })} style={[styles.segmentItem, on && styles.segmentOn]}>
                      <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{d === 'out' ? 'Saqué' : 'Metí'}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>¿Cuánto?</Text>
              <View style={styles.chips}>
                {QUICK_AMOUNTS.map((v) => (
                  <Chip key={v} label={formatPesos(v)} selected={!draft.custom && draft.amount === v} onPress={() => setDraft({ ...draft, amount: v, custom: false })} />
                ))}
                <Chip label="Otro" selected={draft.custom} onPress={() => setDraft({ ...draft, custom: true })} />
              </View>
              {draft.custom ? <AmountField value={draft.amount} onChange={(n) => setDraft({ ...draft, amount: n })} autoFocus={draft.amount === 0} /> : null}

              <Text style={styles.label}>¿Para qué?</Text>
              <View style={styles.chips}>
                {CASH_REASONS[draft.direction].map((r) => (
                  <Chip key={r.key} label={r.label} selected={draft.reason === r.key} onPress={() => setDraft({ ...draft, reason: r.key })} />
                ))}
                {draft.direction === 'out' ? <Chip label="Le pagué a alguien" selected={draft.reason === PAID_SOMEONE} onPress={() => setDraft({ ...draft, reason: PAID_SOMEONE })} /> : null}
              </View>

              {draft.reason === PAID_SOMEONE ? (
                <>
                  <Text style={styles.note}>Si le pagaste a alguien, es un gasto: regístralo como gasto en efectivo y aparece en tus números.</Text>
                  <Button title="Registrar el gasto" onPress={goExpense} />
                </>
              ) : (
                <Button
                  title={draft.amount <= 0 ? 'Elige cuánto' : !draft.reason ? 'Elige para qué' : `Anotar que ${draft.direction === 'in' ? 'metí' : 'saqué'} ${formatPesos(draft.amount)}`}
                  disabled={draft.amount <= 0 || !draft.reason}
                  onPress={saveMove}
                />
              )}
              <Button title="Cancelar" variant="ghost" onPress={() => setDraft(null)} />
            </ScrollView>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function CalcRow({ title, sub, value, good, onPress }: { title: string; sub: string; value: string; good?: boolean; onPress?: () => void }) {
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Text style={[styles.calcValue, good && { color: colors.verified }]}>{value}</Text>
    </>
  );
  if (!onPress) return <View style={[styles.calcRow, styles.line]}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityHint="Toca para quitarlo" onPress={onPress} style={({ pressed }) => [styles.calcRow, styles.line, pressed && { opacity: 0.85 }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  steps: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  stepDotNow: { backgroundColor: colors.ink, borderColor: colors.ink },
  stepDotPast: { backgroundColor: colors.verified, borderColor: colors.verified },
  stepNum: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  stepName: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  stepBar: { flex: 1, minWidth: 10, height: 2, borderRadius: 1, backgroundColor: colors.line },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  eyebrow: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  hero: { fontSize: 34, fontFamily: fonts.display.bold, color: colors.ink },
  openingBox: { gap: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  calcRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  line: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 1 },
  calcValue: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.verifiedSoft },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  moveLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  moveLinkText: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  note: { fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  warn: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.warning },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.sm },
  bill: { width: 84, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  billText: { fontSize: 13, fontFamily: fonts.ui.extrabold },
  billSum: { flex: 1, fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'right' },
  stepper: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  countInput: { width: 46, height: 44, padding: 0, textAlign: 'center', fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  coinsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  coinsField: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 136, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  coinsSign: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.muted },
  coinsInput: { flex: 1, padding: 0, textAlign: 'right', fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg },
  resultOk: { backgroundColor: colors.verifiedSoft },
  resultOff: { backgroundColor: colors.accentSoft },
  resultTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  resultBody: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.ink, marginTop: 2 },
  causeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingTop: spacing.sm },
  closedLine: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.ink },
  bar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  veil: { flex: 1, backgroundColor: 'rgba(11,26,54,0.45)' },
  sheet: { flexGrow: 0, maxHeight: '85%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.surface },
  sheetBody: { gap: spacing.sm, padding: spacing.lg },
  sheetTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  segmentTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  label: { marginTop: spacing.xs, fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
