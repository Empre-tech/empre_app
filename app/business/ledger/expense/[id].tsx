import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ledgerApi, type InventoryItem } from '@/api/ledger';
import { DoneMark, FlowHeader, useFlowBack, useFlowStep } from '@/components/ledger/Flow';
import { AmountField, Chip, LedgerReceipt, PartyPicker, type PartyChoice } from '@/components/ledger/parts';
import { fmtQty, normalize, packToUnits } from '@/lib/inventory';
import { categoryLabel, EXPENSE_CATEGORIES, formatPesos, METHOD_LABEL, newClientId, type PayMethod } from '@/lib/ledger';
import { queueExpense, queueVoid } from '@/ledger/ledgerStore';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

const PAY_ALL: PayMethod[] = ['cash', 'transfer', 'card', 'credit'];
const PAY_ICON: Record<PayMethod, keyof typeof Ionicons.glyphMap> = { cash: 'cash-outline', transfer: 'phone-portrait-outline', card: 'card-outline', credit: 'time-outline' };
const PANES = ['what', 'pay', 'done'] as const;

/** Un producto o insumo que se compró. Los textos son lo que el dueño escribe; se convierten al guardar. */
interface BuyLine {
  item: InventoryItem;
  qty: string;
  cost: string;
  /** Compró en pacas/bultos: la cantidad son pacas y el costo es el de la paca. */
  pack: boolean;
}

const num = (t: string) => Number(t.replace(/\./g, '').replace(',', '.'));

/** Resultado de una línea en unidades y costo por unidad (null si está incompleta). */
function lineUnits(l: BuyLine): { qty: number; unitCost: number } | null {
  const q = num(l.qty);
  const c = num(l.cost);
  if (!(q > 0) || !Number.isFinite(c) || c < 0) return null;
  if (l.pack) return l.item.pack_size ? packToUnits(q, l.item.pack_size, c) : null;
  return { qty: q, unitCost: Math.round(c) };
}

