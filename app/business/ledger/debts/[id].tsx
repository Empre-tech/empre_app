import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type PartyBalance, type PartyKind } from '@/api/ledger';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { AmountField, Chip, MethodChips } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { formatPesos, newClientId, type PayMethod, METHOD_LABEL } from '@/lib/ledger';
import { queueParty, queuePayment } from '@/ledger/ledgerStore';
import { initials } from '@/lib/text';
import { colors, fonts, radius, spacing } from '@/theme';

type Tone = 'amable' | 'directo';

/** El mensaje sale de plantillas: sin modelo, nunca presiona, y siempre lo revisa quien lo envía. */
function reminderText(p: PartyBalance, business: string, tone: Tone): string {
  const first = p.name.trim().split(/\s+/)[0];
  const from = business ? ` Te escribo de ${business}.` : '';
  return tone === 'amable'
    ? `Hola ${first}, ¿cómo vas?${from} Te recuerdo que quedó pendiente ${formatPesos(p.balance)}. Cuando puedas, me avisas. ¡Gracias!`
    : `Hola ${first}.${from} Tienes pendiente ${formatPesos(p.balance)}. Cuando te quede bien, me cuentas cómo lo arreglamos. Gracias.`;
}

const daysSince = (iso?: string) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)) : null);

async function sendReminder(p: PartyBalance, message: string) {
  const digits = p.phone.replace(/\D/g, '');
  if (digits) {
    const number = digits.length === 10 ? `57${digits}` : digits;
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // Sin WhatsApp: queda compartir el mensaje por donde se pueda.
    }
  }
  await Share.share({ message });
}

