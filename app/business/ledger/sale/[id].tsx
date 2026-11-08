import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type InventoryItem, type ItemCost } from '@/api/ledger';
import { Button } from '@/components/Button';
import { DoneMark, FlowHeader, Pop, useFlowBack, useFlowStep } from '@/components/ledger/Flow';
import { AmountField, Chip, LedgerReceipt, PartyPicker, type PartyChoice } from '@/components/ledger/parts';
import { PayDeck } from '@/components/ledger/PayDeck';
import { formatPesos, METHOD_LABEL, newClientId, salePayText, type PayMethod } from '@/lib/ledger';
import { queueSale, queueVoid } from '@/ledger/ledgerStore';
import { parkSale, removeParkedSale, useParkedSales, type ParkedSale } from '@/ledger/parkedSales';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow, spacing } from '@/theme';

type How = 'one' | 'split' | 'part';
const HOWS: { key: How; label: string }[] = [
  { key: 'one', label: 'Una forma' },
  { key: 'split', label: 'Dos formas' },
  { key: 'part', label: 'Pagó una parte' },
];
const OTHER_METHODS: PayMethod[] = ['cash', 'transfer', 'card'];
const PAY_ALL: PayMethod[] = ['cash', 'transfer', 'card', 'credit'];
const PANES = ['what', 'pay', 'done'] as const;