/** Registrar un gasto (lienzo VentaPagos): 1 · Qué compraste o pagaste, 2 · Cuánto, 3 · Cómo se pagó y 4 · Listo. */
export default function NewExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pane, setPane] = useState<'what' | 'pay'>('what');

  const inv = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const [buy, setBuy] = useState<BuyLine[]>([]);
  const [find, setFind] = useState('');
  const [manual, setManual] = useState<number | null>(null);
  const done = buy.map(lineUnits).filter((x): x is { qty: number; unitCost: number } => x !== null);
  const linesTotal = done.reduce((t, x) => t + Math.round(x.qty * x.unitCost), 0);
  const amount = manual ?? linesTotal;
  const setAmount = (n: number) => setManual(n);

  const matches = useMemo(() => {
    const q = normalize(find);
    if (!q) return [];
    return (inv.data?.items ?? []).filter((i) => !i.is_service && !buy.some((b) => b.item.ref === i.ref) && normalize(i.name).includes(q)).slice(0, 6);
  }, [find, inv.data, buy]);

  const lowSupplies = useMemo(
    () => (inv.data?.items ?? []).filter((i) => !i.is_service && (i.status === 'low' || i.status === 'out') && !buy.some((b) => b.item.ref === i.ref)).slice(0, 6),
    [inv.data, buy],
  );

  const addLine = (item: InventoryItem) => {
    setBuy((l) => [...l, { item, qty: item.last_purchase ? String(item.last_purchase) : '', cost: item.cost ? String(item.cost) : '', pack: false }]);
    setFind('');
    setManual(null);
  };
  const patchLine = (ref: string, p: Partial<BuyLine>) => {
    setBuy((l) => l.map((x) => (x.item.ref === ref ? { ...x, ...p } : x)));
    setManual(null);
  };

  const [category, setCategory] = useState('mercancia');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [supplier, setSupplier] = useState<PartyChoice | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<{ clientId: string; amount: number; text: string; voided: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { shown, style: flowStyle } = useFlowStep<(typeof PANES)[number]>(saved ? 'done' : pane, PANES);

  const reset = () => {
    setManual(null);
    setBuy([]);
    setFind('');
    setCategory('mercancia');
    setMethod('cash');
    setSupplier(null);
    setNote('');
    setSaved(null);
    setPane('what');
    setError(null);
  };

  const save = () => {
    if (saved) {
      reset();
      return;
    }
    if (buy.some((b) => lineUnits(b) === null)) return setError('Completa la cantidad y el costo de cada producto, o quítalo.');
    if (amount <= 0) return setError('Escribe cuánto fue el gasto.');
    if (method === 'credit' && !supplier) return setError('Una compra a crédito necesita el proveedor.');
    const clientId = newClientId();
    queueExpense(entityId, {
      client_id: clientId,
      amount,
      category,
      method,
      party_id: supplier?.id,
      note: note.trim() || undefined,
      lines:
        category === 'mercancia' && buy.length > 0
          ? buy.map((b) => {
              const u = lineUnits(b) as { qty: number; unitCost: number };
              return b.item.kind === 'supply'
                ? { stock_item_id: b.item.ref, name: b.item.name, qty: u.qty, unit_cost: u.unitCost }
                : { item_id: b.item.item_id ?? b.item.ref, name: b.item.name, qty: u.qty, unit_cost: u.unitCost };
            })
          : undefined,
    });
    setError(null);
    const mText = method === 'credit' ? `A crédito${supplier ? ` · ${supplier.name}` : ''}` : METHOD_LABEL[method];
    setSaved({ clientId, amount, text: `${categoryLabel(category)} · ${mText}`, voided: false });
  };

  const primaryTitle = saved
    ? 'Nuevo gasto'
    : amount > 0
      ? `Guardar gasto ${formatPesos(amount)}`
      : 'Escribe cuánto fue';

  const backToWhat = useCallback(() => setPane('what'), []);
  useFlowBack(!saved && pane === 'pay' ? backToWhat : null);
  const switchKind = (k: 'sale' | 'expense') => {
    if (k === 'sale') router.replace({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } });
  };
  /** Elegir un tipo de gasto lleva al siguiente paso; en «mercancía» aún puedes anotar qué compraste. */
  const pickCategory = (key: string) => {
    setCategory(key);
    if (key !== 'mercancia') goPay();
  };
  const goPay = () => {
    if (buy.some((b) => lineUnits(b) === null)) return setError('Completa la cantidad y el costo de cada producto, o quítalo.');
    setError(null);
    setPane('pay');
  };
  const stepN = saved ? 3 : pane === 'pay' ? 2 : 1;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlowHeader title={saved ? 'Listo' : pane === 'pay' ? categoryLabel(category) : 'Nuevo gasto'} step={stepN} steps={3} label={saved ? 'Listo' : pane === 'pay' ? 'Cuánto y cómo' : 'Qué compraste o pagaste'} onBack={!saved && pane === 'pay' ? backToWhat : undefined} kind={!saved && pane === 'what' ? 'expense' : undefined} onKind={switchKind} />
      <Animated.View style={[{ flex: 1 }, flowStyle]}>
        {shown === 'done' && saved ? (
          <ScrollView contentContainerStyle={styles.doneBody}>
            <DoneMark voided={saved.voided} />
            <View style={styles.doneText}>
              <Text style={styles.doneTitle} accessibilityRole="header">
                {saved.voided ? 'Gasto anulado' : 'Gasto registrado'}
              </Text>
              <Text style={styles.doneTotal}>{formatPesos(saved.amount)}</Text>
              <Text style={styles.doneSub}>{saved.text}</Text>
            </View>
            <View style={{ alignSelf: 'stretch' }}>
              <LedgerReceipt
                title={saved.voided ? 'Gasto anulado' : 'Registrado en Empre Finance'}
                subtitle={saved.voided ? 'Se revirtió también el inventario' : `${formatPesos(saved.amount)} · ${saved.text}`}
                voided={saved.voided}
                onVoid={() => {
                  queueVoid('expense', entityId, saved.clientId, 'Deshecho al momento');
                  setSaved((prev) => (prev ? { ...prev, voided: true } : null));
                }}
              />
            </View>
          </ScrollView>
        ) : shown === 'pay' ? (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.bill}>
              <Text style={styles.billLabel}>¿Cuánto fue?</Text>
              <AmountField value={amount} onChange={setAmount} autoFocus={amount <= 0} />
            </View>
            <View style={{ gap: 10 }}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                ¿Cómo lo pagaste?
              </Text>
              <View style={styles.methods}>
                {PAY_ALL.map((m) => {
                  const on = method === m;
                  return (
                    <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setMethod(m)} style={[styles.method, on && styles.methodOn]}>
                      <Ionicons name={PAY_ICON[m]} size={24} color={colors.ink} />
                      <Text style={styles.methodText}>{m === 'credit' ? 'A crédito' : METHOD_LABEL[m]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {method === 'credit' ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.label}>Proveedor (lo recordamos)</Text>
                <PartyPicker entityId={entityId} kind="supplier" value={supplier} onChange={setSupplier} />
                {supplier ? <Text style={styles.hintText}>Queda como deuda con {supplier.name}. La ves en Deudas y la pagas cuando quieras.</Text> : null}
              </View>
            ) : null}
            <TextInput value={note} onChangeText={setNote} placeholder="Agregar una nota (opcional)" placeholderTextColor={colors.faint} style={styles.note} maxLength={200} accessibilityLabel="Nota del gasto" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.question} accessibilityRole="header">
              ¿Qué compraste o pagaste?
            </Text>
            <View style={styles.methods}>
              {EXPENSE_CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  <Pressable key={c.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pickCategory(c.key)} style={[styles.catTile, on && styles.methodOn]}>
                    <Text style={styles.methodText}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {category === 'mercancia' ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={styles.label}>¿Qué compraste? (opcional)</Text>
                <Text style={styles.hintText}>Si lo anotas, tu inventario sube solo y se actualiza lo que te cuesta cada producto.</Text>
            {lowSupplies.length > 0 ? (
              <View style={{ gap: 6 }}>
                <Text style={styles.eyebrow}>SE ESTÁN ACABANDO</Text>
                <View style={styles.wrap}>
                  {lowSupplies.map((m) => (
                    <Chip key={m.ref} icon="add" label={m.name} selected={false} onPress={() => addLine(m)} />
                  ))}
                </View>
              </View>
            ) : null}
            {buy.map((b) => {
              const u = lineUnits(b);
              return (
                <View key={b.item.ref} style={styles.buyRow}>
                  <View style={styles.buyHead}>
                    <Text style={styles.buyName} numberOfLines={1}>
                      {b.item.name}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar ${b.item.name}`}
                      onPress={() => {
                        if (saved) return;
                        setBuy((l) => l.filter((x) => x.item.ref !== b.item.ref));
                        setManual(null);
                      }}
                      hitSlop={10}
                    >
                      <Ionicons name="close" size={20} color={colors.muted} />
                    </Pressable>
                  </View>
                  <View style={styles.buyInputs}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tiny}>{b.pack ? 'Pacas' : 'Cantidad'}</Text>
                      <TextInput
                        value={b.qty}
                        editable={!saved}
                        onChangeText={(t) => patchLine(b.item.ref, { qty: t })}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                        style={styles.buyInput}
                        accessibilityLabel={`Cantidad de ${b.item.name}`}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tiny}>{b.pack ? 'Costo de la paca' : 'Costo de cada uno'}</Text>
                      <TextInput
                        value={b.cost}
                        editable={!saved}
                        onChangeText={(t) => patchLine(b.item.ref, { cost: t })}
                        keyboardType="number-pad"
                        placeholder="$"
                        placeholderTextColor={colors.muted}
                        style={styles.buyInput}
                        accessibilityLabel={`Costo de ${b.item.name}`}
                      />
                    </View>
                  </View>
                  {b.item.pack_size ? (
                    <Chip
                      label={b.pack ? `En pacas de ${b.item.pack_size}` : `Compré en pacas de ${b.item.pack_size}`}
                      selected={b.pack}
                      onPress={() => !saved && patchLine(b.item.ref, { pack: !b.pack, cost: '' })}
                    />
                  ) : null}
                  {u ? <Text style={styles.tiny}>Entran {fmtQty(u.qty)} unidades · {formatPesos(u.unitCost)} c/u</Text> : null}
                </View>
              );
            })}
            <TextInput
              value={find}
              editable={!saved}
              onChangeText={setFind}
              placeholder="Busca un producto o insumo"
              placeholderTextColor={colors.muted}
              style={styles.note}
              accessibilityLabel="Buscar lo que compraste"
            />
            {matches.length > 0 ? (
              <View style={styles.wrap}>
                {matches.map((m) => (
                  <Chip key={m.ref} icon="add" label={m.name} selected={false} onPress={() => addLine(m)} />
                ))}
              </View>
            ) : null}
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        )}
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {saved ? (
          <>
            <Pressable accessibilityRole="button" onPress={reset} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Nuevo gasto</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Volver a Finanzas</Text>
            </Pressable>
          </>
        ) : pane === 'pay' ? (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: amount <= 0 }} disabled={amount <= 0} onPress={save} style={[styles.primaryBtn, amount <= 0 && styles.primaryBtnDisabled]}>
            <Text style={[styles.primaryBtnText, amount <= 0 && styles.primaryBtnTextDisabled]}>{primaryTitle}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={goPay} style={[styles.primaryBtn, styles.nextBtn]}>
            <Text style={styles.primaryBtnText}>{amount > 0 ? `Seguir · ${formatPesos(amount)}` : 'Seguir'}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  question: { fontSize: 26, lineHeight: 30, letterSpacing: -0.4, fontFamily: fonts.display.bold, color: colors.ink },
  sectionTitle: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  bill: { gap: 8, padding: 16, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  billLabel: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  method: { width: '48.5%', minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  catTile: { width: '48.5%', minHeight: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  methodOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  methodText: { textAlign: 'center', fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  doneBody: { alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  doneText: { alignItems: 'center', gap: 2 },
  doneTitle: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  doneTotal: { fontSize: 40, lineHeight: 46, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  doneSub: { textAlign: 'center', fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted },
  secondaryBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  nextBtn: { flexDirection: 'row', gap: 8 },
  body: { paddingHorizontal: spacing.lg, paddingTop: 6, paddingBottom: spacing.xl, gap: 14 },
  label: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  eyebrow: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.8, color: colors.faint },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface },
  hintText: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  buyRow: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  buyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buyName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  buyInputs: { flexDirection: 'row', gap: spacing.sm },
  buyInput: { minHeight: 46, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink, backgroundColor: colors.bg },
  tiny: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  primaryBtn: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: colors.hairline,
  },
  primaryBtnDone: {
    backgroundColor: colors.selectedSoft,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: fonts.ui.extrabold,
    color: colors.surface,
  },
  primaryBtnTextDisabled: {
    color: colors.faint,
  },
  primaryBtnTextDone: {
    color: colors.ink,
  },
});
