import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type ItemCost } from '@/api/ledger';
import { Button } from '@/components/Button';
import { AmountField, Chip, MethodChips, PartyPicker, type PartyChoice } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { formatPesos, METHOD_LABEL, newClientId, type PayMethod } from '@/lib/ledger';
import { queueSale, queueVoid } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Registrar una venta en pocos toques: el monto (o los productos del catálogo), cómo pagó y listo. Un fiado pide el
 * cliente. Guardar nunca espera a la red: la venta queda en el teléfono y se envía sola. Justo después de guardar
 * se puede deshacer.
 */
export default function NewSaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const sellable = useMemo(() => (items.data ?? []).filter((i) => i.price !== null), [items.data]);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [manual, setManual] = useState<number | null>(null);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [party, setParty] = useState<PartyChoice | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<{ clientId: string; total: number; method: PayMethod } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = sellable.filter((i) => (qty[i.id] ?? 0) > 0);
  const linesTotal = lines.reduce((s, i) => s + (i.price ?? 0) * (qty[i.id] ?? 0), 0);
  const total = manual ?? linesTotal;

  const bump = (item: ItemCost, delta: number) => {
    setManual(null); // al cambiar productos, el total vuelve a sumarse solo
    setQty((q) => ({ ...q, [item.id]: Math.max(0, (q[item.id] ?? 0) + delta) }));
  };

  const reset = () => {
    setQty({});
    setManual(null);
    setMethod('cash');
    setParty(null);
    setNote('');
    setSaved(null);
    setError(null);
  };

  const save = () => {
    if (total <= 0) return setError('Escribe cuánto fue la venta.');
    if (method === 'credit' && !party) return setError('Un fiado necesita el cliente.');
    const clientId = newClientId();
    queueSale(entityId, {
      client_id: clientId,
      total,
      method,
      party_id: method === 'credit' ? party?.id : undefined,
      note: note.trim() || undefined,
      lines: lines.map((i) => ({ item_id: i.id, name: i.name, qty: qty[i.id] ?? 1, unit_price: i.price ?? undefined })),
    });
    setError(null);
    setSaved({ clientId, total, method });
  };

  if (saved) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Nueva venta" />
        <View style={styles.doneBody}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text style={styles.doneTitle}>Venta guardada</Text>
          <Text style={styles.doneAmount}>{formatPesos(saved.total)}</Text>
          <Text style={styles.doneMeta}>{METHOD_LABEL[saved.method]}</Text>
          <View style={{ gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.xl }}>
            <Button title="Otra venta" onPress={reset} />
            <Button title="Listo" variant="secondary" onPress={() => router.back()} />
            <Button
              title="Deshacer esta venta"
              variant="ghost"
              onPress={() => {
                queueVoid('sale', entityId, saved.clientId, 'Deshecha al momento');
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
      <SubScreenHeader title="Nueva venta" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <AmountField value={total} onChange={(n) => setManual(n)} autoFocus />

        {sellable.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.label}>Toca lo que vendiste</Text>
            <View style={styles.wrap}>
              {sellable.map((i) => (
                <Chip key={i.id} label={`${(qty[i.id] ?? 0) > 0 ? `${qty[i.id]} × ` : ''}${i.name} · ${formatPesos(i.price ?? 0)}`} selected={(qty[i.id] ?? 0) > 0} onPress={() => bump(i, 1)} />
              ))}
            </View>
            {lines.map((i) => (
              <View key={i.id} style={styles.lineRow}>
                <Text style={styles.lineName} numberOfLines={1}>
                  {i.name}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Quitar uno de ${i.name}`} onPress={() => bump(i, -1)} style={styles.step}>
                  <Ionicons name="remove" size={18} color={colors.primary} />
                </Pressable>
                <Text style={styles.lineQty}>{qty[i.id]}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Agregar uno de ${i.name}`} onPress={() => bump(i, 1)} style={styles.step}>
                  <Ionicons name="add" size={18} color={colors.primary} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>¿Cómo pagó?</Text>
          <MethodChips value={method} onChange={setMethod} />
        </View>

        {method === 'credit' ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.label}>Cliente</Text>
            <PartyPicker entityId={entityId} kind="customer" value={party} onChange={setParty} />
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>Nota (opcional)</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Ej. pedido de la mesa 4" placeholderTextColor={colors.muted} style={styles.note} maxLength={200} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title={total > 0 ? `Guardar venta · ${formatPesos(total)}` : 'Guardar venta'} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.xl },
  label: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, paddingLeft: spacing.md },
  lineName: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.medium, color: colors.ink },
  lineQty: { minWidth: 24, textAlign: 'center', fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink },
  step: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  note: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  doneTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  doneAmount: { fontSize: 38, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.xs },
  doneMeta: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
});
