import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type VoiceAction } from '@/api/ledger';
import { Button } from '@/components/Button';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { Chip } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { formatPesos, METHOD_LABEL, newClientId, type PayMethod } from '@/lib/ledger';
import { queueSale, queueVoid } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

type Item = { id: string; name: string; price: number | null };
type Mode = 'quick' | 'tally';
type DetailPick = PayMethod | 'split';
const METHODS: PayMethod[] = ['cash', 'transfer', 'card'];
const MERGE_MS = 1200;
const UNDO_MS = 5000;

/**
 * Modo mostrador: para cuando hay fila. «Al toque»: un toque registra la venta con la forma de pago que quedó puesta;
 * otro toque rápido sobre lo mismo suma uno a esa venta. «Contar»: se marca como palitos y, con calma, se dice cómo
 * pagaron (incluyendo mitad y mitad cuando vendiste varios del mismo producto). Todo se guarda primero en el teléfono.
 */
export default function CounterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const inv = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const tiles = useMemo(() => {
    const meta = new Map((inv.data?.items ?? []).filter((i) => i.kind === 'product').map((i) => [i.ref, i]));
    return (items.data ?? [])
      .filter((i) => i.price !== null)
      .map((i) => ({ ...i, sold: meta.get(i.id)?.sold_28 ?? 0, out: meta.get(i.id)?.status === 'out' && meta.get(i.id)?.mode !== 'none' }))
      .sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name, 'es'));
  }, [items.data, inv.data]);

  const [mode, setMode] = useState<Mode>('quick');
  const [method, setMethod] = useState<PayMethod>('cash');
  const [tally, setTally] = useState<Record<string, number>>({});
  const [done, setDone] = useState({ count: 0, total: 0 });
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pick, setPick] = useState<Record<string, DetailPick>>({});
  const [splitTransferCount, setSplitTransferCount] = useState<Record<string, number>>({});
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [exited, setExited] = useState(false);

  // La venta en curso: se guarda cuando pasa un momento sin tocar lo mismo.
  const open = useRef<{ item: Item; qty: number; method: PayMethod; id: string } | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const s = open.current;
    if (!s) return;
    open.current = null;
    queueSale(entityId, {
      client_id: s.id,
      total: (s.item.price ?? 0) * s.qty,
      method: s.method,
      lines: [{ item_id: s.item.id, name: s.item.name, qty: s.qty, unit_price: s.item.price ?? undefined }],
    });
  };
  useEffect(
    () => () => {
      flush();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const show = (text: string, undo: () => void) => {
    setToast({ text, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), UNDO_MS);
  };

  const tapQuick = (item: Item) => {
    const cur = open.current;
    if (cur && cur.item.id === item.id && cur.method === method) {
      cur.qty += 1;
    } else {
      flush();
      open.current = { item, qty: 1, method, id: newClientId() };
    }
    const s = open.current!;
    const price = item.price ?? 0;
    setDone((d) => ({ count: d.count + 1, total: d.total + price }));
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, MERGE_MS);
    show(`${s.qty > 1 ? `${s.qty} × ` : ''}${item.name} · ${METHOD_LABEL[s.method]} · ${formatPesos(price * s.qty)}`, () => {
      setDone((d) => ({ count: d.count - s.qty, total: d.total - price * s.qty }));
      if (open.current?.id === s.id) {
        if (flushTimer.current) clearTimeout(flushTimer.current);
        open.current = null;
      } else {
        queueVoid('sale', entityId, s.id, 'Deshecha al momento');
      }
    });
  };

  const tapTally = (item: Item) => {
    const n = (tally[item.id] ?? 0) + 1;
    setTally((t) => ({ ...t, [item.id]: n }));
    show(`${item.name} · contado (${n})`, () => setTally((t) => ({ ...t, [item.id]: Math.max(0, (t[item.id] ?? 0) - 1) })));
  };

  const counted = tiles.filter((t) => (tally[t.id] ?? 0) > 0);
  const tallyCount = counted.reduce((s, t) => s + (tally[t.id] ?? 0), 0);
  const tallyTotal = counted.reduce((s, t) => s + (tally[t.id] ?? 0) * (t.price ?? 0), 0);

  const saveDetail = () => {
    for (const t of counted) {
      const qty = tally[t.id] ?? 0;
      const price = t.price ?? 0;
      const choice = pick[t.id] ?? 'cash';
      if (choice === 'split' && qty > 1) {
        const transferQty = Math.min(qty - 1, Math.max(1, splitTransferCount[t.id] ?? Math.floor(qty / 2)));
        const cashQty = qty - transferQty;
        if (cashQty > 0) {
          queueSale(entityId, {
            client_id: newClientId(),
            total: price * cashQty,
            method: 'cash',
            lines: [{ item_id: t.id, name: t.name, qty: cashQty, unit_price: price }],
          });
        }
        if (transferQty > 0) {
          queueSale(entityId, {
            client_id: newClientId(),
            total: price * transferQty,
            method: 'transfer',
            lines: [{ item_id: t.id, name: t.name, qty: transferQty, unit_price: price }],
          });
        }
      } else {
        const finalMethod: PayMethod = choice === 'split' ? 'cash' : choice;
        queueSale(entityId, {
          client_id: newClientId(),
          total: price * qty,
          method: finalMethod,
          lines: [{ item_id: t.id, name: t.name, qty, unit_price: price }],
        });
      }
    }
    setDone((d) => ({ count: d.count + tallyCount, total: d.total + tallyTotal }));
    setTally({});
    setPick({});
    setSplitTransferCount({});
    setDetailOpen(false);
  };

  const handleVoiceConfirmed = (actions: VoiceAction[]) => {
    const sales = actions.filter((a) => a.type === 'sale');
    const addedCount = sales.reduce((sum, a) => sum + (a.lines?.reduce((s, l) => s + l.qty, 0) || 1), 0);
    const addedTotal = sales.reduce((sum, a) => sum + (a.amount ?? 0), 0);
    if (addedCount > 0 || addedTotal > 0) {
      setDone((d) => ({ count: d.count + addedCount, total: d.total + addedTotal }));
    }
    const summaryText = actions
      .map((a) => (a.amount > 0 ? `${a.item_name || a.note || 'Dictado'} · ${formatPesos(a.amount)}` : a.item_name || 'Inventario'))
      .join(' · ');
    show(summaryText || 'Dictado registrado', () => {
      if (addedCount > 0 || addedTotal > 0) {
        setDone((d) => ({ count: Math.max(0, d.count - addedCount), total: Math.max(0, d.total - addedTotal) }));
      }
      for (const a of actions) {
        if (a.type === 'sale' || a.type === 'expense') {
          queueVoid(a.type, entityId, a.client_id, 'Deshecho desde modo mostrador');
        }
      }
    });
  };

  const leave = () => {
    flush();
    setToast(null);
    setExited(true);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topHead, { paddingTop: insets.top + spacing.sm }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.brandRow}>
            <EmpreSymbol size={14} product="finance" />
            <Text style={styles.brandEyebrow}>EMPRE FINANCE</Text>
          </View>
          <Text style={styles.headTitle} accessibilityRole="header">
            Modo mostrador
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Salir del modo mostrador" onPress={leave} style={styles.exitBtn}>
          <Text style={styles.exitBtnText}>Salir</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}>
        <View style={styles.segment} accessibilityRole="tablist">
          {(['quick', 'tally'] as const).map((m) => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  flush();
                  setMode(m);
                }}
                style={[styles.segmentItem, on && styles.segmentOn]}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{m === 'quick' ? 'Registrar al toque' : 'Contar y detallar después'}</Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'quick' ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.eyebrow}>PAGAN CON</Text>
            <View style={styles.chips}>
              {METHODS.map((m) => (
                <Chip key={m} label={METHOD_LABEL[m]} selected={method === m} onPress={() => setMethod(m)} />
              ))}
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>Toca lo que vendes, como marcar palitos. Cuando haya calma, dices cómo pagaron.</Text>
        )}

        {tiles.length === 0 ? (
          <Text style={styles.hint}>Aquí aparecen tus productos con precio para venderlos con un toque. Agrégalos en tu catálogo.</Text>
        ) : (
          <Text style={styles.eyebrow}>LO QUE MÁS SE VENDE</Text>
        )}
        <View style={styles.grid}>
          {tiles.map((t) => {
            const n = tally[t.id] ?? 0;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`${t.name}, ${formatPesos(t.price ?? 0)}${mode === 'tally' && n > 0 ? `, ${n} contados` : ''}`}
                onPress={() => (mode === 'quick' ? tapQuick(t) : tapTally(t))}
                style={({ pressed }) => [styles.tile, mode === 'tally' && n > 0 && styles.tileOn, pressed && styles.tilePressed]}
              >
                <Text style={styles.tileName} numberOfLines={2}>
                  {t.name}
                </Text>
                <Text style={styles.tilePrice}>{formatPesos(t.price ?? 0)}</Text>
                {t.out ? <Text style={styles.out}>Agotado</Text> : null}
                {mode === 'tally' && n > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{n}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setVoiceOpen(true)} style={({ pressed }) => [styles.voice, pressed && { opacity: 0.85 }]}>
          <Ionicons name="mic-outline" size={19} color={colors.ink} />
          <Text style={styles.voiceText}>Dictar varias cosas en una frase</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {toast ? (
          <View style={styles.toast} accessibilityLiveRegion="polite">
            <Text style={styles.toastText} numberOfLines={2}>
              {toast.text}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                toast.undo();
                setToast(null);
              }}
              style={styles.undo}
            >
              <Text style={styles.undoText}>Deshacer</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.counter}>
          <View style={{ flex: 1 }}>
            <Text style={styles.counterTitle}>{mode === 'quick' ? `Llevas ${formatPesos(done.total)}` : `${tallyCount} contados · ${formatPesos(tallyTotal)}`}</Text>
            <Text style={styles.hint}>{done.count === 1 ? '1 cosa vendida' : `${done.count} cosas vendidas`}</Text>
          </View>
          {tallyCount > 0 ? <Button title="Detallar ahora" onPress={() => setDetailOpen(true)} /> : null}
        </View>
      </View>

      <Modal visible={detailOpen} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setDetailOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            ¿Cómo pagaron?
          </Text>
          <Text style={styles.hint}>Lo que contaste mientras atendías. Si todos pagaron igual, un toque y listo.</Text>
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: spacing.md }}>
            {counted.map((t) => {
              const qty = tally[t.id] ?? 0;
              const currentPick = pick[t.id] ?? 'cash';
              const nequiQty = Math.min(Math.max(1, splitTransferCount[t.id] ?? Math.floor(qty / 2)), Math.max(1, qty - 1));
              const cashQty = Math.max(1, qty - nequiQty);
              return (
                <View key={t.id} style={styles.detailCard}>
                  <View style={styles.detailHead}>
                    <Text style={styles.tileName}>
                      {t.name} × {qty}
                    </Text>
                    <Text style={styles.tilePrice}>{formatPesos((t.price ?? 0) * qty)}</Text>
                  </View>
                  <View style={styles.chips}>
                    <Chip label="Todo efectivo" selected={currentPick === 'cash'} onPress={() => setPick((p) => ({ ...p, [t.id]: 'cash' }))} />
                    <Chip label="Todo Nequi" selected={currentPick === 'transfer'} onPress={() => setPick((p) => ({ ...p, [t.id]: 'transfer' }))} />
                    <Chip label="Tarjeta" selected={currentPick === 'card'} onPress={() => setPick((p) => ({ ...p, [t.id]: 'card' }))} />
                    {qty > 1 ? (
                      <Chip
                        label="Mitad y mitad"
                        selected={currentPick === 'split'}
                        onPress={() => {
                          setPick((p) => ({ ...p, [t.id]: 'split' }));
                          setSplitTransferCount((sc) => ({ ...sc, [t.id]: sc[t.id] ?? Math.max(1, Math.floor(qty / 2)) }));
                        }}
                      />
                    ) : null}
                  </View>
                  {currentPick === 'split' && qty > 1 ? (
                    <View style={styles.splitRow}>
                      <Text style={styles.splitSummary}>
                        Efectivo {cashQty} · Nequi {nequiQty}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Cambiar cuántos fueron por Nequi"
                        onPress={() =>
                          setSplitTransferCount((sc) => {
                            const next = (sc[t.id] ?? Math.max(1, Math.floor(qty / 2))) + 1;
                            return { ...sc, [t.id]: next >= qty ? 1 : next };
                          })
                        }
                        style={styles.splitStepBtn}
                      >
                        <Text style={styles.splitStepText}>+1 Nequi</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          <Button title={`Registrar ${formatPesos(tallyTotal)}`} disabled={tallyCount === 0} onPress={saveDetail} />
        </View>
      </Modal>

      <Modal visible={exited} transparent animationType="slide" onRequestClose={() => setExited(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setExited(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.brandRow}>
            <EmpreSymbol size={16} product="finance" />
            <Text style={styles.brandEyebrow}>REGISTRADO EN EMPRE FINANCE</Text>
          </View>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            Saliste del modo mostrador
          </Text>
          <Text style={styles.exitBody}>
            {done.count === 1 ? '1 cosa vendida' : `${done.count} cosas vendidas`} · {formatPesos(done.total)}.
          </Text>
          {tallyCount > 0 ? <Text style={styles.warn}>Quedaron {tallyCount} sin detallar. Si sales sin decir cómo pagaron, no se guardan.</Text> : null}
          <Text style={styles.hint}>Si alguna se registró con otra forma de pago, el cuadre de caja te ayuda a encontrarla.</Text>
          {tallyCount > 0 ? (
            <Button
              title="Detallar ahora"
              onPress={() => {
                setExited(false);
                setDetailOpen(true);
              }}
            />
          ) : null}
          <Button title="Volver a Finanzas" variant={tallyCount > 0 ? 'secondary' : 'primary'} onPress={() => router.back()} />
        </View>
      </Modal>

      <VoiceSheet
        entityId={entityId}
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        hints={tiles.map((t) => t.name)}
        onConfirmed={handleVoiceConfirmed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandEyebrow: { fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.ui.extrabold, color: colors.muted },
  headTitle: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink },
  exitBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitBtnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  segmentItem: { flex: 1, minHeight: 44, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted, textAlign: 'center' },
  segmentTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  eyebrow: { fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.ui.extrabold, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 92,
    padding: spacing.md,
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tileOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  tilePressed: { backgroundColor: colors.selectedSoft },
  tileName: { flexShrink: 1, fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink, paddingRight: 22 },
  tilePrice: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  out: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.danger },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  badgeText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
  voice: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  voiceText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, borderRadius: radius.md, backgroundColor: colors.ink },
  toastText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: '#fff' },
  undo: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  undoText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff', textDecorationLine: 'underline' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  counterTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  exitBody: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.extrabold, color: colors.ink },
  warn: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.warning },
  veil: { flex: 1, backgroundColor: 'rgba(11,26,54,0.45)' },
  sheet: { gap: spacing.sm, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.surface },
  sheetTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  detailCard: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.selectedSoft,
  },
  splitSummary: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  splitStepBtn: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitStepText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
