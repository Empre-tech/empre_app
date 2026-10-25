import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components/Button';
import { AmountField, Chip, MethodChips, PartyPicker, type PartyChoice } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { EXPENSE_CATEGORIES, formatPesos, newClientId, type PayMethod } from '@/lib/ledger';
import { queueExpense, queueVoid } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

/** Registrar un gasto: monto, en qué fue y cómo se pagó. Una compra a crédito pide el proveedor y queda como deuda. */
export default function NewExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState('mercancia');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [supplier, setSupplier] = useState<PartyChoice | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<{ clientId: string; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAmount(0);
    setCategory('mercancia');
    setMethod('cash');
    setSupplier(null);
    setNote('');
    setSaved(null);
    setError(null);
  };

  const save = () => {
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
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  doneTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  doneAmount: { fontSize: 38, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.xs },
});
