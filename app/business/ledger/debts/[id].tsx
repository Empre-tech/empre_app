import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type PartyBalance, type PartyKind } from '@/api/ledger';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { AmountField, Chip, MethodChips } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { formatPesos, newClientId, type PayMethod } from '@/lib/ledger';
import { queueParty, queuePayment } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

/** Fiados: lo que le deben al negocio (clientes) y lo que el negocio debe (proveedores), con sus abonos. */
export default function DebtsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [kind, setKind] = useState<PartyKind>('customer');
  const [paying, setPaying] = useState<PartyBalance | null>(null);
  const [adding, setAdding] = useState(false);

  const parties = useQuery({
    queryKey: ['ledger', entityId, 'parties', kind, 'owing'],
    queryFn: () => ledgerApi.parties(entityId, { kind, owing: '1' }),
    enabled: Boolean(entityId),
  });
  const rows = parties.data ?? [];
  const total = rows.reduce((s, p) => s + p.balance, 0);
  const isCustomer = kind === 'customer';

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Fiados" />
      <View style={styles.tabs}>
        <Chip label="Me deben" selected={isCustomer} onPress={() => setKind('customer')} />
        <Chip label="Debo" selected={!isCustomer} onPress={() => setKind('supplier')} />
      </View>

      {parties.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : parties.isError ? (
        <EmptyState icon="cloud-offline-outline" title="No pudimos cargar los fiados" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void parties.refetch() }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + 96 }}
          ListHeaderComponent={
            rows.length > 0 ? (
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>{isCustomer ? 'Te deben en total' : 'Debes en total'}</Text>
                <Text style={styles.totalValue}>{formatPesos(total)}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-outline"
              title={isCustomer ? 'Nadie te debe nada' : 'No le debes a ningún proveedor'}
              body={isCustomer ? 'Cuando vendas «a fiado», el cliente aparece aquí con lo que debe.' : 'Cuando registres un gasto «a crédito», el proveedor aparece aquí.'}
            />
          }
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, debe ${formatPesos(item.balance)}. Registrar abono`} onPress={() => setPaying(item)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
              <View style={styles.rowIcon}>
                <Ionicons name={isCustomer ? 'person-outline' : 'storefront-outline'} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowHint}>Toca para registrar un abono</Text>
              </View>
              <Text style={styles.rowAmount}>{formatPesos(item.balance)}</Text>
            </Pressable>
          )}
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title={isCustomer ? 'Agregar cliente' : 'Agregar proveedor'} variant="secondary" onPress={() => setAdding(true)} />
      </View>

      <PaySheet
        party={paying}
        onClose={() => setPaying(null)}
        onSave={(amount, method) => {
          if (!paying) return;
          queuePayment(entityId, { client_id: newClientId(), party_id: paying.id, amount, method });
          setPaying(null);
          // El saldo se actualiza cuando el abono llega al servidor (la cola invalida esta consulta).
          void qc.invalidateQueries({ queryKey: ['ledger', entityId, 'parties'] });
        }}
      />
      <AddPartySheet
        visible={adding}
        kind={kind}
        onClose={() => setAdding(false)}
        onSave={(name, phone) => {
          queueParty(entityId, { client_id: newClientId(), kind, name, phone: phone || undefined });
          setAdding(false);
        }}
      />
    </View>
  );
}

function PaySheet({ party, onClose, onSave }: { party: PartyBalance | null; onClose: () => void; onSave: (amount: number, method: PayMethod) => void }) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const isCustomer = party?.kind !== 'supplier';
  useEffect(() => {
    if (party) {
      setAmount(party.balance);
      setMethod('cash');
      setError(null);
    }
  }, [party]);

  return (
    <Modal visible={Boolean(party)} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>{isCustomer ? `Abono de ${party?.name ?? ''}` : `Pago a ${party?.name ?? ''}`}</Text>
          <Text style={styles.sheetMeta}>{isCustomer ? 'Debe' : 'Le debes'} {formatPesos(party?.balance ?? 0)}</Text>
          <AmountField value={amount} onChange={setAmount} autoFocus />
          <MethodChips value={method} onChange={setMethod} noCredit />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="Registrar abono"
            onPress={() => {
              if (amount <= 0) return setError('Escribe cuánto abonó.');
              if (party && amount > party.balance) return setError(`No puede ser más de lo que se debe (${formatPesos(party.balance)}).`);
              onSave(amount, method);
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AddPartySheet({ visible, kind, onClose, onSave }: { visible: boolean; kind: PartyKind; onClose: () => void; onSave: (name: string, phone: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (visible) {
      setName('');
      setPhone('');
    }
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>{kind === 'customer' ? 'Nuevo cliente' : 'Nuevo proveedor'}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={colors.muted} style={styles.input} autoFocus autoCapitalize="words" maxLength={80} accessibilityLabel="Nombre" />
          <TextInput value={phone} onChangeText={setPhone} placeholder="Celular (opcional)" placeholderTextColor={colors.muted} style={styles.input} keyboardType="phone-pad" maxLength={20} accessibilityLabel="Celular" />
          <Button title="Guardar" disabled={!name.trim()} onPress={() => onSave(name.trim(), phone.trim())} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  totalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm },
  totalLabel: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  totalValue: { fontSize: 32, fontFamily: fonts.display.bold, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 15.5, fontFamily: fonts.ui.bold, color: colors.ink },
  rowHint: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  rowAmount: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.accentInk },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  sheetTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  sheetMeta: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  input: { minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 16, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
