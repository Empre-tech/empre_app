import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type InventoryItem } from '@/api/ledger';
import { Button } from '@/components/Button';
import { Chip } from '@/components/ledger/parts';
import { parsePriceInput } from '@/lib/catalog';
import { fmtQty } from '@/lib/inventory';
import { formatPesos, newClientId } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

type Method = 'cash' | 'transfer' | 'card';
const METHODS: { key: Method; label: string }[] = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'transfer', label: 'Transferencia' },
  { key: 'card', label: 'Tarjeta' },
];

interface Props {
  entityId: string;
  item: InventoryItem | null;
  onClose: () => void;
  onDone: () => void;
}

/**
 * «Ya llegó»: cuántos llegaron (con atajos: una paca, como la última vez) y, si quieres, cuánto pagaste. Se suma a lo
 * que hay, sale de agotado y la compra queda como gasto de mercancía con su nuevo costo.
 */
export function ArrivedSheet(props: Props) {
  // Cada ítem abre la hoja desde cero (la llave reinicia el estado).
  if (!props.item) return null;
  return <ArrivedBody key={props.item.ref} {...props} item={props.item} />;
}

function ArrivedBody({ entityId, item, onClose, onDone }: Props & { item: InventoryItem }) {
  const insets = useSafeAreaInsets();
  const [qty, setQty] = useState(() => (item.last_purchase ? fmtQty(item.last_purchase) : ''));
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (v: { qty: number; paid: number | null }) =>
      ledgerApi.arrived(entityId, item.ref, { client_id: newClientId(), qty: v.qty, ...(v.paid ? { paid: v.paid, method } : {}) }),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar. Revisa tu conexión.'),
  });

  const exact = item.mode === 'exact';
  const n = Number(qty.replace(',', '.'));
  const hasQty = qty.trim() !== '' && Number.isFinite(n) && n > 0;
  const paidN = parsePriceInput(paid);
  const unit = !item.unit || item.unit === 'unidad' ? 'unidades' : item.unit;
  const unitCost = hasQty && paidN ? Math.round(paidN / n) : null;
  const after = exact ? (item.counted ? item.qty : 0) + (hasQty ? n : 0) : null;
  const step = (d: number) => setQty(fmtQty(Math.max(0, (Number.isFinite(n) ? n : 0) + d)));

  const submit = () => {
    if (exact && !hasQty) return setError('Escribe cuántos llegaron.');
    if (qty.trim() !== '' && !hasQty) return setError('La cantidad debe ser un número mayor que cero.');
    if (paidN === undefined) return setError('Lo que pagaste debe ser un número, por ejemplo 380.000.');
    if (paidN && !hasQty) return setError('Para registrar lo que pagaste, di cuántos llegaron.');
    setError(null);
    save.mutate({ qty: hasQty ? n : 0, paid: paidN ?? null });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <View>
            <Text style={styles.title}>Llegó {item.name}</Text>
            <Text style={styles.meta}>{exact ? 'Se suma a lo que hay y vuelve a mostrarse disponible.' : 'Vuelve a «hay» y deja de verse agotado.'}</Text>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={styles.label}>{exact ? '¿Cuántos llegaron?' : '¿Cuántos llegaron? (opcional)'}</Text>
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel="Uno menos" onPress={() => step(-1)} style={styles.stepBtn}>
                <Ionicons name="remove" size={22} color={colors.ink} />
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <TextInput value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.count} accessibilityLabel="Cuántos llegaron" />
                <Text style={styles.meta}>{unit}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Uno más" onPress={() => step(1)} style={styles.stepBtn}>
                <Ionicons name="add" size={22} color={colors.ink} />
              </Pressable>
            </View>
            {item.pack_size || item.last_purchase ? (
              <View style={styles.wrap}>
                {item.pack_size ? <Chip label={`1 paca de ${item.pack_size}`} selected={hasQty && n === item.pack_size} onPress={() => setQty(String(item.pack_size))} /> : null}
                {item.last_purchase ? (
                  <Chip label={`Como la última vez: ${fmtQty(item.last_purchase)}`} selected={hasQty && n === item.last_purchase} onPress={() => setQty(fmtQty(item.last_purchase!))} />
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>
              ¿Cuánto pagaste? <Text style={styles.meta}>(opcional)</Text>
            </Text>
            <View style={styles.money}>
              <Text style={styles.moneySign}>$</Text>
              <TextInput value={paid} onChangeText={setPaid} keyboardType="numeric" placeholder="380.000" placeholderTextColor={colors.muted} style={styles.moneyInput} accessibilityLabel="Cuánto pagaste" />
            </View>
            {unitCost !== null ? (
              <Text style={styles.good}>
                Queda como gasto de mercancía · {formatPesos(unitCost)} c/u{item.cost != null && item.cost !== unitCost ? ` (antes ${formatPesos(item.cost)})` : ''}
              </Text>
            ) : null}
          </View>

          {paidN ? (
            <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Cómo pagaste">
              {METHODS.map((m) => (
                <Chip key={m.key} label={m.label} selected={method === m.key} onPress={() => setMethod(m.key)} />
              ))}
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title={exact ? (hasQty ? `Guardar: ahora hay ${fmtQty(after ?? 0)}` : 'Escribe cuántos llegaron') : 'Guardar: vuelve a «hay»'} loading={save.isPending} disabled={exact && !hasQty} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  label: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  good: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#1D6B3D' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 30, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center', minWidth: 120, paddingVertical: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  money: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  moneySign: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.muted },
  moneyInput: { flex: 1, fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink, paddingVertical: 0 },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
