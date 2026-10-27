import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ledgerApi, type InventoryItem } from '@/api/ledger';
import { Button } from '@/components/Button';
import { AmountField, Chip, MethodChips, PartyPicker, type PartyChoice } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { fmtQty, normalize, packToUnits } from '@/lib/inventory';
import { EXPENSE_CATEGORIES, formatPesos, newClientId, type PayMethod } from '@/lib/ledger';
import { queueExpense, queueVoid } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

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

/** Registrar un gasto: monto, en qué fue y cómo se pagó. Una compra a crédito pide el proveedor y queda como deuda. */
export default function NewExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
  const addLine = (item: InventoryItem) => {
    setBuy((l) => [...l, { item, qty: '', cost: item.cost ? String(item.cost) : '', pack: false }]);
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
  const [saved, setSaved] = useState<{ clientId: string; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setManual(null);
    setBuy([]);
    setFind('');
    setCategory('mercancia');
    setMethod('cash');
    setSupplier(null);
    setNote('');
    setSaved(null);
    setError(null);
  };

  const save = () => {
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
      lines: category === 'mercancia' && buy.length > 0
        ? buy.map((b) => {
            const u = lineUnits(b) as { qty: number; unitCost: number };
            return b.item.kind === 'supply'
              ? { stock_item_id: b.item.ref, name: b.item.name, qty: u.qty, unit_cost: u.unitCost }
              : { item_id: b.item.item_id ?? b.item.ref, name: b.item.name, qty: u.qty, unit_cost: u.unitCost };
          })
        : undefined,
    });
    setError(null);
    setSaved({ clientId, amount });
  };

  if (saved) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Nuevo gasto" />
        <View style={styles.doneBody}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text style={styles.doneTitle}>Gasto guardado</Text>
          <Text style={styles.doneAmount}>{formatPesos(saved.amount)}</Text>
          <View style={{ gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.xl }}>
            <Button title="Otro gasto" onPress={reset} />
            <Button title="Listo" variant="secondary" onPress={() => router.back()} />
            <Button
              title="Deshacer este gasto"
              variant="ghost"
              onPress={() => {
                queueVoid('expense', entityId, saved.clientId, 'Deshecho al momento');
                router.back();
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubScreenHeader title="Nuevo gasto" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <AmountField value={amount} onChange={setAmount} autoFocus />

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>¿En qué fue?</Text>
          <View style={styles.wrap}>
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip key={c.key} label={c.label} selected={category === c.key} onPress={() => setCategory(c.key)} />
            ))}
          </View>
        </View>

        {category === 'mercancia' ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.label}>¿Qué compraste? (opcional)</Text>
            <Text style={styles.hintText}>Si lo anotas, tu inventario sube solo y se actualiza lo que te cuesta cada producto.</Text>
            {buy.map((b) => {
              const u = lineUnits(b);
              return (
                <View key={b.item.ref} style={styles.buyRow}>
                  <View style={styles.buyHead}>
                    <Text style={styles.buyName} numberOfLines={1}>{b.item.name}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${b.item.name}`} onPress={() => { setBuy((l) => l.filter((x) => x.item.ref !== b.item.ref)); setManual(null); }} hitSlop={10}>
                      <Ionicons name="close" size={20} color={colors.muted} />
                    </Pressable>
                  </View>
                  <View style={styles.buyInputs}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tiny}>{b.pack ? 'Pacas' : 'Cantidad'}</Text>
                      <TextInput value={b.qty} onChangeText={(t) => patchLine(b.item.ref, { qty: t })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.buyInput} accessibilityLabel={`Cantidad de ${b.item.name}`} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tiny}>{b.pack ? 'Costo de la paca' : 'Costo de cada uno'}</Text>
                      <TextInput value={b.cost} onChangeText={(t) => patchLine(b.item.ref, { cost: t })} keyboardType="number-pad" placeholder="$" placeholderTextColor={colors.muted} style={styles.buyInput} accessibilityLabel={`Costo de ${b.item.name}`} />
                    </View>
                  </View>
                  {b.item.pack_size ? (
                    <Chip label={b.pack ? `En pacas de ${b.item.pack_size}` : `Compré en pacas de ${b.item.pack_size}`} selected={b.pack} onPress={() => patchLine(b.item.ref, { pack: !b.pack, cost: '' })} />
                  ) : null}
                  {u ? <Text style={styles.tiny}>Entran {fmtQty(u.qty)} unidades · {formatPesos(u.unitCost)} c/u</Text> : null}
                </View>
              );
            })}
            <TextInput value={find} onChangeText={setFind} placeholder="Busca un producto o insumo" placeholderTextColor={colors.muted} style={styles.note} accessibilityLabel="Buscar lo que compraste" />
            {matches.length > 0 ? (
              <View style={styles.wrap}>
                {matches.map((m) => <Chip key={m.ref} icon="add" label={m.name} selected={false} onPress={() => addLine(m)} />)}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>¿Cómo se pagó?</Text>
          <MethodChips value={method} onChange={setMethod} expense />
        </View>

        {method === 'credit' ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.label}>Proveedor</Text>
            <PartyPicker entityId={entityId} kind="supplier" value={supplier} onChange={setSupplier} />
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>Nota (opcional)</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Ej. harina y huevos" placeholderTextColor={colors.muted} style={styles.note} maxLength={200} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title={amount > 0 ? `Guardar gasto · ${formatPesos(amount)}` : 'Guardar gasto'} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.xl },
  label: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface },
  hintText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  buyRow: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  buyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buyName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  buyInputs: { flexDirection: 'row', gap: spacing.sm },
  buyInput: { minHeight: 46, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink, backgroundColor: colors.bg },
  tiny: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  doneTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  doneAmount: { fontSize: 38, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.xs },
});
