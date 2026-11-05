import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type PartyBalance, type PartyKind } from '@/api/ledger';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { FinanceTop } from '@/components/finance/Top';
import { AmountField, Chip, MethodChips } from '@/components/ledger/parts';
import { EmpreAICard, ShareRow, StatusCap, SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { cuentasReadings } from '@/lib/empreAI';
import { agingRows } from '@/lib/finance';
import { formatPesos, newClientId, type PayMethod, METHOD_LABEL } from '@/lib/ledger';
import { addOpeningDebt, reduceOpeningDebt, useFinanceSetup } from '@/ledger/financeSetup';
import { queuePayment } from '@/ledger/ledgerStore';
import { initials } from '@/lib/text';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

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

const isLocal = (p: PartyBalance) => p.id.startsWith('local:');
const READING_ICON = { first: 'person-outline', cover: 'wallet-outline' } as const;

/** Cuentas: quién te debe y a quién le debes, cuánto llevan y qué cobrar primero. */
export default function CuentasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [kind, setKind] = useState<PartyKind>('customer');
  const [paying, setPaying] = useState<PartyBalance | null>(null);
  const [adding, setAdding] = useState<PartyKind | null>(null);
  const [reminding, setReminding] = useState<PartyBalance | null>(null);
  const [tone, setTone] = useState<Tone>('amable');
  const [draft, setDraft] = useState('');
  const [reminded, setReminded] = useState<string[]>([]);
  const [flash, setFlash] = useState('');
  const setup = useFinanceSetup(entityId);

  const customers = useQuery({ queryKey: ['ledger', entityId, 'parties', 'customer', 'owing'], queryFn: () => ledgerApi.parties(entityId, { kind: 'customer', owing: '1' }), enabled: Boolean(entityId) });
  const suppliers = useQuery({ queryKey: ['ledger', entityId, 'parties', 'supplier', 'owing'], queryFn: () => ledgerApi.parties(entityId, { kind: 'supplier', owing: '1' }), enabled: Boolean(entityId) });
  const merged = (server: PartyBalance[] | undefined, k: PartyKind) =>
    [...(server ?? []), ...setup.debts.filter((d) => d.kind === k).map((d) => ({ id: d.id, kind: k, name: d.name, phone: d.phone, balance: d.amount, oldest_at: d.at }) as PartyBalance)].sort((a, b) => (a.oldest_at ?? '9').localeCompare(b.oldest_at ?? '9'));
  const owedToYou = useMemo(() => merged(customers.data, 'customer'), [customers.data, setup.debts]); // eslint-disable-line react-hooks/exhaustive-deps
  const youOwe = useMemo(() => merged(suppliers.data, 'supplier'), [suppliers.data, setup.debts]); // eslint-disable-line react-hooks/exhaustive-deps
  const isCustomer = kind === 'customer';
  const rows = isCustomer ? owedToYou : youOwe;
  const owedTotal = owedToYou.reduce((s, p) => s + p.balance, 0);
  const oweTotal = youOwe.reduce((s, p) => s + p.balance, 0);
  const readings = cuentasReadings(owedToYou, oweTotal);
  const aging = agingRows(rows);
  const agingTop = Math.max(1, ...aging.map((x) => x.total));
  const loading = customers.isLoading || suppliers.isLoading;
  const failed = (customers.isError && !customers.data) || (suppliers.isError && !suppliers.data);
  const nothing = owedToYou.length === 0 && youOwe.length === 0;
  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId), staleTime: 5 * 60_000 });
  const openRemind = (p: PartyBalance) => {
    setTone('amable');
    setDraft(reminderText(p, business.data?.name ?? '', 'amable'));
    setReminding(p);
  };
  const reload = () => {
    void customers.refetch();
    void suppliers.refetch();
  };

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]} refreshControl={<RefreshControl refreshing={customers.isRefetching} onRefresh={reload} />}>
        <FinanceTop entityId={entityId} space="cuentas" title="Quién debe a quién" />
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : failed ? (
          <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tus cuentas" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: reload }} />
        ) : nothing ? (
          <>
            <EmpreAICard title="Empieza con lo que ya existe">
              <Text style={styles.plain}>Si alguien te debe de antes de usar Empre, anótalo. Así no se te olvida ni se mezcla con lo nuevo.</Text>
            </EmpreAICard>
            <SystemGroup>
              <SystemRow first icon="add-outline" title="Anotar a alguien que te debe" sub="Un nombre y cuánto" onPress={() => setAdding('customer')} />
              <SystemRow icon="car-outline" title="Anotar a quién le debes" sub="Un proveedor y cuánto" onPress={() => setAdding('supplier')} />
            </SystemGroup>
          </>
        ) : (
          <>
            <View style={styles.sides}>
              {(
                [
                  ['customer', 'Te deben', owedTotal],
                  ['supplier', 'Debes', oweTotal],
                ] as const
              ).map(([k, label, total]) => {
                const on = kind === k;
                return (
                  <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setKind(k)} style={[styles.side, on && styles.sideOn]}>
                    <Text style={styles.sideLabel}>{label}</Text>
                    <Text style={styles.sideValue} numberOfLines={1} adjustsFontSizeToFit>
                      {total > 0 ? formatPesos(total) : 'Nada'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {readings.length > 0 ? (
              <EmpreAICard title="Qué cobrar primero">
                <View>
                  {readings.map((r, i) => (
                    <SystemRow key={r.kind} first={i === 0} icon={READING_ICON[r.kind]} title={r.title} sub={r.sub} />
                  ))}
                </View>
              </EmpreAICard>
            ) : null}

            <SystemSection title={isCustomer ? 'Quién te debe' : 'A quién le debes'}>
              <SystemGroup>
                {rows.length === 0 ? <Text style={styles.none}>{isCustomer ? 'Nadie te debe nada.' : 'No le debes a ningún proveedor.'}</Text> : null}
                {rows.map((item, index) => {
                  const days = daysSince(item.oldest_at);
                  const when = isLocal(item) ? 'Anotado por ti, de antes de Empre' : reminded.includes(item.id) ? 'Le recordaste hoy por WhatsApp' : days === null ? '' : days === 0 ? 'Desde hoy' : `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
                  return (
                    <View key={item.id} style={[styles.party, index > 0 && styles.partyLine]}>
                      <View style={styles.partyHead}>
                        <View style={styles.rowIcon}>
                          <Text style={styles.rowIni}>{initials(item.name)}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.rowName} numberOfLines={1}>
                            {item.name} · {formatPesos(item.balance)}
                          </Text>
                          {when ? (
                            <Text style={styles.rowHint} numberOfLines={2}>
                              {when}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.partyActions}>
                        {isCustomer ? (
                          <Pressable accessibilityRole="button" accessibilityLabel={`Recordarle a ${item.name}`} onPress={() => openRemind(item)} style={styles.partyBtn}>
                            <Text style={styles.partyBtnText}>Recordar</Text>
                          </Pressable>
                        ) : null}
                        <Pressable accessibilityRole="button" accessibilityLabel={isCustomer ? `${item.name} ya me pagó` : `Abonarle a ${item.name}`} onPress={() => setPaying(item)} style={styles.partyBtn}>
                          <Text style={styles.partyBtnText}>{isCustomer ? 'Ya me pagó' : 'Abonar'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </SystemGroup>
            </SystemSection>

            {isCustomer && rows.length > 0 ? (
              <SystemSection title="Cuánto llevan">
                <SystemGroup>
                  {aging.map((x, i) => (
                    <ShareRow key={x.key} first={i === 0} label={x.label} value={x.total > 0 ? formatPesos(x.total) : 'Nadie'} share={(x.total / agingTop) * 100} />
                  ))}
                </SystemGroup>
              </SystemSection>
            ) : null}

            <SystemGroup>
              <SystemRow first icon="add-outline" title={isCustomer ? 'Anotar a alguien que te debe' : 'Anotar a quién le debes'} sub="De antes de usar Empre. Las ventas fiadas llegan solas" onPress={() => setAdding(kind)} />
            </SystemGroup>
          </>
        )}
      </ScrollView>
      <StatusCap />

      {flash ? (
        <Text style={styles.flash} accessibilityLiveRegion="polite">
          {flash}
        </Text>
      ) : null}

      <PaySheet
        party={paying}
        onClose={() => setPaying(null)}
        onSave={(amount, method) => {
          if (!paying) return;
          if (isLocal(paying)) {
            reduceOpeningDebt(entityId, paying.id, amount);
            setFlash(`Anotado · ${paying.name.split(/\s+/)[0]} · ${formatPesos(amount)}. Era de antes de Empre: no suma en Entró`);
          } else {
            queuePayment(entityId, { client_id: newClientId(), party_id: paying.id, amount, method });
            setFlash(`Registrado en Empre Finance · ${paying.name.split(/\s+/)[0]} · ${formatPesos(amount)} · ${METHOD_LABEL[method]}`);
          }
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
      <NoteSheet
        key={adding ?? 'closed'}
        kind={adding}
        onClose={() => setAdding(null)}
        onSave={(k, name, amount, phone) => {
          addOpeningDebt(entityId, { kind: k, name, amount, phone });
          setKind(k);
          setAdding(null);
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

/** Una deuda de antes de usar Empre: es una nota en este teléfono, no una venta. */
function NoteSheet({ kind, onClose, onSave }: { kind: PartyKind | null; onClose: () => void; onSave: (kind: PartyKind, name: string, amount: number, phone: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState(0);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={Boolean(kind)} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>{kind === 'customer' ? '¿Quién te debe?' : '¿A quién le debes?'}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={colors.muted} style={styles.input} autoFocus autoCapitalize="words" maxLength={80} accessibilityLabel="Nombre" />
          <AmountField value={amount} onChange={setAmount} />
          {kind === 'customer' ? <TextInput value={phone} onChangeText={setPhone} placeholder="Celular, para recordarle (opcional)" placeholderTextColor={colors.muted} style={styles.input} keyboardType="phone-pad" maxLength={20} accessibilityLabel="Celular" /> : null}
          <Button title="Guardar" disabled={!name.trim() || amount <= 0} onPress={() => kind && onSave(kind, name.trim(), amount, phone.trim())} />
          <Text style={styles.sheetMeta}>Se guarda en este teléfono y no suma en tus ventas.</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, gap: 24 },
  plain: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted },
  sides: { flexDirection: 'row', gap: 8 },
  side: { flex: 1, minWidth: 0, minHeight: 92, justifyContent: 'center', gap: 2, padding: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  sideOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  sideLabel: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  sideValue: { fontSize: 28, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  none: { minHeight: 58, paddingVertical: 18, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  party: { gap: 10, paddingVertical: 12 },
  partyLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  partyHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  partyActions: { flexDirection: 'row', gap: 8 },
  partyBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  partyBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  flash: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink, backgroundColor: colors.verifiedSoft },
  tabsInline: { flexDirection: 'row', gap: spacing.sm },
  msg: { minHeight: 110, paddingTop: spacing.sm, textAlignVertical: 'top' },
  screen: { flex: 1, backgroundColor: colors.bg },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  rowIni: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowHint: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  sheetTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  sheetMeta: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  input: { minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 16, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