function ago(at: number): string {
  const min = Math.floor((Date.now() - at) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

function itemSupplyNote(meta?: InventoryItem): { text: string; warn: boolean } {
  if (!meta) return { text: 'No usa insumos', warn: false };
  if (meta.is_service) {
    if (!meta.ingredients || meta.ingredients.length === 0) return { text: 'No usa insumos', warn: false };
    const parts = meta.ingredients.slice(0, 2).map((g) => `${g.qty ?? 1} ${g.name.toLowerCase()}`);
    const warn = meta.ingredients.some((g) => g.status === 'low' || g.status === 'out');
    return { text: `Usa ${parts.join(' y ')}`, warn };
  }
  if (meta.counted) {
    if (meta.status === 'out') return { text: 'Agotado', warn: true };
    if (meta.status === 'low') return { text: `Quedan ${meta.qty} · se está acabando`, warn: true };
    return { text: `Quedan ${meta.qty}`, warn: false };
  }
  return { text: 'En catálogo', warn: false };
}

/**
 * Registrar una venta, un paso por pantalla y cada uno entra con movimiento:
 * 1 · Qué vendiste: tocas lo que se llevó y abajo sube lo que llevas, con «Seguir».
 * 2 · Cómo te pagaron: un mazo donde cada forma de pago es una carta distinta, con el monto, y lo vendido debajo.
 * 3 · Listo: el visto, el comprobante, «Nueva venta» o volver.
 */
export default function NewSaleScreen() {
  const { id, fiado } = useLocalSearchParams<{ id: string; fiado?: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduce = useReduceMotion();
  const [pane, setPane] = useState<'what' | 'pay'>('what');

  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const inv = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), enabled: Boolean(entityId), staleTime: 60_000 });

  const invById = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const it of inv.data?.items ?? []) {
      if (it.kind === 'product') {
        map.set(it.ref, it);
        if (it.item_id) map.set(it.item_id, it);
      }
    }
    return map;
  }, [inv.data]);

  const sellable = useMemo(() => {
    const list = (items.data ?? []).filter((i) => i.price !== null);
    return list.slice().sort((a, b) => (invById.get(b.id)?.sold_28 ?? 0) - (invById.get(a.id)?.sold_28 ?? 0));
  }, [items.data, invById]);

  const hasServices = useMemo(() => sellable.some((i) => invById.get(i.id)?.is_service === true), [sellable, invById]);
  const hasProducts = useMemo(() => sellable.some((i) => invById.get(i.id)?.is_service === false), [sellable, invById]);

  const [tab, setTab] = useState<'serv' | 'prod'>('serv');
  useEffect(() => {
    if (!hasServices && hasProducts) setTab('prod');
    else if (hasServices && !hasProducts) setTab('serv');
  }, [hasServices, hasProducts]);

  const visibleTiles = useMemo(() => {
    if (hasServices && hasProducts) {
      return sellable.filter((i) => (tab === 'serv' ? invById.get(i.id)?.is_service === true : invById.get(i.id)?.is_service !== true));
    }
    return sellable;
  }, [sellable, hasServices, hasProducts, tab, invById]);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [manual, setManual] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [method, setMethod] = useState<PayMethod>(fiado === '1' ? 'credit' : 'cash');
  const [party, setParty] = useState<PartyChoice | null>(null);
  const [note, setNote] = useState('');
  const [editAmount, setEditAmount] = useState(false);
  const [saved, setSaved] = useState<{ clientId: string; total: number; text: string; voided: boolean } | null>(null);
  const [how, setHow] = useState<How>('one');
  const [first, setFirst] = useState<number | null>(null);
  const [firstCustom, setFirstCustom] = useState(false);
  const [method2, setMethod2] = useState<PayMethod>('transfer');
  const parked = useParkedSales(entityId);
  const recent = useQuery({ queryKey: ['ledger', entityId, 'sales', 'recent'], queryFn: () => ledgerApi.sales(entityId, { limit: 10 }), enabled: Boolean(entityId), staleTime: 30_000 });
  const [showParked, setShowParked] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lastActiveSale = useMemo(() => (recent.data ?? []).find((s) => s.status === 'active'), [recent.data]);

  const lines = sellable.filter((i) => (qty[i.id] ?? 0) > 0);
  const linesTotal = lines.reduce((s, i) => s + (i.price ?? 0) * (qty[i.id] ?? 0), 0);
  const total = manual ?? linesTotal;
  const paid = first !== null && first > 0 && first < total ? first : null;
  const rest = paid === null ? total : total - paid;
  const second = method2 === method ? (OTHER_METHODS.find((m) => m !== method) ?? 'transfer') : method2;
  const half = Math.round(total / 2 / 1000) * 1000;
  const firstOptions = [10000, 20000, half].filter((v, i, a) => v > 0 && v < total && a.indexOf(v) === i).slice(0, 3);
  const low = METHOD_LABEL[method].toLowerCase();
  const waiting =
    how === 'one' && method === 'credit' && !party
      ? '¿A quién le fías?'
      : how === 'split' || how === 'part'
      ? paid === null
        ? how === 'split'
          ? `Elige cuánto en ${low}`
          : '¿Cuánto pagó ahora?'
        : how === 'part' && !party
          ? `¿Quién debe ${formatPesos(rest)}?`
          : null
      : null;

  const { shown, style: flowStyle, footStyle } = useFlowStep<(typeof PANES)[number]>(saved ? 'done' : pane, PANES);
  // La barra de abajo y el título siguen al paso que se ve, así cambian juntos con el contenido.
  const footPane = shown === 'done' ? (saved ? 'done' : pane) : shown;
  // Lo que llevas sube desde abajo cuando hay algo que cobrar.
  const [cartIn] = useState(() => new Animated.Value(0));
  const hasTotal = total > 0;
  useEffect(() => {
    if (reduce) cartIn.setValue(hasTotal ? 1 : 0);
    else Animated.timing(cartIn, { toValue: hasTotal ? 1 : 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [hasTotal, reduce, cartIn]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const pickHow = (next: How) => {
    if (saved) return;
    setHow(next);
    setFirst(null);
    setFirstCustom(false);
    if (next !== 'one' && method === 'credit') setMethod('cash');
    if (next === 'split' || next === 'one') setParty(null);
  };

  const bump = (item: ItemCost, delta: number) => {
    if (saved) return;
    setManual(null);
    setQty((q) => {
      const next = Math.max(0, (q[item.id] ?? 0) + delta);
      const copy = { ...q, [item.id]: next };
      if (next === 0) delete copy[item.id];
      return copy;
    });
  };

  const repeatLast = () => {
    if (saved || !lastActiveSale) return;
    if (lastActiveSale.lines && lastActiveSale.lines.length > 0) {
      const nextQty: Record<string, number> = {};
      for (const l of lastActiveSale.lines) {
        const match = sellable.find((i) => (l.item_id && i.id === l.item_id) || i.name === l.name);
        if (match) nextQty[match.id] = (nextQty[match.id] ?? 0) + l.qty;
      }
      if (Object.keys(nextQty).length > 0) {
        setQty(nextQty);
        setManual(null);
        setShowManual(false);
        setPane('pay');
        return;
      }
    }
    setQty({});
    setManual(lastActiveSale.total);
    setShowManual(true);
    setPane('pay');
  };

  const reset = () => {
    setQty({});
    setManual(null);
    setShowManual(false);
    setMethod(fiado === '1' ? 'credit' : 'cash');
    setParty(null);
    setNote('');
    setSaved(null);
    setPane('what');
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
    if (total <= 0 || saved) return;
    parkCurrent();
    reset();
    setToast('Guardada en «En espera». No cuenta en la caja hasta que la cobres.');
  };
  const resume = (p: ParkedSale) => {
    if (total > 0 && !saved) parkCurrent();
    reset();
    setQty(p.qty);
    setManual(p.manual);
    setShowManual(p.manual !== null);
    setNote(p.note);
    removeParkedSale(p.id);
    setToast('');
    setShowParked(false);
    setPane('pay');
  };

  const save = () => {
    if (saved) {
      reset();
      return;
    }
    if (total <= 0) return setError('Escribe cuánto fue la venta.');
    if (how === 'one' && method === 'credit' && !party) return setError('Un fiado necesita el cliente.');
    if (waiting) return setError(waiting);
    const dup = (recent.data ?? []).find((s) => s.source === 'offer_claim' && s.status === 'active' && s.total === total && Date.now() - Date.parse(s.occurred_at) < 15 * 60_000);
    if (dup) {
      const mins = Math.max(1, Math.round((Date.now() - Date.parse(dup.occurred_at)) / 60_000));
      Alert.alert('¿Es el mismo canje?', `Hace ${mins} min se registró ${formatPesos(total)} por un canje de Empre Offers. Si es esa venta, no la anotes otra vez.`, [
        { text: 'Es el mismo, no anotar', style: 'cancel' },
        { text: 'Es otra venta, anotarla', onPress: commit },
      ]);
      return;
    }
    commit();
  };

  const commit = () => {
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
    setSaved({ clientId, total, text: salePayText({ total, method, ...pay, partyName: party?.name }), voided: false });
  };

  const primaryDisabled = !saved && (total <= 0 || Boolean(waiting));
  const payText = total <= 0 ? 'Escribe cuánto fue' : waiting ?? (how === 'one' && method === 'credit' ? `Fiarle ${formatPesos(total)} a ${party?.name ?? ''}` : how === 'part' ? `Cobrar ${formatPesos(paid ?? 0)}` : `Cobrar ${formatPesos(total)}`);

  const goPay = () => {
    setError(null);
    setPane('pay');
  };
  const backToWhat = useCallback(() => setPane('what'), []);
  useFlowBack(!saved && pane === 'pay' ? backToWhat : null);

  const count = lines.reduce((s, i) => s + (qty[i.id] ?? 0), 0);
  const what = lines.length ? `${count} ${count === 1 ? 'cosa' : 'cosas'}` : 'Otro monto';
  const stepN = footPane === 'done' ? 3 : footPane === 'pay' ? 2 : 1;
  const stepLabel = footPane === 'done' ? 'Listo' : footPane === 'pay' ? 'Cómo te pagaron' : 'Qué vendiste';
  const switchKind = (k: 'sale' | 'expense') => {
    if (k === 'expense') router.replace({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } });
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlowHeader title={footPane === 'done' ? 'Listo' : footPane === 'pay' ? 'Cobrar' : 'Nueva venta'} step={stepN} steps={3} label={stepLabel} onBack={!saved && pane === 'pay' ? backToWhat : undefined} kind={!saved && pane === 'what' ? 'sale' : undefined} onKind={switchKind} />

      <Animated.View style={[styles.flex, flowStyle]}>
        {shown === 'done' && saved ? (
          <ScrollView contentContainerStyle={styles.doneBody}>
            <DoneMark voided={saved.voided} />
            <View style={styles.doneText}>
              <Text style={styles.doneTitle} accessibilityRole="header">
                {saved.voided ? 'Venta anulada' : 'Venta registrada'}
              </Text>
              <Text style={styles.doneTotal}>{formatPesos(saved.total)}</Text>
              <Text style={styles.doneSub}>{saved.text}</Text>
            </View>
            <View style={styles.doneReceipt}>
              <LedgerReceipt
                title={saved.voided ? 'Venta anulada' : 'Registrado en Empre Finance'}
                subtitle={saved.voided ? 'Se revirtió también el inventario' : `${formatPesos(saved.total)} · ${saved.text}`}
                voided={saved.voided}
                onVoid={() => {
                  queueVoid('sale', entityId, saved.clientId, 'Deshecha al momento');
                  setSaved((prev) => (prev ? { ...prev, voided: true } : null));
                }}
              />
            </View>
          </ScrollView>
        ) : shown === 'pay' ? (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                ¿Cómo te pagaron?
              </Text>
              <PayDeck
                methods={how === 'one' ? PAY_ALL : OTHER_METHODS}
                value={method}
                onChange={(m) => {
                  setMethod(m);
                  if (total > 0) setEditAmount(false);
                }}
                amount={how === 'one' || paid === null ? total : paid}
                note={how === 'split' && paid !== null ? `El resto, ${formatPesos(rest)}, con otra forma` : how === 'part' && paid !== null ? `Queda debiendo ${formatPesos(rest)}` : undefined}
                party={party?.name}
                onEdit={lines.length === 0 && how === 'one' ? () => setEditAmount((v) => !v) : undefined}
              />
              {lines.length === 0 && editAmount ? <AmountField value={total} onChange={(n) => setManual(n)} autoFocus /> : null}
              <View style={styles.segment}>
                {HOWS.map((h) => {
                  const on = how === h.key;
                  return (
                    <Pressable key={h.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pickHow(h.key)} style={[styles.segmentItem, on && styles.segmentOn]}>
                      <Text style={styles.segmentText} numberOfLines={1}>
                        {h.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {how !== 'one' ? (
                <View style={styles.splitCard}>
                  <Text style={styles.splitQuestion}>{how === 'split' ? `¿Cuánto en ${low}?` : `¿Cuánto te pagó ahora, en ${low}?`}</Text>
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
                      <Text style={styles.splitQuestion}>¿Quién te queda debiendo? Los de siempre primero.</Text>
                      <PartyPicker entityId={entityId} kind="customer" value={party} onChange={setParty} />
                      <Text style={styles.hint}>El resto queda en «Te deben». Se lo recuerdas cuando quieras, con un mensaje amable.</Text>
                    </>
                  )}
                </View>
              ) : null}
            </View>

            {lines.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Lo que vendiste</Text>
                <View style={styles.bill}>
                  {lines.map((i, idx) => {
                    const q = qty[i.id] ?? 0;
                    return (
                      <View key={i.id} style={[styles.lineRow, idx > 0 && styles.lineRowSep]}>
                        <View style={styles.lineLeft}>
                          <Text style={styles.lineName} numberOfLines={1}>
                            {i.name}
                          </Text>
                          <Text style={styles.lineUnit}>{formatPesos((i.price ?? 0) * q)}</Text>
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar uno de ${i.name}`} onPress={() => bump(i, -1)} style={styles.qtyCircleBtn}>
                          <Ionicons name="remove" size={18} color={colors.ink} />
                        </Pressable>
                        <Text style={styles.lineQty}>{q}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Agregar uno de ${i.name}`} onPress={() => bump(i, 1)} style={styles.qtyCircleBtn}>
                          <Ionicons name="add" size={18} color={colors.ink} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {how === 'one' && method === 'credit' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>¿Quién te queda debiendo?</Text>
                <PartyPicker entityId={entityId} kind="customer" value={party} onChange={setParty} />
              </View>
            ) : null}

            <TextInput value={note} onChangeText={setNote} placeholder="Agregar una nota (opcional)" placeholderTextColor={colors.faint} style={styles.note} maxLength={200} accessibilityLabel="Nota de la venta" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={[styles.body, hasTotal && styles.bodyWithCart]} keyboardShouldPersistTaps="handled">
            {toast ? (
              <Text accessibilityLiveRegion="polite" style={styles.toast}>
                {toast}
              </Text>
            ) : null}
            <Text style={styles.question} accessibilityRole="header">
              {sellable.length > 0 ? '¿Qué vendiste?' : '¿Cuánto fue la venta?'}
            </Text>

            {parked.length > 0 || lastActiveSale ? (
              <View style={styles.shortcuts}>
                {lastActiveSale ? (
                  <Pressable accessibilityRole="button" onPress={repeatLast} style={styles.shortcut}>
                    <Ionicons name="repeat" size={16} color={colors.ink} />
                    <Text style={styles.shortcutText}>Igual que la anterior</Text>
                  </Pressable>
                ) : null}
                {parked.length > 0 ? (
                  <Pressable accessibilityRole="button" onPress={() => setShowParked(true)} style={styles.shortcut}>
                    <Ionicons name="time-outline" size={16} color={colors.ink} />
                    <Text style={styles.shortcutText}>En espera ({parked.length})</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {hasServices && hasProducts ? (
              <View style={styles.tabsRow} accessibilityRole="tablist">
                {(
                  [
                    ['serv', 'Servicios'],
                    ['prod', 'Productos'],
                  ] as const
                ).map(([key, label]) => (
                  <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.tabPill, tab === key && styles.tabPillOn]}>
                    <Text style={styles.tabPillText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {sellable.length > 0 ? (
              <View style={styles.tilesGrid}>
                {visibleTiles.map((it) => {
                  const q = qty[it.id] ?? 0;
                  const supply = itemSupplyNote(invById.get(it.id));
                  return (
                    <View key={it.id} style={styles.tileWrap}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${it.name}, ${formatPesos(it.price ?? 0)}${q > 0 ? `, llevas ${q}` : ''}`} onPress={() => bump(it, 1)} style={({ pressed }) => [styles.tile, q > 0 && styles.tileActive, pressed && styles.tilePressed]}>
                      <Text style={styles.tileName} numberOfLines={2}>
                        {it.name}
                      </Text>
                      <Text style={styles.tilePrice}>{formatPesos(it.price ?? 0)}</Text>
                      <Text style={[styles.tileNote, supply.warn && styles.tileNoteWarn, q > 0 && styles.tileNoteRoom]} numberOfLines={1}>
                        {supply.text}
                      </Text>
                      {q > 0 ? (
                        <Pop value={q} style={styles.tileQtyBadge}>
                          <Text style={styles.tileQtyBadgeText}>{q}</Text>
                        </Pop>
                      ) : null}
                    </Pressable>
                      {q > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={q === 1 ? `Quitar ${it.name}` : `Quitar uno de ${it.name}, quedan ${q - 1}`}
                          onPress={() => bump(it, -1)}
                          hitSlop={6}
                          style={({ pressed }) => [styles.tileMinus, pressed && styles.tileMinusPressed]}
                        >
                          <Ionicons name={q === 1 ? 'close' : 'remove'} size={18} color={colors.ink} />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {sellable.length > 0 && !showManual && manual === null ? (
              <Pressable accessibilityRole="button" onPress={() => setShowManual(true)} style={styles.otherBtn}>
                <Ionicons name="add" size={18} color={colors.ink} />
                <Text style={styles.otherBtnText}>Otro monto</Text>
              </Pressable>
            ) : (
              <AmountField key={sellable.length > 0 ? 'c' : 'n'} value={total} onChange={(n) => setManual(n)} autoFocus={!items.isLoading} />
            )}
          </ScrollView>
        )}
      </Animated.View>

      {footPane === 'done' && saved ? (
        <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }, footStyle]}>
          <Pressable accessibilityRole="button" onPress={reset} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Nueva venta</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Volver a Finanzas</Text>
          </Pressable>
        </Animated.View>
      ) : footPane === 'pay' ? (
        <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }, footStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={payText} accessibilityState={{ disabled: primaryDisabled }} disabled={primaryDisabled} onPress={save} style={[styles.primaryBtn, primaryDisabled && styles.primaryBtnDisabled]}>
            <Text style={[styles.primaryBtnText, primaryDisabled && styles.primaryBtnTextDisabled]}>{payText}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={park} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Guardar para después</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View pointerEvents={total > 0 && pane === 'what' ? 'auto' : 'none'} style={[styles.cart, { paddingBottom: insets.bottom + spacing.md, opacity: cartIn, transform: [{ translateY: cartIn.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }] }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cartWhat} numberOfLines={1}>
              {what}
            </Text>
            <Pop value={total}>
              <Text style={styles.cartTotal}>{formatPesos(total)}</Text>
            </Pop>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Seguir a cobrar ${formatPesos(total)}`} onPress={goPay} style={styles.cartBtn}>
            <Text style={styles.primaryBtnText}>Seguir</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      <Modal visible={showParked} transparent animationType="slide" onRequestClose={() => setShowParked(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setShowParked(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHandle} />
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
                  <Text style={styles.parkedGoText}>Seguir ›</Text>
                </Pressable>
              </View>
            ))}
            {parked.length === 0 ? <Text style={styles.hint}>Ya no hay ventas en espera.</Text> : null}
          </ScrollView>
          <Button title="Cerrar" variant="secondary" onPress={() => setShowParked(false)} />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 16 },
  bodyWithCart: { paddingBottom: 120 },
  section: { gap: 10 },
  question: { fontSize: 26, lineHeight: 30, letterSpacing: -0.4, fontFamily: fonts.display.bold, color: colors.ink },
  sectionTitle: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shortcut: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface, ...softShadow },
  shortcutText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tabsRow: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  tabPill: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tabPillOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  tabPillText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileWrap: { width: '48.5%' },
  tile: { flexGrow: 1, minHeight: 104, justifyContent: 'space-between', gap: 4, padding: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  tileActive: { borderWidth: 2, borderColor: colors.ink, padding: 12, backgroundColor: colors.selectedSoft },
  tilePressed: { transform: [{ scale: 0.97 }] },
  tileName: { paddingRight: 22, fontSize: 14.5, lineHeight: 18, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tilePrice: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: colors.ink },
  tileNote: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  tileNoteWarn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  tileQtyBadge: { position: 'absolute', right: 8, top: 8, minWidth: 26, height: 26, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.ink },
  tileNoteRoom: { paddingRight: 44 },
  tileMinus: { position: 'absolute', right: 8, bottom: 8, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.surface },
  tileMinusPressed: { transform: [{ scale: 0.92 }], backgroundColor: colors.selectedSoft },
  tileQtyBadgeText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.surface },
  otherBtn: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  otherBtnText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bill: { paddingVertical: 4, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  lineRowSep: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  lineLeft: { flex: 1, minWidth: 0, gap: 1 },
  lineName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  lineUnit: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  qtyCircleBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.selectedSoft },
  lineQty: { minWidth: 24, textAlign: 'center', fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segment: { flexDirection: 'row', gap: 2, padding: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  segmentItem: { flex: 1, minHeight: 44, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  segmentOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  segmentText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  splitCard: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  splitQuestion: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  restRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  restLabel: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  restValue: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  note: { minHeight: 52, paddingHorizontal: 14, borderRadius: 16, fontSize: 14.5, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface, ...softShadow },
  hint: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  toast: { padding: spacing.md, borderRadius: 12, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.bold, color: colors.surface, backgroundColor: colors.ink },
  veil: { flex: 1, backgroundColor: 'rgba(14,35,70,0.38)' },
  sheet: { gap: spacing.sm, paddingHorizontal: 20, paddingTop: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  sheetTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  parkedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm },
  parkedLine: { borderTopWidth: 1, borderTopColor: colors.hairline },
  parkedName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  parkedDrop: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  parkedGo: { minHeight: 44, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  parkedGoText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  doneBody: { alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  doneText: { alignItems: 'center', gap: 2 },
  doneTitle: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  doneTotal: { fontSize: 40, lineHeight: 46, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  doneSub: { textAlign: 'center', fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted },
  doneReceipt: { alignSelf: 'stretch' },
  footer: { gap: 8, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.surface },
  primaryBtn: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary },
  primaryBtnDisabled: { backgroundColor: colors.hairline },
  primaryBtnText: { fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  primaryBtnTextDisabled: { color: colors.faint },
  secondaryBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  cart: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 8 },
  cartWhat: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  cartTotal: { alignSelf: 'flex-start', fontSize: 22, lineHeight: 26, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  cartBtn: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, borderRadius: 16, backgroundColor: colors.primary },
});
