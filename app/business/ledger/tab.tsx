import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi } from '@/api/ledger';
import { Button } from '@/components/Button';
import { MethodChips, PartyPicker, type PartyChoice } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { normalize } from '@/lib/inventory';
import { formatPesos, newClientId, parseAmountInput, type PayMethod } from '@/lib/ledger';
import { openedAgo, projectTabs } from '@/lib/tabs';
import { useNow } from '@/lib/useNow';
import { queueTabAdd, queueTabCancel, queueTabPay, queueTabRemove, useLedgerOutbox } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Una cuenta abierta: lo pedido, agregar con un toque (o dictando) y cobrar al final. Todo se guarda primero en el
 * teléfono, así funciona sin señal.
 */
export default function TabScreen() {
  const { entityId: rawEntity, tabId: rawTab } = useLocalSearchParams<{ entityId: string; tabId: string }>();
  const entityId = rawEntity ?? '';
  const tabId = rawTab ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow(30_000);
  const outbox = useLedgerOutbox();

  const tabsQ = useQuery({ queryKey: ['ledger', entityId, 'tabs'], queryFn: () => ledgerApi.tabs(entityId), enabled: Boolean(entityId) });
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const tab = useMemo(() => projectTabs(tabsQ.data ?? [], outbox.items, entityId).find((t) => t.id === tabId) ?? null, [tabsQ.data, outbox.items, entityId, tabId]);

  const [query, setQuery] = useState('');
  const [voice, setVoice] = useState(false);
  const [paying, setPaying] = useState(false);

  const priced = useMemo(() => (items.data ?? []).filter((i) => i.price != null), [items.data]);
  const q = normalize(query);
  const shown = q ? priced.filter((i) => normalize(i.name).includes(q)) : priced;
  const lines = (tab?.lines ?? []).filter((l) => !l.removed);

  const add = (it: { id: string; name: string; price: number | null }) => {
    if (it.price == null) return;
    queueTabAdd(entityId, tabId, [{ id: newClientId(), item_id: it.id, name: it.name, qty: 1, unit_price: it.price }]);
  };

  const cancel = () =>
    Alert.alert('Cancelar la cuenta', 'Se cierra sin cobrar: no cuenta como venta ni toca el inventario.', [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Cancelar cuenta',
        style: 'destructive',
        onPress: () => {
          queueTabCancel(entityId, tabId, 'cancelada');
          router.back();
        },
      },
    ]);

  if (!tab) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Cuenta" />
        <Text style={[styles.meta, { padding: spacing.lg }]}>{tabsQ.isLoading ? 'Cargando…' : 'Esta cuenta ya se cerró.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SubScreenHeader title={tab.name} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.meta}>
              Abierta {openedAgo(tab.opened_at, now)}
              {tab.pending ? ' · sin enviar' : ''}
            </Text>
            <Pressable accessibilityRole="button" onPress={cancel} hitSlop={8}>
              <Text style={styles.danger}>Cancelar cuenta</Text>
            </Pressable>
          </View>
          {lines.length === 0 ? <Text style={styles.meta}>Todavía no hay nada. Toca lo que pidieron abajo o dícelo al micrófono.</Text> : null}
          {lines.map((l) => (
            <View key={l.id} style={styles.lineRow}>
              <Text style={styles.qty}>{l.qty}×</Text>
              <Text style={styles.lineName} numberOfLines={1}>
                {l.name}
              </Text>
              <Text style={styles.linePrice}>{formatPesos(Math.round(l.qty * l.unit_price))}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${l.name}`} onPress={() => queueTabRemove(entityId, tabId, l.id)} hitSlop={8} style={styles.remove}>
                <Ionicons name="close-circle-outline" size={22} color={colors.muted} />
              </Pressable>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPesos(tab.total)}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Agregar: busca un plato o producto" placeholderTextColor={colors.muted} style={styles.searchInput} accessibilityLabel="Buscar para agregar" />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dictar lo que pidieron" onPress={() => setVoice(true)} style={styles.mic}>
            <Ionicons name="mic" size={22} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {shown.slice(0, 60).map((it) => {
            const n = lines.filter((l) => l.item_id === it.id).reduce((s, l) => s + l.qty, 0);
            return (
              <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={`Agregar ${it.name}`} onPress={() => add(it)} style={[styles.tile, n > 0 && styles.tileOn]}>
                <Text style={styles.tileName} numberOfLines={2}>
                  {it.name}
                </Text>
                <Text style={styles.meta}>{formatPesos(it.price ?? 0)}</Text>
                {n > 0 ? (
                  <View style={styles.count}>
                    <Text style={styles.countText}>{n}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {(items.data ?? []).length > priced.length ? <Text style={styles.meta}>Lo que no tiene precio no aparece aquí: ponle precio en su ficha.</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title={`Cobrar ${formatPesos(tab.total)}`} onPress={() => setPaying(true)} disabled={lines.length === 0} />
      </View>

      <VoiceSheet entityId={entityId} visible={voice} onClose={() => setVoice(false)} hints={priced.map((i) => i.name).slice(0, 50)} tabId={tabId} />
      <PaySheet
        visible={paying}
        entityId={entityId}
        total={tab.total}
        onClose={() => setPaying(false)}
        onPay={(method, party, tip) => {
          queueTabPay(entityId, tabId, { sale_id: newClientId(), method, party_id: party?.id, tip });
          setPaying(false);
          router.back();
        }}
      />
    </View>
  );
}

function PaySheet({
  visible,
  entityId,
  total,
  onClose,
  onPay,
}: {
  visible: boolean;
  entityId: string;
  total: number;
  onClose: () => void;
  onPay: (method: PayMethod, party: PartyChoice | null, tip: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<PayMethod>('cash');
  const [party, setParty] = useState<PartyChoice | null>(null);
  const [tip, setTip] = useState('');
  const tipValue = parseAmountInput(tip);
  const blocked = method === 'credit' && !party;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle}>Cobrar {formatPesos(total)}</Text>
          <MethodChips value={method} onChange={setMethod} />
          {method === 'credit' ? <PartyPicker entityId={entityId} kind="customer" value={party} onChange={setParty} /> : null}
          <View style={styles.row}>
            <Text style={[styles.meta, { flex: 1 }]}>Propina o servicio (opcional, aparte de la venta)</Text>
            <TextInput value={tip} onChangeText={setTip} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} style={styles.tip} accessibilityLabel="Propina" />
          </View>
          <Button title={method === 'credit' ? 'Dejar a fiado' : 'Cobrar'} onPress={() => onPay(method, party, tipValue)} disabled={blocked} />
          <Button title="Volver" variant="ghost" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  danger: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.danger },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  qty: { width: 32, fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primary },
  lineName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  linePrice: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  remove: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm },
  totalLabel: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  totalValue: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  mic: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '48%', minHeight: 72, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, gap: 2 },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileName: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  count: { position: 'absolute', top: 6, right: 6, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.md },
  sheetTitle: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink },
  tip: { width: 110, minHeight: 44, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'right' },
});
