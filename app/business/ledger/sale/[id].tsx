import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type InventoryItem, type ItemCost } from '@/api/ledger';
import { Button } from '@/components/Button';
import { AmountField, Chip, LedgerReceipt, LedgerStepHeader, MethodChips, PartyPicker, type PartyChoice } from '@/components/ledger/parts';
import { formatPesos, METHOD_LABEL, newClientId, salePayText, type PayMethod } from '@/lib/ledger';
import { queueSale, queueVoid } from '@/ledger/ledgerStore';
import { parkSale, removeParkedSale, useParkedSales, type ParkedSale } from '@/ledger/parkedSales';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

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
 * Registrar una venta en pocos toques (lienzo VentaPagos):
 * 1 · Qué vendiste (pestañas Servicios / Productos, cuadrícula 2×2 con insumos y contador rojo, En espera e Igual que la anterior)
 * 2 · Cuánto (tarjeta blanca con precio unitario, botones −/+ y subtotal por renglón)
 * 3 · Cómo se pagó (medios de pago arriba y Una forma / Dos formas / Pagó una parte debajo)
 * 4 · Listo (comprobante con el símbolo de Empre Finance integrado abajo y opción de Anular).
 */
export default function NewSaleScreen() {
  const { id, fiado } = useLocalSearchParams<{ id: string; fiado?: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();

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
    how === 'split' || how === 'part'
      ? paid === null
        ? how === 'split'
          ? `Elige cuánto en ${low}`
          : '¿Cuánto pagó ahora?'
        : how === 'part' && !party
          ? `¿Quién debe ${formatPesos(rest)}?`
          : null
      : null;

  const step: 1 | 2 | 3 | 4 = saved ? 4 : total > 0 ? 3 : 1;

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
        return;
      }
    }
    setQty({});
    setManual(lastActiveSale.total);
    setShowManual(true);
  };

  const reset = () => {
    setQty({});
    setManual(null);
    setShowManual(false);
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

  const primaryTitle = saved
    ? 'Nueva venta'
    : total <= 0
      ? sellable.length > 0
        ? 'Toca lo que vendiste'
        : 'Escribe cuánto fue la venta'
      : waiting ?? (how === 'part' ? `Cobrar ${formatPesos(paid ?? 0)} · ${formatPesos(rest)} a Te deben` : `Cobrar ${formatPesos(total)}`);

  const primaryDisabled = !saved && (total <= 0 || Boolean(waiting));

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LedgerStepHeader title="Nueva venta" kind="sale" entityId={entityId} step={step} />

      <ScrollView contentContainerStyle={[styles.body, saved && { opacity: 0.55 }]} keyboardShouldPersistTaps="handled">
        {toast ? (
          <Text accessibilityLiveRegion="polite" style={styles.toast}>
            {toast}
          </Text>
        ) : null}

        {sellable.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>1 · Qué vendiste</Text>
              <View style={styles.sectionHeadRight}>
                {parked.length > 0 && !saved ? (
                  <Pressable accessibilityRole="button" onPress={() => setShowParked(true)} style={({ pressed }) => [styles.parkedInline, pressed && { opacity: 0.85 }]}>
                    <View style={styles.parkedBadge}>
                      <Text style={styles.parkedBadgeText}>{parked.length}</Text>
                    </View>
                    <Text style={styles.parkedInlineText}>En espera</Text>
                  </Pressable>
                ) : null}
                {lastActiveSale && !saved ? (
                  <Pressable accessibilityRole="button" onPress={repeatLast} style={({ pressed }) => [styles.repeatBtn, pressed && { opacity: 0.85 }]}>
                    <Text style={styles.repeatText}>Igual que la anterior</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.tabsRow} accessibilityRole="tablist">
              {(
                [
                  ['serv', 'Servicios'],
                  ['prod', 'Productos'],
                ] as const
              ).map(([key, label]) => {
                const on = tab === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => setTab(key)}
                    style={[styles.tabPill, on && styles.tabPillOn]}
                  >
                    <Text style={[styles.tabPillText, on && styles.tabPillTextOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.eyebrow}>LO QUE MÁS VENDES PRIMERO</Text>

            <View style={styles.tilesGrid}>
              {visibleTiles.map((it) => {
                const q = qty[it.id] ?? 0;
                const supply = itemSupplyNote(invById.get(it.id));
                return (
                  <Pressable
                    key={it.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${it.name}, ${formatPesos(it.price ?? 0)}${q > 0 ? `, llevas ${q}` : ''}`}
                    onPress={() => bump(it, 1)}
                    style={({ pressed }) => [styles.tile, q > 0 && styles.tileActive, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={styles.tileName} numberOfLines={2}>
                      {it.name}
                    </Text>
                    <Text style={styles.tilePrice}>{formatPesos(it.price ?? 0)}</Text>
                    <Text style={[styles.tileNote, supply.warn && { color: colors.warning }]} numberOfLines={2}>
                      {supply.text}
                    </Text>
                    {q > 0 ? (
                      <View style={styles.tileQtyBadge}>
                        <Text style={styles.tileQtyBadgeText}>{q}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => setShowManual((v) => !v)}
              style={({ pressed }) => [styles.otherBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.otherBtnText}>+ Otro monto</Text>
            </Pressable>
          </View>
        ) : null}

        {lines.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2 · Cuánto</Text>
            <View style={styles.linesCard}>
              {lines.map((i, idx) => {
                const q = qty[i.id] ?? 0;
                const price = i.price ?? 0;
                return (
                  <View key={i.id} style={[styles.lineRow, idx > 0 && styles.lineRowSep]}>
                    <View style={styles.lineLeft}>
                      <Text style={styles.lineName}>{i.name}</Text>
                      <Text style={styles.lineUnit}>{formatPesos(price)} c/u</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Quitar de ${i.name}`} onPress={() => bump(i, -1)} style={styles.qtyCircleBtn}>
                      <Text style={styles.qtyCircleText}>−</Text>
                    </Pressable>
                    <Text style={styles.lineQty}>{q}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Agregar a ${i.name}`} onPress={() => bump(i, 1)} style={styles.qtyCircleBtn}>
                      <Text style={styles.qtyCircleText}>+</Text>
                    </Pressable>
                    <Text style={styles.lineSub}>{formatPesos(price * q)}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.qtyNote}>El precio viene del catálogo. Un precio especial se cambia en su línea.</Text>
          </View>
        ) : null}

        {showManual || sellable.length === 0 || manual !== null ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{sellable.length > 0 ? '2 · Cuánto (escrito a mano)' : '1 · Cuánto'}</Text>
            <AmountField key={sellable.length > 0 ? 'c' : 'n'} value={total} onChange={(n) => setManual(n)} autoFocus={!items.isLoading && sellable.length === 0} />
          </View>
        ) : null}

        {total > 0 || sellable.length === 0 ? (
          <>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{sellable.length > 0 ? '3 · Cómo se pagó' : '2 · Cómo se pagó'}</Text>
          <MethodChips value={method} onChange={(m) => !saved && setMethod(m)} noCredit={how !== 'one'} />
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

          {how !== 'one' ? (
            <View style={styles.splitCard}>
              <Text style={styles.splitQuestion}>{how === 'split' ? `¿Cuánto en ${low}?` : `¿Cuánto te pagó ahora, en ${low}?`}</Text>
              <View style={styles.wrap}>
                {firstOptions.map((v) => (
                  <Chip key={v} label={v === half && v !== 10000 && v !== 20000 ? 'Mitad' : formatPesos(v)} selected={!firstCustom && first === v} onPress={() => { if (!saved) { setFirst(v); setFirstCustom(false); } }} />
                ))}
                <Chip label="Otro" selected={firstCustom} onPress={() => { if (!saved) { setFirstCustom(true); setFirst(null); } }} />
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
                    <Chip key={m} label={METHOD_LABEL[m]} selected={second === m} onPress={() => !saved && setMethod2(m)} />
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

        {how === 'one' && method === 'credit' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cliente</Text>
            <PartyPicker entityId={entityId} kind="customer" value={party} onChange={setParty} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nota (opcional)</Text>
          <TextInput value={note} onChangeText={setNote} editable={!saved} placeholder="Ej. pedido de la mesa 4" placeholderTextColor={colors.muted} style={styles.note} maxLength={200} />
        </View>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {saved ? (
          <LedgerReceipt
            title={saved.voided ? 'Venta anulada' : 'Registrado en Empre Finance'}
            subtitle={saved.voided ? 'Se revirtió también el inventario' : `${formatPesos(saved.total)} · ${saved.text}`}
            voided={saved.voided}
            onVoid={() => {
              queueVoid('sale', entityId, saved.clientId, 'Deshecha al momento');
              setSaved((prev) => (prev ? { ...prev, voided: true } : null));
            }}
          />
        ) : null}

        {!saved && total > 0 ? (
          <Pressable accessibilityRole="button" onPress={park} style={({ pressed }) => [styles.parkFooterBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.parkFooterText}>Guardar para después · el cliente vuelve</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryTitle}
          accessibilityState={{ disabled: primaryDisabled }}
          disabled={primaryDisabled}
          onPress={save}
          style={({ pressed }) => [
            styles.primaryBtn,
            !primaryDisabled && !saved && total > 0 && styles.primaryBtnSplit,
            primaryDisabled && styles.primaryBtnDisabled,
            saved && styles.primaryBtnDone,
            pressed && !primaryDisabled && { opacity: 0.9 },
          ]}
        >
          {!primaryDisabled && !saved && total > 0 ? (
            <>
              <Text style={styles.primaryBtnText}>Cobrar ahora</Text>
              <View style={styles.primaryPricePill}>
                <Text style={styles.primaryPriceText}>{formatPesos(total)}</Text>
              </View>
            </>
          ) : (
            <Text style={[styles.primaryBtnText, primaryDisabled && styles.primaryBtnTextDisabled, saved && styles.primaryBtnTextDone]}>
              {primaryTitle}
            </Text>
          )}
        </Pressable>
      </View>

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
  body: { paddingHorizontal: spacing.lg, paddingTop: 6, paddingBottom: spacing.xl, gap: 14 },
  section: { gap: 10 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  sectionHeadRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  parkedInline: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  parkedBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  parkedBadgeText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.surface },
  parkedInlineText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  repeatBtn: { minHeight: 36, justifyContent: 'center' },
  repeatText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  tabsRow: { flexDirection: 'row', gap: 6 },
  tabPill: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tabPillOn: { borderColor: colors.selected, backgroundColor: colors.selectedSoft },
  tabPillText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tabPillTextOn: { color: colors.selected },
  eyebrow: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.8, color: colors.faint },
  tilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '48.6%',
    minHeight: 86,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
    position: 'relative',
  },
  tileActive: {
    borderColor: colors.selected,
    backgroundColor: colors.bg,
  },
  tileName: { fontSize: 14, lineHeight: 17, fontFamily: fonts.ui.extrabold, color: colors.ink, paddingRight: 24 },
  tilePrice: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tileNote: { fontSize: 12, lineHeight: 15, fontFamily: fonts.ui.bold, color: colors.faint },
  tileQtyBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileQtyBadgeText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.surface },
  otherBtn: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.muted },
  linesCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    ...softShadow,
  },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  lineRowSep: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  lineLeft: { flex: 1, gap: 2 },
  lineName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  lineUnit: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.faint },
  qtyCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyCircleText: { fontSize: 18, fontFamily: fonts.ui.extrabold, color: colors.ink },
  lineQty: { minWidth: 26, textAlign: 'center', fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  lineSub: { minWidth: 74, textAlign: 'right', fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  qtyNote: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.faint },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: colors.selectedSoft },
  segmentItem: { flex: 1, minHeight: 44, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  segmentTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  splitCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  splitQuestion: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.selectedSoft,
    paddingTop: 10,
  },
  restLabel: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  restValue: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  note: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface },
  hint: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  toast: { padding: spacing.md, borderRadius: 12, backgroundColor: colors.ink, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.bold, color: colors.surface },
  veil: { flex: 1, backgroundColor: 'rgba(14,35,70,0.38)' },
  sheet: { gap: spacing.sm, paddingHorizontal: 20, paddingTop: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  sheetTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  parkedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60, paddingVertical: spacing.sm },
  parkedLine: { borderTopWidth: 1, borderTopColor: colors.hairline },
  parkedName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  parkedDrop: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  parkedGo: { minHeight: 44, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  parkedGoText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  parkFooterBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parkFooterText: {
    fontSize: 13.5,
    fontFamily: fonts.ui.extrabold,
    color: colors.ink,
  },
  primaryBtn: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryBtnSplit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 12,
  },
  primaryPricePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14, 35, 70, 0.26)',
  },
  primaryPriceText: {
    fontSize: 15,
    fontFamily: fonts.display.bold,
    color: colors.surface,
    fontVariant: ['tabular-nums'],
  },
  primaryBtnDisabled: {
    backgroundColor: colors.hairline,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnDone: {
    backgroundColor: colors.selectedSoft,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: fonts.ui.extrabold,
    color: colors.surface,
  },
  primaryBtnTextDisabled: {
    color: colors.faint,
  },
  primaryBtnTextDone: {
    color: colors.ink,
  },
});
