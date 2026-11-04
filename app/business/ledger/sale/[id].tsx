import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type ItemCost } from '@/api/ledger';
import { Button } from '@/components/Button';
import { AmountField, Chip, MethodChips, PartyPicker, type PartyChoice } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { formatPesos, METHOD_LABEL, newClientId, salePayText, type PayMethod } from '@/lib/ledger';
import { queueSale, queueVoid } from '@/ledger/ledgerStore';
import { parkSale, removeParkedSale, useParkedSales, type ParkedSale } from '@/ledger/parkedSales';
import { colors, fonts, radius, spacing } from '@/theme';

type How = 'one' | 'split' | 'part';
const HOWS: { key: How; label: string }[] = [
  { key: 'one', label: 'Una forma' },
  { key: 'split', label: 'Dos formas' },
  { key: 'part', label: 'Pagó una parte' },
];
const OTHER_METHODS: PayMethod[] = ['cash', 'transfer', 'card'];

function ago(at: number): string {
  const min = Math.floor((Date.now() - at) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

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
  const [saved, setSaved] = useState<{ clientId: string; total: number; text: string } | null>(null);
  const [how, setHow] = useState<How>('one');
  const [first, setFirst] = useState<number | null>(null);
  const [firstCustom, setFirstCustom] = useState(false);
  const [method2, setMethod2] = useState<PayMethod>('transfer');
  const parked = useParkedSales(entityId);
  const [showParked, setShowParked] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lines = sellable.filter((i) => (qty[i.id] ?? 0) > 0);
  const linesTotal = lines.reduce((s, i) => s + (i.price ?? 0) * (qty[i.id] ?? 0), 0);
  const total = manual ?? linesTotal;
  const paid = first !== null && first > 0 && first < total ? first : null;
  const rest = paid === null ? total : total - paid;
  const second = method2 === method ? (OTHER_METHODS.find((m) => m !== method) ?? 'transfer') : method2;
  const half = Math.round(total / 2 / 1000) * 1000;
  const firstOptions = [10000, 20000, half].filter((v, i, a) => v > 0 && v < total && a.indexOf(v) === i).slice(0, 3);
  const low = METHOD_LABEL[method].toLowerCase();
  const waiting = how === 'split' || how === 'part' ? (paid === null ? (how === 'split' ? `Elige cuánto en ${low}` : '¿Cuánto pagó ahora?') : how === 'part' && !party ? `¿Quién debe ${formatPesos(rest)}?` : null) : null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const pickHow = (next: How) => {
    setHow(next);
    setFirst(null);
    setFirstCustom(false);
    if (next !== 'one' && method === 'credit') setMethod('cash');
    if (next === 'split' || next === 'one') setParty(null);
  };

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
    setHow('one');
    setFirst(null);
    setFirstCustom(false);
    setMethod2('transfer');
  };

  const parkCurrent = () => {
    const what = lines.map((i) => `${qty[i.id]} × ${i.name}`).join(', ');
    parkSale({ id: newClientId(), entityId, at: Date.now(), label: note.trim() || what || 'Venta', total, qty, manual, note });
  };
  const park = () => {
    if (total <= 0) return;
    parkCurrent();
    reset();
    setToast('Guardada en «En espera». No cuenta en la caja hasta que la cobres.');
  };
  const resume = (p: ParkedSale) => {
    if (total > 0) parkCurrent();
    reset();
    setQty(p.qty);
    setManual(p.manual);
    setNote(p.note);
    removeParkedSale(p.id);
    setToast('');
    setShowParked(false);
  };

  const save = () => {
    if (total <= 0) return setError('Escribe cuánto fue la venta.');
    if (how === 'one' && method === 'credit' && !party) return setError('Un fiado necesita el cliente.');
    if (waiting) return setError(waiting);
    const clientId = newClientId();
    const pay = how === 'one' ? {} : { method2: how === 'part' ? ('credit' as const) : second, amount2: rest };
    queueSale(entityId, {
      client_id: clientId,
      total,
      method,
      ...pay,
      party_id: method === 'credit' || how === 'part' ? party?.id : undefined,
      note: note.trim() || undefined,
      lines: lines.map((i) => ({ item_id: i.id, name: i.name, qty: qty[i.id] ?? 1, unit_price: i.price ?? undefined })),
    });
    setError(null);
    setSaved({ clientId, total, text: salePayText({ total, method, ...pay, partyName: party?.name }) });
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
          <Text style={styles.doneMeta}>{saved.text}</Text>
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
        {parked.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setShowParked(true)} style={({ pressed }) => [styles.parkedLink, pressed && { opacity: 0.85 }]}>
            <Ionicons name="time-outline" size={18} color={colors.ink} />
            <Text style={styles.parkedLinkText}>En espera: {parked.length}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
        {toast ? (
          <Text accessibilityLiveRegion="polite" style={styles.toast}>
            {toast}
          </Text>
        ) : null}
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
          <View style={styles.segment}>
            {HOWS.map((h) => {
              const on = how === h.key;
              return (
                <Pressable key={h.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pickHow(h.key)} style={[styles.segmentItem, on && styles.segmentOn]}>
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
                    {h.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <MethodChips value={method} onChange={setMethod} noCredit={how !== 'one'} />
        </View>

        {how !== 'one' ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.label}>{how === 'split' ? `¿Cuánto en ${low}?` : `¿Cuánto te pagó ahora, en ${low}?`}</Text>
            <View style={styles.wrap}>
              {firstOptions.map((v) => (
                <Chip key={v} label={v === half && v !== 10000 && v !== 20000 ? 'Mitad' : formatPesos(v)} selected={!firstCustom && first === v} onPress={() => { setFirst(v); setFirstCustom(false); }} />
              ))}
              <Chip label="Otro" selected={firstCustom} onPress={() => { setFirstCustom(true); setFirst(null); }} />
            </View>
            {firstCustom ? <AmountField value={first ?? 0} onChange={setFirst} autoFocus /> : null}
            {first !== null && paid === null ? <Text style={styles.error}>Tiene que ser menos que el total ({formatPesos(total)}).</Text> : null}
            <View style={styles.restRow}>
              <Text style={styles.restLabel}>{paid === null ? 'Elige cuánto' : how === 'split' ? 'El resto, con otra forma' : 'Queda debiendo'}</Text>
              <Text style={styles.restValue}>{formatPesos(rest)}</Text>
            </View>
            {how === 'split' ? (
              <View style={styles.wrap}>
                {OTHER_METHODS.filter((m) => m !== method).map((m) => (
                  <Chip key={m} label={METHOD_LABEL[m]} selected={second === m} onPress={() => setMethod2(m)} />
                ))}
              </View>
            ) : (
              <>
                <Text style={styles.label}>¿Quién te queda debiendo?</Text>
                <PartyPicker entityId={entityId} kind="customer" value={party} onChange={setParty} />
                <Text style={styles.hint}>El resto queda en «Te deben». Se lo recuerdas cuando quieras, con un mensaje amable.</Text>
              </>
            )}
          </View>
        ) : null}

        {how === 'one' && method === 'credit' ? (
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
        <Button
          title={total <= 0 ? 'Guardar venta' : waiting ?? (how === 'part' ? `Cobrar ${formatPesos(paid ?? 0)} · ${formatPesos(rest)} a Te deben` : `Guardar venta · ${formatPesos(total)}`)}
          disabled={Boolean(waiting) && total > 0}
          onPress={save}
        />
        {total > 0 ? <Button title="Guardar para después" variant="ghost" onPress={park} /> : null}
      </View>

      <Modal visible={showParked} transparent animationType="slide" onRequestClose={() => setShowParked(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setShowParked(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            En espera
          </Text>
          <Text style={styles.hint}>Ventas que guardaste porque el cliente volvía. No cuentan en la caja hasta que las cobres.</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {parked.map((p, i) => (
              <View key={p.id} style={[styles.parkedRow, i > 0 && styles.parkedLine]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.parkedName} numberOfLines={2}>
                    {p.label}
                  </Text>
                  <Text style={styles.hint}>
                    {formatPesos(p.total)} · {ago(p.at)}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${p.label}`} onPress={() => removeParkedSale(p.id)} hitSlop={6} style={styles.parkedDrop}>
                  <Ionicons name="trash-outline" size={18} color={colors.muted} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Seguir con ${p.label}`} onPress={() => resume(p)} style={({ pressed }) => [styles.parkedGo, pressed && { opacity: 0.85 }]}>
                  <Text style={styles.parkedGoText}>Seguir</Text>
                </Pressable>
              </View>
            ))}
            {parked.length === 0 ? <Text style={styles.hint}>Ya no hay ventas en espera.</Text> : null}
          </ScrollView>
          <Button title="Cerrar" variant="ghost" onPress={() => setShowParked(false)} />
        </View>
      </Modal>
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
  hint: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  segmentItem: { flex: 1, minHeight: 44, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  segmentTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  restRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  restLabel: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  restValue: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  parkedLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  parkedLinkText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  toast: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.verifiedSoft, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  veil: { flex: 1, backgroundColor: 'rgba(11,26,54,0.45)' },
  sheet: { gap: spacing.sm, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.surface },
  sheetTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  parkedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm },
  parkedLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  parkedName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  parkedDrop: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  parkedGo: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  parkedGoText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  doneTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  doneAmount: { fontSize: 38, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.xs },
  doneMeta: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
});