/** Fiados: lo que le deben al negocio (clientes) y lo que el negocio debe (proveedores), con sus abonos. */
export default function DebtsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [kind, setKind] = useState<PartyKind>('customer');
  const [paying, setPaying] = useState<PartyBalance | null>(null);
  const [adding, setAdding] = useState(false);
  const [reminding, setReminding] = useState<PartyBalance | null>(null);
  const [tone, setTone] = useState<Tone>('amable');
  const [draft, setDraft] = useState('');
  const [reminded, setReminded] = useState<string[]>([]);
  const [flash, setFlash] = useState('');

  const parties = useQuery({
    queryKey: ['ledger', entityId, 'parties', kind, 'owing'],
    queryFn: () => ledgerApi.parties(entityId, { kind, owing: '1' }),
    enabled: Boolean(entityId),
  });
  const rows = useMemo(() => [...(parties.data ?? [])].sort((a, b) => (a.oldest_at ?? '9').localeCompare(b.oldest_at ?? '9')), [parties.data]);
  const total = rows.reduce((s, p) => s + p.balance, 0);
  const isCustomer = kind === 'customer';
  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId), staleTime: 5 * 60_000 });
  const openRemind = (p: PartyBalance) => {
    setTone('amable');
    setDraft(reminderText(p, business.data?.name ?? '', 'amable'));
    setReminding(p);
  };

  return (
    <View style={styles.screen}>
      <SubScreenHeader title={isCustomer ? 'Te deben' : 'Debes'} subtitle="Empre Finance · Pendientes" />
      <View style={styles.tabs}>
        <Chip label="Te deben" selected={isCustomer} onPress={() => setKind('customer')} />
        <Chip label="Debes" selected={!isCustomer} onPress={() => setKind('supplier')} />
      </View>

      {parties.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : parties.isError ? (
        <EmptyState icon="cloud-offline-outline" title="No pudimos cargar los fiados" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void parties.refetch() }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            rows.length > 0 ? (
              <View style={styles.listHead}>
                <View style={styles.totalCard}>
                  <View style={{ gap: 4 }}>
                    <Text style={styles.eyebrow}>EN TOTAL</Text>
                    <Text style={styles.totalValue}>{formatPesos(total)}</Text>
                  </View>
                  <Text style={styles.totalCount}>{rows.length === 1 ? (isCustomer ? '1 persona' : '1 proveedor') : `${rows.length} ${isCustomer ? 'personas' : 'proveedores'}`}</Text>
                </View>
                <Text style={styles.eyebrow}>LA MÁS ANTIGUA PRIMERO</Text>
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
          renderItem={({ item, index }) => {
            const days = daysSince(item.oldest_at);
            return (
              <View style={[styles.debtCard, index === 0 && styles.debtFirst, index === rows.length - 1 && styles.debtLast, index > 0 && styles.debtLine]}>
                <View style={styles.row2}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIni}>{initials(item.name)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {reminded.includes(item.id) ? <Text style={styles.rowReminded}>Le recordaste hoy por WhatsApp</Text> : null}
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>{formatPesos(item.balance)}</Text>
                    {days !== null ? <Text style={[styles.rowHint, days > 7 && { color: colors.warning }]}>{days === 0 ? 'desde hoy' : `hace ${days} ${days === 1 ? 'día' : 'días'}`}</Text> : null}
                  </View>
                </View>
                <View style={styles.debtActions}>
                  {isCustomer ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Recordarle a ${item.name}`} onPress={() => openRemind(item)} style={styles.debtBtn}>
                      <Text style={styles.debtBtnText}>Recordarle</Text>
                    </Pressable>
                  ) : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={isCustomer ? `${item.name} ya me pagó` : `Pagarle a ${item.name}`} onPress={() => setPaying(item)} style={[styles.debtBtn, styles.debtBtnMain]}>
                    <Text style={[styles.debtBtnText, { color: '#fff' }]}>{isCustomer ? 'Ya me pagó' : 'Ya le pagué'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      {flash ? (
        <Text style={styles.flash} accessibilityLiveRegion="polite">
          {flash}
        </Text>
      ) : null}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title={isCustomer ? 'Agregar cliente' : 'Agregar proveedor'} variant="secondary" onPress={() => setAdding(true)} />
      </View>

      <PaySheet
        party={paying}
        onClose={() => setPaying(null)}
        onSave={(amount, method) => {
          if (!paying) return;
          queuePayment(entityId, { client_id: newClientId(), party_id: paying.id, amount, method });
          setFlash(`Registrado en Empre Finance · ${paying.name.split(/\s+/)[0]} · ${formatPesos(amount)} · ${METHOD_LABEL[method]}`);
          setPaying(null);
          // El saldo se actualiza cuando el abono llega al servidor (la cola invalida esta consulta).
          void qc.invalidateQueries({ queryKey: ['ledger', entityId, 'parties'] });
        }}
      />
      <Modal visible={Boolean(reminding)} transparent animationType="slide" onRequestClose={() => setReminding(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ flex: 1 }} onPress={() => setReminding(null)} accessibilityLabel="Cerrar" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <Text style={styles.sheetTitle}>Recordarle a {reminding?.name.split(/\s+/)[0]}</Text>
            <View style={styles.tabsInline}>
              {(['amable', 'directo'] as const).map((k) => (
                <Chip
                  key={k}
                  label={k === 'amable' ? 'Amable' : 'Directo'}
                  selected={tone === k}
                  onPress={() => {
                    setTone(k);
                    if (reminding) setDraft(reminderText(reminding, business.data?.name ?? '', k));
                  }}
                />
              ))}
            </View>
            <TextInput value={draft} onChangeText={setDraft} multiline style={[styles.input, styles.msg]} accessibilityLabel="Mensaje del recordatorio. Puedes cambiarlo" />
            <Button
              title="Abrir WhatsApp con este mensaje"
              disabled={!draft.trim()}
              onPress={() => {
                if (!reminding) return;
                void sendReminder(reminding, draft.trim());
                setReminded((r) => [...r, reminding.id]);
                setReminding(null);
              }}
            />
            <Text style={styles.sheetMeta}>Lo envías tú. Empre no le escribe a nadie por su cuenta.</Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
          <Text style={styles.sheetTitle}>{isCustomer ? `${party?.name ?? ''} te pagó` : `Le pagaste a ${party?.name ?? ''}`}</Text>
          <Text style={styles.sheetMeta}>{isCustomer ? 'Debe' : 'Le debes'} {formatPesos(party?.balance ?? 0)}</Text>
          <AmountField value={amount} onChange={setAmount} autoFocus />
          <MethodChips value={method} onChange={setMethod} noCredit />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title={party && amount >= party.balance ? 'Marcar como pagado' : 'Registrar abono'}
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
  listHead: { gap: 14, paddingBottom: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  debtCard: { gap: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.surface },
  debtFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  debtLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  debtLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  row2: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  debtActions: { flexDirection: 'row', gap: spacing.sm },
  debtBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  debtBtnMain: { backgroundColor: colors.primary, borderColor: colors.primary },
  debtBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  flash: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink, backgroundColor: colors.verifiedSoft },
  tabsInline: { flexDirection: 'row', gap: spacing.sm },
  msg: { minHeight: 110, paddingTop: spacing.sm, textAlignVertical: 'top' },
  screen: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingTop: 8, paddingHorizontal: 16 },
  totalCard: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', padding: 16, borderRadius: 20, backgroundColor: colors.surface },
  totalCount: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.muted },
  totalValue: { fontSize: 34, lineHeight: 36, fontFamily: fonts.display.bold, color: colors.ink },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  rowIni: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowName: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowReminded: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.verified },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowHint: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.faint },
  rowAmount: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  sheetTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  sheetMeta: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  input: { minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 16, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
