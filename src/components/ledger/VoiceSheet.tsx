import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '@/api/catalog';
import { ApiError } from '@/api/client';
import { ledgerApi, type AdjustReason, type InventoryItem, type VoiceAction, type VoiceResult } from '@/api/ledger';
import { useEntitySections } from '@/api/sections';
import { Button } from '@/components/Button';
import { Chispa } from '@/components/ai/Chispa';
import { VoiceOrb } from '@/components/ai/VoiceOrb';
import { AmountField, Chip, MethodChips, PartyPicker } from '@/components/ledger/parts';
import { PayDeck } from '@/components/ledger/PayDeck';
import { categoryLabel, formatPesos, newClientId } from '@/lib/ledger';
import { speechAvailable, startDictation } from '@/ledger/speech';
import { liveParse } from '@/lib/voiceLive';
import { liveRows, micLevel, phaseCopy, voicePhase, wordTone, type LiveRow, type WordTone } from '@/lib/voiceStage';
import { availabilityLine, countFromWords, dictatedPrice, inventoryIntent, isMoneyTalk, isPriceStatement, itemNamedIn, sameNameItem, similarItems } from '@/lib/voiceNewItem';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

export type EmpreAIMode = 'finance' | 'inventory' | 'search';

const TYPE_LABEL: Record<VoiceAction['type'], string> = {
  sale: 'Venta',
  expense: 'Gasto',
  payment: 'Abono',
  stock: 'Inventario',
  tab_add: 'A la cuenta',
  tab_pay: 'Cobrar cuenta',
};

const TYPE_ICON: Record<VoiceAction['type'], keyof typeof Ionicons.glyphMap> = {
  sale: 'cash-outline',
  expense: 'arrow-down-circle-outline',
  payment: 'swap-horizontal-outline',
  stock: 'cube-outline',
  tab_add: 'receipt-outline',
  tab_pay: 'checkmark-done-outline',
};

const QUICK_PROMPTS: Record<EmpreAIMode, string[]> = {
  finance: ['Vendí 2 por 12 mil en Nequi', 'Gasté 15 mil en insumos', 'Le fié 20 mil a Don Jorge'],
  inventory: ['¿Hay harina?', 'Llegaron 24 gaseosas', 'Descuenta 2 jabones', 'Se acabó el café'],
  search: ['Comida rápida abierta ahora con oferta', 'Droguería con domicilio cerca', 'Barbería abierta hoy'],
};

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'Empre AI no está disponible en este momento. Intenta de nuevo en unos segundos.';
    if (e.status === 429) return 'Llegaste al límite de consultas de voz de este mes.';
    if (e.status === 0) return 'Necesitas conexión a internet para confirmar con Empre AI.';
    return e.message;
  }
  return 'No pudimos interpretar lo que dijiste. Inténtalo de nuevo.';
}

/** ¿Falta algo para poder confirmar esta tarjeta? Devuelve el motivo o null. */
export function actionProblem(a: VoiceAction): string | null {
  if (a.stock_move) {
    const m = a.stock_move;
    if (!a.item_ref) return 'Elige uno parecido o agrégalo como nuevo.';
    if (m.kind === 'remove' && m.from === null) return m.counted == null ? 'Dime cuántos quedan.' : null;
    if (m.kind === 'remove' && m.from !== null && m.qty > m.from) return `Solo hay ${String(m.from).replace('.', ',')}.`;
    return null;
  }
  if (a.price_ask) return a.price_ask.from !== a.price_ask.to && a.price_ok === undefined ? 'Elige si cambio el precio.' : null;
  if (a.type === 'stock') {
    if (!a.item_ref) return a.candidates?.length ? 'Elige de cuál hablas.' : 'Elige uno parecido o agrégalo como nuevo.';
    if (a.counted == null && !a.level) return 'Dime si se acabó, queda poco o cuántos hay.';
    return null;
  }
  if (a.type === 'tab_add') {
    if (!a.tab_id && !(a.new_tab && a.tab_name?.trim())) return '¿A qué cuenta va?';
    if (!a.lines?.length) return '¿Qué le agrego?';
    if (a.lines.some((l) => l.unit_price == null)) return 'Hay algo sin precio.';
    return null;
  }
  if (a.type === 'tab_pay') {
    if (!a.tab_id) return 'No encontré esa cuenta abierta.';
    if (a.method === 'credit' && !a.party_id && !(a.new_party && a.party_name?.trim())) return '¿A quién le fías la cuenta?';
    return null;
  }
  if (a.amount <= 0) return 'Falta el monto.';
  const needsParty = a.method === 'credit' || a.type === 'payment';
  if (needsParty && !a.party_id && !(a.new_party && a.party_name?.trim())) {
    return a.candidates?.length ? 'Elige a quién.' : a.type === 'payment' ? 'No sé quién abonó.' : 'Falta el cliente o proveedor.';
  }
  return null;
}

/** Los tonos de la paleta para lo entendido (3.65): producto en tinta, lo bueno en verde azulado, lo que falta en rojo. */
const TONE: Record<WordTone, { ink: string; bg: string }> = {
  item: { ink: colors.ink, bg: colors.selectedSoft },
  good: { ink: colors.verified, bg: colors.verifiedSoft },
  bad: { ink: colors.primaryDark, bg: colors.primarySoft },
  warn: { ink: colors.warning, bg: colors.accentSoft },
};

const ROW_ICON: Record<LiveRow['icon'], keyof typeof Ionicons.glyphMap> = {
  up: 'arrow-up',
  down: 'arrow-down',
  out: 'close',
  low: 'alert-circle-outline',
  ok: 'checkmark',
  search: 'search',
  open: 'time-outline',
  offer: 'pricetag-outline',
  delivery: 'bicycle-outline',
  cheap: 'cash-outline',
};

const MODES: { key: EmpreAIMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'finance', label: 'Finanzas', icon: 'wallet-outline' },
  { key: 'inventory', label: 'Inventario', icon: 'cube-outline' },
  { key: 'search', label: 'Buscar', icon: 'search' },
];

/**
 * Empre AI por voz (3.65): la Chispa hace de orbe y su aura crece con el volumen real del micrófono; lo que dices
 * aparece grande con las palabras entendidas marcadas y, debajo, lo que se va armando en vivo (solo con reglas). Nada
 * mueve caja ni inventario sin que el dueño confirme.
 */
