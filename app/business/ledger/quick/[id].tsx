import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi } from '@/api/ledger';
import { Button } from '@/components/Button';
import { Chip } from '@/components/ledger/parts';
import { VoiceSheet } from '@/components/ledger/VoiceSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { formatPesos, METHOD_LABEL, newClientId, type PayMethod } from '@/lib/ledger';
import { queueSale, queueVoid } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

type Item = { id: string; name: string; price: number | null };
type Mode = 'quick' | 'tally';
const METHODS: PayMethod[] = ['cash', 'transfer', 'card'];
const MERGE_MS = 1200;
const UNDO_MS = 5000;

/**
 * Modo mostrador: para cuando hay fila. «Al toque»: un toque registra la venta con la forma de pago que quedó puesta;
 * otro toque rápido sobre lo mismo suma uno a esa venta. «Contar»: se marca como palitos y, con calma, se dice cómo
 * pagaron. Todo se guarda primero en el teléfono, así funciona sin señal.
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
  const [pick, setPick] = useState<Record<string, PayMethod>>({});
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
    queueSale(entityId, { client_id: s.id, total: (s.item.price ?? 0) * s.qty, method: s.method, lines: [{ item_id: s.item.id, name: s.item.name, qty: s.qty, unit_price: s.item.price ?? undefined }] });
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
        // Todavía no salió: basta con olvidarla.
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
      queueSale(entityId, { client_id: newClientId(), total: (t.price ?? 0) * qty, method: pick[t.id] ?? 'cash', lines: [{ item_id: t.id, name: t.name, qty, unit_price: t.price ?? undefined }] });
    }
    setDone((d) => ({ count: d.count + tallyCount, total: d.total + tallyTotal }));
    setTally({});
    setPick({});
    setDetailOpen(false);
  };

  const leave = () => {
    flush();
    setToast(null);
    setExited(true);
  };

  if (exited) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Modo mostrador" />
        <View style={styles.exit}>
          <Text style={styles.exitTitle} accessibilityRole="header">
            Saliste del modo mostrador
          </Text>
          <Text style={styles.exitBody}>
            Registrado en Empre Finance: {done.count === 1 ? '1 cosa vendida' : `${done.count} cosas vendidas`} · {formatPesos(done.total)}.
          </Text>
          {tallyCount > 0 ? <Text style={styles.warn}>Quedaron {tallyCount} sin detallar. Si sales sin decir cómo pagaron, no se guardan.</Text> : null}
          <Text style={styles.exitBody}>Si alguna se registró con otra forma de pago, el cuadre de caja te ayuda a encontrarla.</Text>
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
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Modo mostrador" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}>
        <View style={styles.segment}>
          {(['quick', 'tally'] as const).map((m) => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  flush();
                  setMode(m);
                }}
                style={[styles.segmentItem, on && styles.segmentOn]}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{m === 'quick' ? 'Al toque' : 'Contar y detallar después'}</Text>
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
          <Button title="Salir" variant="secondary" onPress={leave} />
        </View>
      </View>

      <Modal visible={detailOpen} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setDetailOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            ¿Cómo pagaron?
          </Text>
          <Text style={styles.hint}>Lo que contaste mientras atendías. Si todos pagaron igual, un toque y listo.</Text>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: spacing.md }}>
            {counted.map((t) => (
              <View key={t.id} style={{ gap: spacing.xs }}>
                <View style={styles.detailHead}>
                  <Text style={styles.tileName}>
                    {t.name} × {tally[t.id]}
                  </Text>
                  <Text style={styles.tilePrice}>{formatPesos((t.price ?? 0) * (tally[t.id] ?? 0))}</Text>
                </View>
                <View style={styles.chips}>
                  {METHODS.map((m) => (
                    <Chip key={m} label={METHOD_LABEL[m]} selected={(pick[t.id] ?? 'cash') === m} onPress={() => setPick((p) => ({ ...p, [t.id]: m }))} />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
          <Button title={`Registrar ${formatPesos(tallyTotal)}`} disabled={tallyCount === 0} onPress={saveDetail} />
        </View>
      </Modal>

      <VoiceSheet entityId={entityId} visible={voiceOpen} onClose={() => setVoiceOpen(false)} hints={tiles.map((t) => t.name)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  segmentItem: { flex: 1, minHeight: 44, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted, textAlign: 'center' },
  segmentTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  eyebrow: { fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.ui.extrabold, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 92, padding: spacing.md, justifyContent: 'center', gap: 2, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  tileOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  tilePressed: { backgroundColor: colors.selectedSoft },
  tileName: { flexShrink: 1, fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink, paddingRight: 22 },
  tilePrice: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  out: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.danger },
  badge: { position: 'absolute', top: 8, right: 8, minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  badgeText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
  voice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  voiceText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, borderRadius: radius.md, backgroundColor: colors.ink },
  toastText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: '#fff' },
  undo: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  undoText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff', textDecorationLine: 'underline' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  counterTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  exit: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  exitTitle: { fontSize: 24, fontFamily: fonts.display.bold, color: colors.ink },
  exitBody: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.ink },
  warn: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.warning },
  veil: { flex: 1, backgroundColor: 'rgba(11,26,54,0.45)' },
  sheet: { gap: spacing.sm, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.surface },
  sheetTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
});