export function VoiceSheet({
  entityId,
  visible,
  onClose,
  hints,
  tabId,
  defaultMode = 'finance',
  onConfirmed,
}: {
  entityId: string;
  visible: boolean;
  onClose: () => void;
  hints: string[];
  /** Se dicta desde dentro de una cuenta abierta: lo pedido va a esa cuenta. */
  tabId?: string;
  /** Módulo inicial al abrir Empre AI Live: 'finance', 'inventory' o 'search'. */
  defaultMode?: EmpreAIMode;
  /** Permite avisar al mostrador cuando se confirma una venta o gasto dictado. */
  onConfirmed?: (actions: VoiceAction[]) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [mode, setMode] = useState<EmpreAIMode>(defaultMode);
  const [text, setText] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [answer, setAnswer] = useState<{ name: string; text: string; exact: InventoryItem | null; rows: InventoryItem[] } | null>(null);
  const [actions, setActions] = useState<VoiceAction[]>([]);
  const [done, setDone] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<TextInput>(null);
  const canSpeak = speechAvailable();
  const [savedList, setSavedList] = useState<VoiceAction[]>([]);

  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Nivel del micrófono (0 a 1) animado fuera de React: no se vuelve a dibujar la hoja en cada evento de volumen.
  const [level] = useState(() => new Animated.Value(0));

  const items = useQuery({
    queryKey: ['ledger', entityId, 'items'],
    queryFn: () => ledgerApi.items(entityId),
    enabled: visible && Boolean(entityId),
    staleTime: 60_000,
  });

  const live = useMemo(
    () =>
      liveParse(
        text,
        (items.data ?? []).map((i) => ({ name: i.name, price: i.price })),
      ),
    [text, items.data],
  );

  // Si el usuario menciona palabras claras de inventario («se acabó», «queda poco»), sugerimos visualmente ese contexto.
  useEffect(() => {
    if (live.stock.length > 0 && live.lines.length === 0 && !live.expense && mode === 'finance') {
      setMode('inventory');
    }
  }, [live.stock.length, live.lines.length, live.expense, mode]);

  const listen = async () => {
    if (listening) {
      stopRef.current?.();
      setListening(false);
      return;
    }
    setError(null);
    setErrorCode(null);
    setListening(true);
    const stop = await startDictation(
      {
        onText: (t) => setText(t),
        onEnd: () => {
          setListening(false);
          level.setValue(0);
        },
        onError: (m, code) => {
          setError(m);
          setErrorCode(code ?? null);
          setListening(false);
          level.setValue(0);
        },
        onVolume: (v) => Animated.timing(level, { toValue: micLevel(v), duration: 110, useNativeDriver: true }).start(),
      },
      hints,
    );
    if (stop) stopRef.current = stop;
    else setListening(false);
  };

  useEffect(() => {
    if (visible) {
      setMode(defaultMode);
      setText('');
      setError(null);
      setErrorCode(null);
      setResult(null);
      setAnswer(null);
      setActions([]);
      setDone(false);
      setBusy(false);
      setKeyboardOpen(!canSpeak);
      if (canSpeak) {
        const t = setTimeout(() => {
          void listen();
        }, 180);
        return () => clearTimeout(t);
      }
    } else {
      stopRef.current?.();
      setListening(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, defaultMode]);

  const interpret = async () => {
    const t = text.trim();
    if (!t || busy) return;
    stopRef.current?.();
    setListening(false);

    if (mode === 'search' || !entityId) {
      onClose();
      setTimeout(() => {
        router.push({ pathname: '/ask', params: { q: t } });
      }, 80);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (await handleLocally(t)) return;
      const r = await ledgerApi.voiceParse(entityId, t, tabId);
      const priced = await withPriceAsk(t, r.actions);
      const parsed = mode === 'inventory' ? await keepInInventory(t, priced) : priced;
      setResult(r);
      setActions(parsed);
      if (parsed.length === 0) setError(r.message ?? 'No entendí qué registrar. Prueba con otra frase.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // En la pestaña Inventario, «30 pollos» es cuántos hay, no una venta: el servidor no sabe en qué pestaña se dictó.
  const startLocal = (t: string, list: VoiceAction[]) => {
    setAnswer(null);
    setResult({ draft_id: '', text: t, actions: list } as unknown as VoiceResult);
    setActions(list);
  };
  const moveFrom = (item: InventoryItem, kind: 'add' | 'remove' | 'count') => startLocal(answer?.text ?? '', [localMove(item.name, kind, kind === 'count' ? item.qty : 1, [item], 'otro')]);

  // Preguntar, sumar, descontar y contar no pasan por el modelo: se resuelven aquí, al instante y sin costo.
  const handleLocally = async (t: string): Promise<boolean> => {
    const intent = isMoneyTalk(t) || isPriceStatement(t) ? null : inventoryIntent(t);
    if (!intent || (intent.kind !== 'ask' && mode !== 'inventory')) return false;
    let items: InventoryItem[];
    try {
      items = (await qc.fetchQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), staleTime: 15_000 })).items;
    } catch {
      return false;
    }
    if (intent.kind === 'ask') {
      const exact = sameNameItem(intent.name, items);
      const similar = similarItems(intent.name, items);
      setAnswer({ name: intent.name, text: t, exact, rows: exact ? [exact, ...similar.filter((i) => i.ref !== exact.ref)] : similar });
      return true;
    }
    startLocal(t, [localMove(intent.name, intent.kind, intent.qty, items, intent.kind === 'remove' ? intent.reason : 'otro')]);
    return true;
  };

  const keepInInventory = async (t: string, list: VoiceAction[]): Promise<VoiceAction[]> => {
    if (isMoneyTalk(t) || isPriceStatement(t)) return list;
    try {
      const inv = await qc.fetchQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), staleTime: 60_000 });
      const count = countFromWords(t);
      if (list.length === 0) return count ? [stockAction(count.name, count.qty, inv.items)] : list;
      return list.flatMap((a) => {
        if (a.type !== 'sale' && a.type !== 'expense') return [a];
        if (a.lines?.length) return a.lines.map((l) => stockAction(l.name, l.qty, inv.items, l.item_id));
        return count ? [stockAction(count.name, count.qty, inv.items)] : [a];
      });
    } catch {
      return list;
    }
  };

  // Dijo cuánto vale algo que ya vende: se pregunta antes de tocar el precio, y no se toca el inventario.
  const withPriceAsk = async (t: string, list: VoiceAction[]): Promise<VoiceAction[]> => {
    const to = dictatedPrice(t);
    if (to === null || !isPriceStatement(t)) return list;
    try {
      const inv = await qc.fetchQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), staleTime: 60_000 });
      const products = inv.items.filter((i) => i.kind === 'product');
      const ask = (i: (typeof products)[number]) => ({ item_id: i.item_id ?? i.ref, from: i.price, to });
      if (list.length === 0) {
        const named = itemNamedIn(t, products);
        return named ? [{ client_id: newClientId(), type: 'stock', amount: 0, words: '', method: 'cash', days_ago: 0, item_ref: named.ref, item_name: named.name, price_ask: ask(named), warnings: [] }] : list;
      }
      return list.map((a) => {
        const item = a.type === 'stock' && a.item_ref ? products.find((i) => i.ref === a.item_ref) : undefined;
        return item ? { ...a, price_ask: ask(item), warnings: [] } : a;
      });
    } catch {
      return list;
    }
  };

  const patch = (i: number, p: Partial<VoiceAction>) => setActions((list) => list.map((a, k) => (k === i ? { ...a, ...p } : a)));

  const confirm = async () => {
    if (!result || busy) return;
    setBusy(true);
    setError(null);
    try {
      const changes = actions.filter((a) => a.price_ask && a.price_ok && a.price_ask.from !== a.price_ask.to);
      const moves = actions.filter((a) => a.stock_move);
      const rest = actions.filter((a) => !a.price_ask && !a.stock_move);
      for (const a of moves) {
        const m = a.stock_move;
        if (!m || !a.item_ref) continue;
        if (m.kind === 'add' && m.from !== null) await ledgerApi.arrived(entityId, a.item_ref, { client_id: a.client_id, qty: m.qty });
        else if (m.kind === 'remove' && m.from !== null) await ledgerApi.adjust(entityId, { client_id: a.client_id, ref: a.item_ref, delta: -m.qty, reason: m.reason });
        else await ledgerApi.adjust(entityId, { client_id: a.client_id, ref: a.item_ref, counted: m.kind === 'remove' ? m.counted : m.qty });
      }
      if (changes.length > 0) {
        // Actualizar reescribe todo el producto: se manda lo que ya tiene para cambiar solo el precio.
        const catalog = await catalogApi.list(entityId);
        for (const a of changes) {
          const item = catalog.find((c) => c.id === a.price_ask?.item_id);
          if (!item || !a.price_ask) throw new Error(`No encontré «${a.item_name}» en tu catálogo. Cámbiale el precio desde su ficha.`);
          await catalogApi.update(entityId, item.id, { name: item.name, description: item.description, price: a.price_ask.to, price_from: item.price_from });
        }
      }
      if (rest.length > 0) await ledgerApi.voiceConfirm(entityId, result.draft_id, rest);
      else if (result.draft_id) void ledgerApi.voiceDiscard(entityId, result.draft_id).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ['ledger', entityId] });
      void qc.invalidateQueries({ queryKey: ['catalog', entityId] });
      const saved = [...changes, ...moves, ...rest];
      if (saved.length === 0) {
        // Dejó todo como estaba: no hay nada que celebrar.
        setResult(null);
        setActions([]);
        return;
      }
      setSavedList(saved);
      setDone(true);
      onConfirmed?.(actions);
    } catch (e) {
      setError(e instanceof ApiError || !(e instanceof Error) ? errorText(e) : e.message);
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    if (result?.draft_id) void ledgerApi.voiceDiscard(entityId, result.draft_id).catch(() => undefined);
    setResult(null);
    setActions([]);
  };

  const blocked = actions.some((a) => actionProblem(a) !== null);
  const liveIntent = mode === 'search' || isMoneyTalk(text) || isPriceStatement(text) ? null : inventoryIntent(text);
  const phase = voicePhase({ listening, busy, text, error, errorCode });
  const copy = phaseCopy(phase, mode, canSpeak, error);
  const rows = liveRows(live, mode, text, formatPesos);
  const canGo = Boolean(text.trim()) && !busy;
  const goLabel = mode === 'search' ? 'Buscar' : liveIntent?.kind === 'ask' ? 'Preguntar' : mode === 'inventory' ? 'Actualizar' : 'Seguir y revisar';
  const hintLine =
    mode !== 'search' && text.trim() && rows.length === 0 && !listening && !busy
      ? liveIntent?.kind === 'ask'
        ? `Vas a preguntar si hay «${liveIntent.name}».`
        : liveIntent?.kind === 'add' && mode === 'inventory'
          ? `Vas a sumar ${liveIntent.qty} a «${liveIntent.name}».`
          : liveIntent?.kind === 'remove' && mode === 'inventory'
            ? `Vas a descontar ${liveIntent.qty} de «${liveIntent.name}».`
            : liveIntent?.kind === 'count' && mode === 'inventory'
              ? `Vas a dejar «${liveIntent.name}» en ${liveIntent.qty}.`
              : 'Toca la flecha y Empre AI lo arma para que lo revises.'
      : null;
  const openKeyboard = () => {
    setKeyboardOpen(true);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ height: insets.top + 24 }} onPress={result || answer ? undefined : onClose} accessibilityRole="button" accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {done ? (
            <View style={styles.doneBox}>
              <Chispa size={104} mood="contento" />
              <Text style={styles.stageTitle} accessibilityLiveRegion="polite">
                {savedList.some((a) => a.type === 'stock') ? 'Inventario actualizado' : 'Registrado en Empre Finance'}
              </Text>
              <View style={[styles.list, { alignSelf: 'stretch' }]}>
                {savedList.map((a, i) => (
                  <View key={a.client_id} style={[styles.liveRow, i > 0 && styles.liveRowSep]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.liveTitle}>{destinationOf(a)}</Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {a.note || a.party_name || a.item_name || TYPE_LABEL[a.type]}
                      </Text>
                    </View>
                    {a.amount > 0 ? <Text style={styles.liveValue}>{formatPesos(a.amount)}</Text> : null}
                  </View>
                ))}
              </View>
              <View style={{ alignSelf: 'stretch' }}>
                <Button title="Listo" onPress={onClose} />
              </View>
            </View>
          ) : answer ? (
            <>
              <View style={styles.headRow}>
                <View style={styles.brandRow}>
                  <Chispa size={30} animated={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liveBrandText}>Empre AI · tu inventario</Text>
                    <Text style={styles.title} accessibilityLiveRegion="polite">
                      {answer.exact ? `${answer.exact.name}: ${availabilityLine(answer.exact).text.toLowerCase()}` : answer.rows.length ? `«${answer.name}» no está con ese nombre` : `«${answer.name}» no está en tu inventario`}
                    </Text>
                  </View>
                </View>
              </View>
              {answer.rows.length > 0 ? (
                <View style={{ gap: spacing.sm }}>
                  {answer.exact ? null : <Text style={styles.cardMeta}>Pero tienes esto parecido:</Text>}
                  {answer.rows.map((i) => (
                    <Pressable
                      key={i.ref}
                      accessibilityRole="button"
                      accessibilityLabel={`${i.name}, ${availabilityLine(i).text}. Ver el detalle`}
                      onPress={() => {
                        onClose();
                        setTimeout(() => router.push({ pathname: '/business/products/item', params: { entityId, itemId: i.item_id ?? i.ref } }), 80);
                      }}
                      style={styles.similarRow}
                    >
                      <View style={[styles.stockDot, availabilityLine(i).has === false ? styles.stockOut : availabilityLine(i).has ? styles.stockHas : null]} />
                      <Text style={styles.similarName} numberOfLines={1}>
                        {i.name}
                      </Text>
                      <Text style={styles.cardMeta}>{availabilityLine(i).text}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.cardMeta}>Puedes agregarlo ahora, con lo que tienes.</Text>
              )}
              {answer.exact ? (
                <View style={styles.wrap}>
                  <Chip icon="add" label="Llegaron más" selected={false} onPress={() => moveFrom(answer.exact as InventoryItem, 'add')} />
                  <Chip icon="remove" label="Descontar" selected={false} onPress={() => moveFrom(answer.exact as InventoryItem, 'remove')} />
                  <Chip label="Contar" selected={false} onPress={() => moveFrom(answer.exact as InventoryItem, 'count')} />
                </View>
              ) : (
                <Button title={`Agregar «${answer.name}»`} variant="secondary" onPress={() => startLocal(answer.text, [localMove(answer.name, 'count', 1, [], 'otro')])} />
              )}
              <View style={{ gap: spacing.sm }}>
                <Button title="Listo" onPress={onClose} />
                <Button title="Preguntar otra cosa" variant="ghost" onPress={() => { setAnswer(null); setText(''); }} />
              </View>
            </>
          ) : !result || actions.length === 0 ? (
            <>
              <View style={styles.topRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.topTitle}>Empre AI</Text>
                  <Text style={styles.topStatus} accessibilityLiveRegion="polite">
                    {copy.status}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Cerrar Empre AI" onPress={onClose} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={colors.ink} />
                </Pressable>
              </View>

              <View style={styles.modeTrack} accessibilityRole="tablist">
                {MODES.filter((m) => m.key === 'search' || entityId).map((m) => (
                  <Pressable
                    key={m.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === m.key }}
                    onPress={() => setMode(m.key)}
                    style={[styles.modePill, mode === m.key && styles.modePillOn]}
                  >
                    <Ionicons name={m.icon} size={15} color={mode === m.key ? colors.ink : colors.muted} />
                    <Text style={[styles.modePillText, mode === m.key && styles.modePillTextOn]}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stage} keyboardShouldPersistTaps="handled">
                <View style={[styles.orbArea, copy.big && styles.orbAreaBig]}>
                  <VoiceOrb size={copy.big ? 132 : 96} mood={copy.mood} level={level} listening={listening} />
                  <Text style={styles.stageTitle} accessibilityRole="header">
                    {copy.title}
                  </Text>
                </View>

                {keyboardOpen ? (
                  <TextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={setText}
                    placeholder={
                      mode === 'finance'
                        ? 'Ej: Vendí dos empanadas por 6 mil en Nequi…'
                        : mode === 'inventory'
                          ? 'Ej: Se acabó la harina y queda poco café…'
                          : 'Ej: Comida rápida abierta ahora con oferta…'
                    }
                    placeholderTextColor={colors.placeholder}
                    style={styles.stageInput}
                    multiline
                    maxLength={400}
                    autoFocus={!canSpeak}
                    accessibilityLabel="Lo que quieres decirle a Empre AI"
                  />
                ) : live.words.length > 0 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Dijiste: ${text}. Toca para corregirlo con el teclado`} onPress={openKeyboard} style={styles.saidTap}>
                    <Text style={styles.said} accessibilityLiveRegion="polite">
                      {live.words.map((w, i) => {
                        const tone = wordTone(w.tag);
                        return (
                          <Text key={i}>
                            {i > 0 ? ' ' : ''}
                            <Text style={tone ? [styles.saidWord, { color: TONE[tone].ink, backgroundColor: TONE[tone].bg }] : undefined}>{tone ? `\u00A0${w.text}\u00A0` : w.text}</Text>
                          </Text>
                        );
                      })}
                    </Text>
                  </Pressable>
                ) : copy.body ? (
                  <Text style={styles.stageBody}>{copy.body}</Text>
                ) : null}

                {phase === 'ready' && !keyboardOpen ? (
                  <View style={styles.prompts}>
                    {QUICK_PROMPTS[mode].map((prompt) => (
                      <Pressable
                        key={prompt}
                        accessibilityRole="button"
                        accessibilityLabel={`Usar la frase: ${prompt}`}
                        onPress={() => setText(prompt)}
                        style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}
                      >
                        <Ionicons name="mic-outline" size={16} color={colors.muted} />
                        <Text style={styles.promptText}>«{prompt}»</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {rows.length ? (
                  <View style={styles.liveBlock} accessibilityLiveRegion="polite">
                    <Text style={styles.liveLabel}>{listening ? 'Entendiendo en vivo' : 'Esto es lo que entendí'}</Text>
                    <View style={styles.list}>
                      {rows.map((r, i) => (
                        <View key={r.key} style={[styles.liveRow, i > 0 && styles.liveRowSep]}>
                          <View style={[styles.liveIcon, { backgroundColor: TONE[r.tone].bg }]}>
                            <Ionicons name={ROW_ICON[r.icon]} size={16} color={TONE[r.tone].ink} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.liveTag, { color: TONE[r.tone].ink }]} numberOfLines={1}>
                              {r.tag}
                            </Text>
                            <Text style={styles.liveTitle} numberOfLines={1}>
                              {r.title}
                            </Text>
                          </View>
                          {r.value ? <Text style={[styles.liveValue, (r.tone === 'bad' || r.tone === 'warn') && { color: TONE[r.tone].ink }]}>{r.value}</Text> : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
                {hintLine ? <Text style={styles.hintLine}>{hintLine}</Text> : null}
                {phase === 'error' && text.trim() && error ? <Text style={styles.error}>{error}</Text> : null}
              </ScrollView>

              <View style={styles.dock}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={keyboardOpen ? 'Ocultar el teclado' : 'Escribir o corregir con el teclado'}
                  onPress={() => (keyboardOpen ? setKeyboardOpen(false) : openKeyboard())}
                  style={[styles.dockSide, keyboardOpen && styles.dockSideOn]}
                >
                  <Ionicons name="keypad-outline" size={22} color={keyboardOpen ? '#FFFFFF' : colors.ink} />
                </Pressable>
                {canSpeak ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={listening ? 'Dejar de escuchar' : 'Hablar con Empre AI'}
                    accessibilityState={{ selected: listening }}
                    onPress={() => void listen()}
                    style={({ pressed }) => [styles.mic, listening && styles.micOn, pressed && styles.pressed]}
                  >
                    {listening ? <View style={styles.stopSquare} /> : <Ionicons name="mic" size={30} color="#FFFFFF" />}
                  </Pressable>
                ) : (
                  <View style={styles.micSpacer} />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={goLabel}
                  accessibilityState={{ disabled: !canGo, busy }}
                  disabled={!canGo}
                  onPress={() => void interpret()}
                  style={[styles.dockSide, styles.go, !canGo && styles.goOff]}
                >
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />}
                </Pressable>
              </View>
              <Text style={styles.foot}>{copy.foot}</Text>
            </>
          ) : (
            <>
              <View style={styles.headRow}>
                <View style={styles.brandRow}>
                  <Chispa size={30} animated={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liveBrandText}>Empre AI · último paso</Text>
                    <Text style={styles.title}>{actions.length === 1 ? 'Revisa y confirma' : `Revisa y confirma (${actions.length})`}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.heard} numberOfLines={3}>
                Dijiste: «{result.text}»
              </Text>
              <ScrollView style={{ maxHeight: 470 }} contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
                {actions.map((a, i) => (
                  <ActionCard
                    key={a.client_id}
                    entityId={entityId}
                    heard={result.text}
                    action={a}
                    problem={actionProblem(a)}
                    onChange={(p) => patch(i, p)}
                    onRemove={() => setActions((l) => l.filter((_, k) => k !== i))}
                    onSwap={(next) => setActions((l) => l.flatMap((x, k) => (k === i ? next : [x])))}
                  />
                ))}
              </ScrollView>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={{ gap: spacing.sm }}>
                <Button title={`Confirmar${actions.length > 1 ? ` (${actions.length})` : ''}`} onPress={() => void confirm()} loading={busy} disabled={blocked} />
                <Button title="Volver a decirlo" variant="ghost" onPress={discard} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const MOVE_REASONS: [AdjustReason, string][] = [['consumo', 'Lo usé'], ['danado', 'Se dañó'], ['vencido', 'Se venció'], ['perdida', 'Se perdió'], ['otro', 'Otro']];

/** Una tarjeta para sumar, descontar o contar. Si no se reconoce el producto, ofrece parecidos o agregarlo. */
function localMove(name: string, kind: 'add' | 'remove' | 'count', qty: number, items: InventoryItem[], reason: AdjustReason): VoiceAction {
  const known = sameNameItem(name, items);
  const from = known && known.counted && known.mode === 'exact' ? known.qty : null;
  return { client_id: newClientId(), type: 'stock', amount: 0, words: '', method: 'cash', days_ago: 0, item_ref: known?.ref, item_name: known?.name ?? name, stock_move: { kind, qty, from, reason }, warnings: [] };
}

/** Una tarjeta de inventario para «hay tantos de esto». Si no se reconoce el producto, la tarjeta ofrece parecidos o agregarlo. */
function stockAction(name: string, qty: number, items: InventoryItem[], itemId?: string): VoiceAction {
  const known = (itemId ? items.find((i) => i.ref === itemId || i.item_id === itemId) : undefined) ?? sameNameItem(name, items);
  return { client_id: newClientId(), type: 'stock', amount: 0, words: '', method: 'cash', days_ago: 0, item_ref: known?.ref, item_name: known?.name ?? name, counted: qty, warnings: [] };
}

/**
 * Falta el monto de algo con cantidad: lo que se puede resolver al instante. Primero lo que se parece y ya tiene precio, luego
 * escribir cuánto vale cada uno, y por último «no era una venta»: dejarlo como inventario.
 */
function MissingPrice({ entityId, action: a, onChange, onSwap }: { entityId: string; action: VoiceAction; onChange: (p: Partial<VoiceAction>) => void; onSwap: (next: VoiceAction[]) => void }) {
  const line = (a.lines ?? [])[0];
  const [unit, setUnit] = useState(0);
  const inventory = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), staleTime: 60_000 });
  const items = inventory.data?.items ?? [];
  const similar = similarItems(line.name, items.filter((i) => i.kind === 'product' && i.price !== null));
  const clean = (a.warnings ?? []).filter((w) => !AMOUNT_WARN.test(w));
  return (
    <View style={{ gap: spacing.sm }}>
      {similar.length > 0 ? (
        <>
          <Text style={styles.cardMeta}>¿Es uno de estos?</Text>
          <View style={styles.wrap}>
            {similar.map((s) => (
              <Chip
                key={s.ref}
                label={`${s.name} · ${formatPesos(s.price ?? 0)}`}
                selected={line.item_id === s.ref}
                onPress={() => {
                  setUnit(s.price ?? 0);
                  onChange({ amount: (s.price ?? 0) * line.qty, words: '', warnings: clean, lines: [{ ...line, name: s.name, item_id: s.item_id ?? s.ref, unit_price: s.price, from_catalog: true }] });
                }}
              />
            ))}
          </View>
        </>
      ) : null}
      <Text style={styles.cardMeta}>¿A cómo cada uno?</Text>
      <AmountField
        value={unit}
        onChange={(n) => {
          setUnit(n);
          onChange({ amount: n * line.qty, words: '', warnings: clean, lines: [{ ...line, unit_price: n, from_catalog: false }] });
        }}
      />
      {unit > 0 ? <Text style={styles.cardMeta}>{line.qty} × {formatPesos(unit)} = {formatPesos(unit * line.qty)}</Text> : null}
      {a.type === 'sale' ? (
        <Pressable accessibilityRole="button" onPress={() => onSwap([stockAction(line.name, line.qty, items, line.item_id)])} style={styles.similarRow}>
          <Ionicons name="cube-outline" size={18} color={colors.ink} />
          <Text style={styles.similarName} numberOfLines={2}>
            No fue una venta: hay {line.qty} {line.name}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A dónde fue cada cosa dictada. */
function destinationOf(a: VoiceAction): string {
  if (a.price_ask) return 'Precio';
  if (a.type === 'expense') return 'Gastos';
  if (a.type === 'payment') return 'Abonos';
  if (a.type === 'stock') return 'Inventario';
  if (a.type === 'tab_add' || a.type === 'tab_pay') return 'Cuentas abiertas';
  return a.method === 'credit' ? 'Te deben' : 'Ventas de hoy';
}

const PARTY_WARN = /¿A quién|¿Quién|¿A qué proveedor|Hay varios|No encontré/;
const AMOUNT_WARN = /monto|Entendí|Los productos suman/;

const STOCK_LEVELS: { level: 'ok' | 'low' | 'out'; label: string }[] = [
  { level: 'ok', label: 'Hay' },
  { level: 'low', label: 'Queda poco' },
  { level: 'out', label: 'Se acabó' },
];

/** Inventario dictado: «se acabó el jugo», «tengo 12 camisas». No mueve plata; se puede corregir aquí mismo. */
function StockCard({ entityId, heard, action: a, problem, onChange, onRemove }: { entityId: string; heard: string; action: VoiceAction; problem: string | null; onChange: (p: Partial<VoiceAction>) => void; onRemove: () => void }) {
  if (a.stock_move && a.item_ref) return <MoveCard action={a} move={a.stock_move} problem={problem} onChange={onChange} onRemove={onRemove} />;
  if (a.price_ask) return <PriceCard action={a} ask={a.price_ask} problem={problem} onChange={onChange} onRemove={onRemove} />;
  const unknown = !a.item_ref && !a.candidates?.length && Boolean(a.item_name?.trim());
  if (unknown) return <NewItemCard entityId={entityId} heard={heard} action={a} onChange={onChange} onRemove={onRemove} />;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name={TYPE_ICON.stock} size={18} color={colors.primary} />
        <Text style={styles.cardType}>Inventario</Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar esta tarjeta" onPress={onRemove} hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      {a.candidates && a.candidates.length > 0 && !a.item_ref ? (
        <>
          <Text style={styles.cardMeta}>¿De cuál hablas?</Text>
          <View style={styles.wrap}>
            {a.candidates.map((c) => (
              <Chip key={c.id} label={c.name} selected={false} onPress={() => onChange({ item_ref: c.id, item_name: c.name, candidates: [], warnings: [] })} />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.party}>{a.item_name || 'Producto sin identificar'}</Text>
      )}
      {a.counted != null ? (
        <Text style={styles.cardMeta}>Hay {String(a.counted).replace('.', ',')} en total (queda contado).</Text>
      ) : (
        <View style={styles.wrap}>
          {STOCK_LEVELS.map((l) => (
            <Chip key={l.level} label={l.label} selected={a.level === l.level} onPress={() => onChange({ level: l.level, warnings: [] })} />
          ))}
        </View>
      )}
      {[...(a.warnings ?? []), ...(problem && !(a.warnings ?? []).includes(problem) ? [problem] : [])].map((w) => (
        <View key={w} style={styles.warn}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.accentInk} />
          <Text style={styles.warnText}>{w}</Text>
        </View>
      ))}
    </View>
  );
}

/** Sumar, descontar o contar: dice qué va a pasar antes de confirmar y deja corregir la cantidad. */
function MoveCard({ action: a, move, problem, onChange, onRemove }: { action: VoiceAction; move: NonNullable<VoiceAction['stock_move']>; problem: string | null; onChange: (p: Partial<VoiceAction>) => void; onRemove: () => void }) {
  const set = (p: Partial<typeof move>) => onChange({ stock_move: { ...move, ...p } });
  const n = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
  const title = move.kind === 'add' ? 'Sumar al inventario' : move.kind === 'remove' ? 'Descontar del inventario' : 'Contar lo que hay';
  const uncounted = move.from === null;
  const needsCount = move.kind === 'remove' && uncounted;
  const after = move.kind === 'count' ? (uncounted ? `Empezarás a llevar la cuenta con ${n(move.qty)}.` : `Hoy hay ${n(move.from as number)}. Quedará en ${n(move.qty)}.`) : move.kind === 'add' ? (uncounted ? `Aún no llevas la cuenta: empezarás con ${n(move.qty)}.` : `Hoy hay ${n(move.from as number)}. Quedarán ${n((move.from as number) + move.qty)}.`) : uncounted ? 'Aún no llevas la cuenta de este producto.' : move.qty > (move.from as number) ? `Hoy hay ${n(move.from as number)}.` : `Hoy hay ${n(move.from as number)}. Quedarán ${n((move.from as number) - move.qty)}.`;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name={TYPE_ICON.stock} size={18} color={colors.primary} />
        <Text style={styles.cardType}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar esta tarjeta" onPress={onRemove} hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.party}>{a.item_name}</Text>
      {needsCount ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.cardMeta}>{after} ¿Cuántos quedan?</Text>
          <TextInput value={move.counted == null ? '' : String(move.counted)} onChangeText={(v) => set({ counted: v.trim() === '' ? undefined : Number(v.replace(',', '.')) || 0 })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.moveInput} accessibilityLabel="Cuántos quedan" />
        </View>
      ) : (
        <>
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel="Uno menos" disabled={move.qty <= (move.kind === 'count' ? 0 : 1)} onPress={() => set({ qty: move.qty - 1 })} style={styles.stepBtn}>
              <Ionicons name="remove" size={20} color={colors.ink} />
            </Pressable>
            <Text style={styles.stepN} accessibilityLiveRegion="polite">{n(move.qty)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Uno más" onPress={() => set({ qty: move.qty + 1 })} style={styles.stepBtn}>
              <Ionicons name="add" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <Text style={styles.cardMeta}>{after}</Text>
        </>
      )}
      {move.kind === 'remove' && !needsCount ? (
        <View style={styles.wrap}>
          {MOVE_REASONS.map(([key, label]) => (
            <Chip key={key} label={label} selected={move.reason === key} onPress={() => set({ reason: key })} />
          ))}
        </View>
      ) : null}
      {move.kind === 'remove' && !needsCount ? <Text style={styles.cardMeta}>Si lo vendiste, mejor regístralo como venta: descuenta solo y cuenta en tu plata.</Text> : null}
      {problem ? (
        <View style={styles.warn}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.accentInk} />
          <Text style={styles.warnText}>{problem}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Dijo cuánto vale algo que ya vende: nunca se cambia sin que el dueño lo elija. */
function PriceCard({ action: a, ask, problem, onChange, onRemove }: { action: VoiceAction; ask: NonNullable<VoiceAction['price_ask']>; problem: string | null; onChange: (p: Partial<VoiceAction>) => void; onRemove: () => void }) {
  const same = ask.from === ask.to;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
        <Text style={styles.cardType}>Precio</Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar esta tarjeta" onPress={onRemove} hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.party}>{a.item_name}</Text>
      {same ? (
        <Text style={styles.cardMeta}>Ya vale {formatPesos(ask.to)}. No hay nada que cambiar.</Text>
      ) : (
        <>
          <Text style={styles.cardMeta}>{ask.from === null ? 'Aún no tiene precio.' : `Hoy vale ${formatPesos(ask.from)}.`} Dijiste {formatPesos(ask.to)}.</Text>
          <View style={styles.wrap}>
            <Chip label={ask.from === null ? `Poner ${formatPesos(ask.to)}` : `Cambiar a ${formatPesos(ask.to)}`} selected={a.price_ok === true} onPress={() => onChange({ price_ok: true })} />
            <Chip label={ask.from === null ? 'Dejarlo sin precio' : `Dejar ${formatPesos(ask.from)}`} selected={a.price_ok === false} onPress={() => onChange({ price_ok: false })} />
          </View>
          {problem ? (
            <View style={styles.warn}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.accentInk} />
              <Text style={styles.warnText}>{problem}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/**
 * Lo dictado no está en el inventario: primero lo que se le parece de verdad, entre lo que vende y sus insumos; si no es
 * ninguno, se agrega aquí mismo con el precio que dijo, sin salir de la hoja.
 */
function NewItemCard({ entityId, heard, action: a, onChange, onRemove }: { entityId: string; heard: string; action: VoiceAction; onChange: (p: Partial<VoiceAction>) => void; onRemove: () => void }) {
  const qc = useQueryClient();
  const name = a.item_name?.trim() ?? '';
  const inventory = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), staleTime: 60_000 });
  const sections = useEntitySections(entityId, 'sell');
  const list = (sections.data ?? []).filter((s) => s.kind === 'sell');
  const supplySections = useEntitySections(entityId, 'supply');
  const supplyList = (supplySections.data ?? []).filter((s) => s.kind === 'supply');
  const [supplySectionId, setSupplySectionId] = useState<string | null>(null);
  const supplySection = supplySectionId ?? supplyList[0]?.id ?? null;
  const similar = similarItems(name, inventory.data?.items ?? []);
  const [kind, setKind] = useState<'product' | 'supply'>('product');
  const [price, setPrice] = useState(() => dictatedPrice(heard) ?? 0);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const section = sectionId ?? list[0]?.id ?? null;
  const add = useMutation({
    mutationFn: async () => {
      if (kind === 'supply') {
        const supply = await ledgerApi.createSupply(entityId, { client_id: newClientId(), name, mode: 'light', section_id: supplySection ?? undefined });
        return supply.id;
      }
      const item = await catalogApi.create(entityId, { name, price: price > 0 ? price : null, price_from: false, section_id: section ?? undefined, kind: 'product' });
      return item.id;
    },
    onSuccess: (ref) => {
      void qc.invalidateQueries({ queryKey: ['ledger', entityId] });
      void qc.invalidateQueries({ queryKey: ['catalog', entityId] });
      onChange({ item_ref: ref, level: a.counted == null && !a.stock_move ? a.level || 'ok' : a.level, stock_move: a.stock_move ? { ...a.stock_move, kind: a.stock_move.kind === 'remove' ? 'count' : a.stock_move.kind, from: null } : undefined, warnings: [] });
    },
  });
  const pick = (ref: string, itemName: string) => {
    const it = (inventory.data?.items ?? []).find((i) => i.ref === ref);
    onChange({ item_ref: ref, item_name: itemName, candidates: [], level: a.counted == null && !a.stock_move ? a.level || 'ok' : a.level, stock_move: a.stock_move ? { ...a.stock_move, from: it && it.counted && it.mode === 'exact' ? it.qty : null } : undefined, warnings: [] });
  };
  const canAdd = kind === 'supply' ? Boolean(supplySection) : Boolean(section);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name={TYPE_ICON.stock} size={18} color={colors.primary} />
        <Text style={styles.cardType}>Inventario</Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar esta tarjeta" onPress={onRemove} hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.party}>«{name}» aún no está en tu inventario</Text>
      {a.counted != null ? <Text style={styles.cardMeta}>Quedará con {String(a.counted).replace('.', ',')} en total.</Text> : null}

      {similar.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.cardMeta}>¿Hablas de uno de estos?</Text>
          {similar.map((s) => (
            <Pressable key={s.ref} accessibilityRole="button" accessibilityLabel={`${s.name}, ${s.kind === 'supply' ? 'insumo' : 'lo que vendes'}`} onPress={() => pick(s.ref, s.name)} style={styles.similarRow}>
              <Ionicons name={s.kind === 'supply' ? 'flask-outline' : 'pricetag-outline'} size={18} color={colors.ink} />
              <Text style={styles.similarName} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={styles.cardMeta}>{s.kind === 'supply' ? 'Insumo' : 'Lo vendes'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.cardMeta}>{similar.length > 0 ? 'Si es otro, agrégalo:' : 'Agrégalo de una vez:'}</Text>
        <View style={styles.wrap}>
          <Chip label="Lo vendo" selected={kind === 'product'} onPress={() => setKind('product')} />
          <Chip label="Lo uso en mi trabajo" selected={kind === 'supply'} onPress={() => setKind('supply')} />
        </View>
        {kind === 'product' ? (
          <>
            <AmountField value={price} onChange={setPrice} />
            {dictatedPrice(heard) && price === dictatedPrice(heard) ? <Text style={styles.cardMeta}>Es el precio que dijiste. Puedes cambiarlo.</Text> : null}
            {list.length > 1 ? (
              <View style={styles.wrap}>
                {list.map((s) => (
                  <Chip key={s.id} label={s.name} selected={section === s.id} onPress={() => setSectionId(s.id)} />
                ))}
              </View>
            ) : null}
            {!sections.isLoading && list.length === 0 ? <Text style={styles.cardMeta}>Primero elige una sección para tus productos desde tu catálogo.</Text> : null}
          </>
        ) : (
          <>
            <Text style={styles.cardMeta}>Los insumos no se le muestran a tus clientes.</Text>
            {supplyList.length > 1 ? (
              <View style={styles.wrap}>
                {supplyList.map((s) => (
                  <Chip key={s.id} label={s.name} selected={supplySection === s.id} onPress={() => setSupplySectionId(s.id)} />
                ))}
              </View>
            ) : null}
            {!supplySections.isLoading && supplyList.length === 0 ? <Text style={styles.cardMeta}>Primero elige una sección de insumos desde tu inventario.</Text> : null}
          </>
        )}
        {add.isError ? (
          <View style={styles.warn}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.warnText}>{add.error instanceof Error ? add.error.message : 'No se pudo agregar. Inténtalo de nuevo.'}</Text>
          </View>
        ) : null}
        <Button title={kind === 'product' ? `Agregar «${name}»` : `Agregar «${name}» a insumos`} variant="secondary" disabled={!canAdd} loading={add.isPending} onPress={() => add.mutate()} />
      </View>
    </View>
  );
}

/** Cuentas abiertas dictadas: «mesa 3: dos bandejas» o «cobra la mesa 3». */
function TabCard({ entityId, action: a, problem, onChange, onRemove }: { entityId: string; action: VoiceAction; problem: string | null; onChange: (p: Partial<VoiceAction>) => void; onRemove: () => void }) {
  const add = a.type === 'tab_add';
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name={TYPE_ICON[a.type]} size={18} color={colors.primary} />
        <Text style={styles.cardType}>{TYPE_LABEL[a.type]}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          · {a.tab_name ? (a.new_tab && !a.tab_id ? `${a.tab_name} (se abre)` : a.tab_name) : 'sin cuenta'}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar esta tarjeta" onPress={onRemove} hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      {add ? (
        <View style={{ gap: 2 }}>
          {(a.lines ?? []).map((l, k) => (
            <Text key={`${l.name}${k}`} style={styles.cardMeta}>
              {l.qty} × {l.name}
              {l.unit_price != null ? ` · ${formatPesos(l.unit_price)} c/u` : ' · sin precio'}
            </Text>
          ))}
          {a.amount > 0 ? <Text style={styles.party}>Suma {formatPesos(a.amount)} a la cuenta</Text> : null}
        </View>
      ) : (
        <>
          <Text style={styles.party}>{a.amount > 0 ? `Total: ${formatPesos(a.amount)}` : 'La cuenta'}</Text>
          <MethodChips value={a.method} onChange={(m) => onChange({ method: m })} />
          {a.method === 'credit' ? (
            <PartyPicker
              entityId={entityId}
              kind="customer"
              value={a.party_id ? { id: a.party_id, name: a.party_name ?? '' } : null}
              onChange={(p) => onChange({ party_id: p?.id, party_name: p?.name, new_party: false })}
              onNew={(name) => onChange({ party_id: undefined, party_name: name, new_party: true })}
            />
          ) : null}
        </>
      )}
      {(a.warnings ?? []).map((w) => (
        <Text key={w} style={styles.warn}>
          {w}
        </Text>
      ))}
      {problem ? <Text style={styles.error}>{problem}</Text> : null}
    </View>
  );
}

function ActionCard({ entityId, heard, action: a, problem, onChange, onRemove, onSwap }: { entityId: string; heard: string; action: VoiceAction; problem: string | null; onChange: (p: Partial<VoiceAction>) => void; onRemove: () => void; onSwap: (next: VoiceAction[]) => void }) {
  // Se decide al llegar y no cambia: escribir el precio no debe esconder lo que se está escribiendo.
  const [needsPrice] = useState(a.amount <= 0 && a.lines?.length === 1 && (a.type === 'sale' || a.type === 'expense'));
  const [editing, setEditing] = useState(a.amount <= 0);
  if (a.type === 'stock') return <StockCard entityId={entityId} heard={heard} action={a} problem={problem} onChange={onChange} onRemove={onRemove} />;
  if (a.type === 'tab_add' || a.type === 'tab_pay') return <TabCard entityId={entityId} action={a} problem={problem} onChange={onChange} onRemove={onRemove} />;
  const setParty = (p: Partial<VoiceAction>) => onChange({ ...p, warnings: (a.warnings ?? []).filter((w) => !PARTY_WARN.test(w)) });
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name={TYPE_ICON[a.type]} size={18} color={colors.primary} />
        <Text style={styles.cardType}>{TYPE_LABEL[a.type]}</Text>
        {a.type === 'expense' && a.category ? <Text style={styles.cardMeta}>· {categoryLabel(a.category)}</Text> : null}
        {a.days_ago > 0 ? <Text style={styles.cardMeta}>· hace {a.days_ago} {a.days_ago === 1 ? 'día' : 'días'}</Text> : null}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar esta tarjeta" onPress={onRemove} hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <PayDeck
        out={a.type === 'expense'}
        methods={a.type === 'payment' ? ['cash', 'transfer', 'card'] : ['cash', 'transfer', 'card', 'credit']}
        value={a.method}
        onChange={(m) => {
          onChange({ method: m });
          if (a.amount > 0) setEditing(false);
        }}
        amount={a.amount}
        party={a.party_name || undefined}
        onEdit={() => setEditing((v) => !v)}
      />
      {needsPrice ? <MissingPrice entityId={entityId} action={a} onChange={onChange} onSwap={onSwap} /> : null}
      {editing && !needsPrice ? <AmountField value={a.amount} onChange={(n) => onChange({ amount: n, words: '', warnings: (a.warnings ?? []).filter((w) => !AMOUNT_WARN.test(w)) })} /> : null}

      {a.lines && a.lines.length > 0 && !needsPrice ? (
        <View style={{ gap: 2 }}>
          {a.lines.map((l, k) => (
            <Text key={`${l.name}${k}`} style={styles.cardMeta}>
              {l.qty} × {l.name}
              {l.unit_price != null ? ` · ${formatPesos(l.unit_price)} c/u${l.from_catalog ? ' (de tu catálogo)' : ''}` : ' · sin precio'}
            </Text>
          ))}
        </View>
      ) : null}

      {a.party_id || a.new_party || (a.candidates && a.candidates.length > 0) || a.type === 'payment' || a.method === 'credit' ? (
        <View style={{ gap: spacing.xs }}>
          {a.candidates && a.candidates.length > 0 && !a.party_id ? (
            <>
              <Text style={styles.cardMeta}>¿Cuál de estos?</Text>
              <View style={styles.wrap}>
                {a.candidates.map((c) => (
                  <Chip key={c.id} label={c.name} selected={false} onPress={() => setParty({ party_id: c.id, party_name: c.name, new_party: false, candidates: [] })} />
                ))}
              </View>
            </>
          ) : a.party_id || a.new_party ? (
            <View style={styles.partyRow}>
              <Text style={[styles.party, { flex: 1 }]} numberOfLines={1}>
                {a.type === 'expense' ? 'Proveedor' : 'Cliente'}
                {a.new_party && !a.party_id ? ' nuevo' : ''}: {a.party_name}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cambiar" onPress={() => onChange({ party_id: undefined, party_name: '', new_party: false, candidates: [] })} hitSlop={8}>
                <Text style={styles.link}>Cambiar</Text>
              </Pressable>
            </View>
          ) : (
            <PartyPicker
              entityId={entityId}
              kind={a.type === 'expense' ? 'supplier' : 'customer'}
              value={null}
              onChange={(p) => p && setParty({ party_id: p.id, party_name: p.name, new_party: false, candidates: [] })}
              onNew={(name) => setParty({ party_id: undefined, party_name: name, new_party: true, candidates: [] })}
            />
          )}
        </View>
      ) : null}

      {[...(a.warnings ?? []), ...(problem && !(a.warnings ?? []).includes(problem) ? [problem] : [])].filter((w) => !(needsPrice && w === 'Falta el monto.')).map((w) => (
        <View key={w} style={styles.warn}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.accentInk} />
          <Text style={styles.warnText}>{w}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  topStatus: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  stage: { flexGrow: 1, alignItems: 'center', gap: 14, paddingBottom: spacing.md },
  orbArea: { alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 190 },
  orbAreaBig: { minHeight: 250 },
  stageTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  stageBody: { maxWidth: 300, fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center' },
  saidTap: { alignSelf: 'stretch', minHeight: 44, justifyContent: 'center' },
  said: { fontSize: 20, lineHeight: 30, fontFamily: fonts.ui.bold, color: colors.muted, textAlign: 'center' },
  saidWord: { fontFamily: fonts.ui.extrabold, borderRadius: 6 },
  prompts: { alignSelf: 'stretch', gap: spacing.sm },
  prompt: { minHeight: 48, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  promptText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  liveBlock: { alignSelf: 'stretch', gap: spacing.sm },
  liveLabel: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted },
  list: { borderRadius: 18, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: 'hidden' },
  liveRow: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveRowSep: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  liveIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  liveTag: { fontSize: 11.5, fontFamily: fonts.ui.extrabold },
  liveTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  liveValue: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  hintLine: { alignSelf: 'stretch', fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center' },
  dock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  dockSide: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dockSideOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  go: { backgroundColor: colors.ink, borderColor: colors.ink },
  goOff: { backgroundColor: '#C7D2E0', borderColor: '#C7D2E0' },
  mic: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', shadowColor: colors.ink, shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  micOn: { backgroundColor: colors.primary, shadowColor: colors.primary },
  micSpacer: { width: 76, height: 76 },
  stopSquare: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#FFFFFF' },
  foot: { textAlign: 'center', fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.faint },
  pressed: { opacity: 0.85 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11, 21, 38, 0.52)', justifyContent: 'flex-end' },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
    overflow: 'hidden',
    ...softShadow,
  },
  stockDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.placeholder },
  stockHas: { backgroundColor: '#14B8B0' },
  stockOut: { backgroundColor: colors.brand },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  stepN: { minWidth: 56, textAlign: 'center', fontSize: 28, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  moveInput: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, fontSize: 18, fontFamily: fonts.ui.bold, color: colors.ink },
  similarRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  similarName: { flex: 1, minWidth: 0, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  liveBrandText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.verified, letterSpacing: 0.7 },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...softShadow,
  },
  modeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.hairline,
  },
  modePill: {
    flex: 1,
    minHeight: 44,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  modePillOn: {
    backgroundColor: colors.surface,
    ...softShadow,
  },
  modePillText: {
    fontSize: 13,
    fontFamily: fonts.ui.extrabold,
    color: colors.muted,
  },
  modePillTextOn: {
    color: colors.ink,
  },
  stageInput: {
    minHeight: 84,
    maxHeight: 140,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    fontSize: 18,
    lineHeight: 25,
    fontFamily: fonts.display.bold,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  title: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  heard: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, fontStyle: 'italic' },
  error: { fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.danger },
  card: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardType: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  cardMeta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.primary },
  party: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: radius.sm, padding: spacing.sm },
  warnText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.accentInk },
  doneBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
});
