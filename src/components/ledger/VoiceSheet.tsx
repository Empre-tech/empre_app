import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '@/api/catalog';
import { ApiError } from '@/api/client';
import { ledgerApi, type AdjustReason, type InventoryItem, type VoiceAction, type VoiceResult } from '@/api/ledger';
import { useEntitySections } from '@/api/sections';
import { Button } from '@/components/Button';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { DoneMark } from '@/components/ledger/Flow';
import { AmountField, Chip, MethodChips, PartyPicker } from '@/components/ledger/parts';
import { PayDeck } from '@/components/ledger/PayDeck';
import { categoryLabel, formatPesos, newClientId } from '@/lib/ledger';
import { speechAvailable, startDictation } from '@/ledger/speech';
import { liveParse, type WordTag } from '@/lib/voiceLive';
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

function wordTagStyle(tag?: WordTag) {
  switch (tag) {
    case 'item':
      return styles.tagItem;
    case 'money':
      return styles.tagMoney;
    case 'stock_out':
      return styles.tagStockOut;
    case 'stock_low':
      return styles.tagStockLow;
    case 'stock_ok':
    case 'filter':
      return styles.tagFilter;
    default:
      return undefined;
  }
}

/**
 * Empre AI Live (estilo Google Gemini): lienzo de transcripción en vivo palabra por palabra,
 * tarjetas reactivas instantáneas según el módulo ('finance' | 'inventory' | 'search') y
 * onda acústica multicolor en la base. Nada mueve caja ni inventario sin confirmación del dueño.
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

  // Animación de onda acústica multicolor estilo Gemini
  const wave1 = useRef(new Animated.Value(0.4)).current;
  const wave2 = useRef(new Animated.Value(0.4)).current;
  const wave3 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!listening) {
      wave1.setValue(0.4);
      wave2.setValue(0.4);
      wave3.setValue(0.4);
      return;
    }
    const makeLoop = (val: Animated.Value, dur: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.35, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    const l1 = makeLoop(wave1, 420, 0);
    const l2 = makeLoop(wave2, 340, 110);
    const l3 = makeLoop(wave3, 480, 220);
    l1.start();
    l2.start();
    l3.start();
    return () => {
      l1.stop();
      l2.stop();
      l3.stop();
    };
  }, [listening, wave1, wave2, wave3]);

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
    setListening(true);
    const stop = await startDictation(
      {
        onText: (t) => setText(t),
        onEnd: () => setListening(false),
        onError: (m) => {
          setError(m);
          setListening(false);
        },
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
  const liveCount =
    mode === 'search'
      ? Number(live.searchFilters.open_now) + Number(live.searchFilters.with_offer) + Number(live.searchFilters.delivery) + Number(live.searchFilters.cheapest)
      : live.lines.length + (live.expense ? 1 : 0) + live.stock.length;

  const subtitleText =
    mode === 'finance'
      ? listening
        ? 'Escuchando ventas, gastos o fiados…'
        : 'Habla o toca una frase para registrar en caja'
      : mode === 'inventory'
        ? listening
          ? 'Escuchando existencias e insumos…'
          : 'Di qué se acabó, qué queda poco o cuánto llegó'
        : listening
          ? 'Escuchando qué necesitas en tu zona…'
          : 'Di qué negocio, servicio u oferta buscas hoy';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={result || answer ? undefined : onClose} accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {/* Halo luminoso estilo Google Gemini en la base */}
          {listening ? <View pointerEvents="none" style={[styles.geminiAura, styles.geminiAuraActive]} /> : null}

          <View style={styles.handle} />

          {done ? (
            <View style={styles.doneBox}>
              {/* El mismo visto con resorte que al registrar una venta o un gasto a mano. */}
              <DoneMark />
              <Text style={styles.title} accessibilityLiveRegion="polite">
                {savedList.some((a) => a.type === 'stock') ? 'Actualizado con Empre AI' : 'Registrado en Empre Finance'}
              </Text>
              <View style={styles.destList}>
                {savedList.map((a) => (
                  <View key={a.client_id} style={styles.destRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.destTitle}>{destinationOf(a)}</Text>
                      <Text style={styles.hint} numberOfLines={1}>
                        {a.note || a.party_name || a.item_name || TYPE_LABEL[a.type]}
                      </Text>
                    </View>
                    {a.amount > 0 ? <Text style={styles.destTitle}>{formatPesos(a.amount)}</Text> : null}
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
                  <EmpreSymbol product="ai" size={28} animated={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liveBrandText}>EMPRE AI · RESPUESTA</Text>
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
              {/* SLOT A: Cabecera Empre AI Live + Pastillas de Módulo */}
              <View style={styles.headRow}>
                <View style={styles.brandRow}>
                  <EmpreSymbol product="ai" size={30} animated />
                  <View style={{ flex: 1 }}>
                    <View style={styles.liveTagRow}>
                      <Text style={styles.liveBrandText}>EMPRE AI LIVE</Text>
                      {listening ? <View style={styles.livePulseDot} /> : null}
                    </View>
                    <Text style={styles.subtitle} numberOfLines={1}>
                      {subtitleText}
                    </Text>
                  </View>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Cerrar Empre AI" onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                  <Ionicons name="close" size={18} color={colors.ink} />
                </Pressable>
              </View>

              {/* Selector de Módulo Contextual (Finanzas / Inventario / Búsqueda) */}
              <View style={styles.modeTrack}>
                {entityId ? (
                  <>
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: mode === 'finance' }}
                      onPress={() => setMode('finance')}
                      style={[styles.modePill, styles.modeRow, mode === 'finance' && styles.modePillOn]}
                    >
                      <Ionicons name="wallet-outline" size={15} color={mode === 'finance' ? colors.ink : colors.muted} />
                      <Text style={[styles.modePillText, mode === 'finance' && styles.modePillTextOn]}>Finanzas</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: mode === 'inventory' }}
                      onPress={() => setMode('inventory')}
                      style={[styles.modePill, styles.modeRow, mode === 'inventory' && styles.modePillOn]}
                    >
                      <Ionicons name="cube-outline" size={15} color={mode === 'inventory' ? colors.ink : colors.muted} />
                      <Text style={[styles.modePillText, mode === 'inventory' && styles.modePillTextOn]}>Inventario</Text>
                    </Pressable>
                  </>
                ) : null}
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === 'search' }}
                  onPress={() => setMode('search')}
                  style={[styles.modePill, styles.modeRow, mode === 'search' && styles.modePillOn]}
                >
                  <Ionicons name="search" size={15} color={mode === 'search' ? colors.ink : colors.muted} />
                  <Text style={[styles.modePillText, mode === 'search' && styles.modePillTextOn]}>Buscar</Text>
                </Pressable>
              </View>

              {/* SLOT B: Lienzo Central de Transcripción Viva (Estilo Google Gemini) */}
              <View style={styles.stageBox}>
                <Text style={styles.stageEyebrow}>LO QUE ESTÁS DICIENDO</Text>

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
                    accessibilityLabel="Transcripción en vivo de Empre AI"
                  />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Toca para editar con el teclado lo que estás diciendo"
                    onPress={() => {
                      setKeyboardOpen(true);
                      setTimeout(() => inputRef.current?.focus(), 80);
                    }}
                    style={styles.liveTranscriptTap}
                  >
                    {live.words.length > 0 ? (
                      <Text style={styles.liveTranscriptText} accessibilityLiveRegion="polite">
                        «
                        {live.words.map((w, i) => (
                          <Text key={i} style={[w.known && styles.wordKnown, wordTagStyle(w.tag)]}>
                            {`${w.text}${i < live.words.length - 1 ? ' ' : ''}`}
                          </Text>
                        ))}
                        »
                      </Text>
                    ) : (
                      <Text style={styles.livePlaceholder}>
                        {listening
                          ? 'Habla con naturalidad… Empre AI escribe aquí lo que vas diciendo.'
                          : 'Toca la onda de voz abajo para hablar, o elige un ejemplo rápido:'}
                      </Text>
                    )}
                  </Pressable>
                )}

                {/* Frases de ejemplo tocables */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptsRow}>
                  {QUICK_PROMPTS[mode].map((prompt) => (
                    <Pressable
                      key={prompt}
                      accessibilityRole="button"
                      onPress={() => setText((prev) => (prev.trim() ? `${prev.trim()}, ${prompt.toLowerCase()}` : prompt))}
                      style={styles.promptChip}
                    >
                      <Text style={styles.promptChipText}>«{prompt}»</Text>
                    </Pressable>
                  ))}
                  {text.trim() ? (
                    <Pressable accessibilityRole="button" onPress={() => setText('')} style={styles.clearChip}>
                      <Text style={styles.clearChipText}>Limpiar</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              </View>

              {/* SLOT C: Tarjetas Vivas Detectadas en Tiempo Real según el Módulo */}
              {text.trim().length > 0 ? (
                <View style={styles.liveCardsSection} accessibilityLiveRegion="polite">
                  <View style={styles.liveCardsHeader}>
                    <Text style={styles.stageEyebrow}>
                      {mode === 'search' ? 'FILTROS DETECTADOS EN VIVO' : 'ENTENDIDO EN TIEMPO REAL'}
                    </Text>
                    <Text style={styles.liveReadyBadge}>
                      {liveCount > 0 ? `${liveCount} ${liveCount === 1 ? 'detección' : 'detecciones'}` : 'Analizando frase…'}
                    </Text>
                  </View>

                  {mode === 'search' ? (
                    <View style={styles.wrap}>
                      <View style={styles.searchPreviewPill}>
                        <Ionicons name="search" size={13} color="#fff" />
                        <Text style={styles.searchPreviewText} numberOfLines={1}>
                          {text.trim()}
                        </Text>
                      </View>
                      {live.searchFilters.open_now ? (
                        <View style={[styles.filterPill, styles.filterRow, { backgroundColor: colors.verifiedSoft }]}>
                          <View style={styles.openDot} />
                          <Text style={[styles.filterPillText, { color: colors.verified }]}>Abierto ahora</Text>
                        </View>
                      ) : null}
                      {live.searchFilters.with_offer ? (
                        <View style={[styles.filterPill, styles.filterRow, { backgroundColor: colors.accentSoft }]}>
                          <Ionicons name="pricetag-outline" size={13} color={colors.accentInk} />
                          <Text style={[styles.filterPillText, { color: colors.accentInk }]}>Con oferta</Text>
                        </View>
                      ) : null}
                      {live.searchFilters.delivery ? (
                        <View style={[styles.filterPill, styles.filterRow, { backgroundColor: colors.selectedSoft }]}>
                          <Ionicons name="bicycle-outline" size={14} color={colors.ink} />
                          <Text style={[styles.filterPillText, { color: colors.ink }]}>Domicilio</Text>
                        </View>
                      ) : null}
                      {live.searchFilters.cheapest ? (
                        <View style={[styles.filterPill, styles.filterRow, { backgroundColor: colors.selectedSoft }]}>
                          <Ionicons name="cash-outline" size={14} color={colors.ink} />
                          <Text style={[styles.filterPillText, { color: colors.ink }]}>Más económico</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <ScrollView style={{ maxHeight: 168 }} contentContainerStyle={{ gap: 8 }}>
                      {/* Tarjetas en vivo de Ventas */}
                      {live.lines.map((l) => (
                        <View key={l.name} style={styles.liveActionCard}>
                          <View style={[styles.liveActionIcon, { backgroundColor: colors.verifiedSoft }]}>
                            <Ionicons name="arrow-up" size={16} color={colors.verified} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.liveActionTag}>
                              VENTA {live.method ? `· ${live.method.toUpperCase()}` : '· CATÁLOGO'}
                              {live.fiadoTo ? ` (${live.fiadoTo})` : ''}
                            </Text>
                            <Text style={styles.liveActionTitle} numberOfLines={1}>
                              {l.qty} × {l.name}
                              {l.fixed ? ' (corregido)' : ''}
                            </Text>
                          </View>
                          {l.price ? <Text style={styles.liveActionAmount}>{formatPesos(l.price * l.qty)}</Text> : null}
                        </View>
                      ))}

                      {/* Tarjeta en vivo de Gasto */}
                      {live.expense ? (
                        <View style={styles.liveActionCard}>
                          <View style={[styles.liveActionIcon, { backgroundColor: '#FEE2E2' }]}>
                            <Ionicons name="arrow-down" size={16} color={colors.danger} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.liveActionTag, { color: colors.danger }]}>GASTO DETECTADO</Text>
                            <Text style={styles.liveActionTitle} numberOfLines={1}>
                              {live.expense.what ? `Compra / pago: ${live.expense.what}` : 'Gasto del día'}
                            </Text>
                          </View>
                          {live.expense.amount > 0 ? (
                            <Text style={[styles.liveActionAmount, { color: colors.danger }]}>−{formatPesos(live.expense.amount)}</Text>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Tarjetas en vivo de Semáforo de Inventario */}
                      {live.stock.map((st) => {
                        const isOut = st.level === 'out';
                        const isLow = st.level === 'low';
                        const borderCol = isOut ? '#DC2626' : isLow ? '#F59E0B' : '#10B981';
                        const badgeBg = isOut ? '#FEE2E2' : isLow ? '#FEF3C7' : '#D1FAE5';
                        const badgeFg = isOut ? '#B91C1C' : isLow ? '#B45309' : '#047857';
                        const label = isOut ? 'Agotado' : isLow ? 'Poco' : st.counted != null ? `Hay (${st.counted})` : 'Hay';
                        return (
                          <View key={st.name} style={[styles.liveActionCard, { borderLeftWidth: 4, borderLeftColor: borderCol }]}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.liveActionTag, { color: badgeFg }]}>SEMÁFORO DE INVENTARIO</Text>
                              <Text style={styles.liveActionTitle} numberOfLines={1}>
                                {st.name}
                              </Text>
                            </View>
                            <View style={[styles.semPill, { backgroundColor: badgeBg }]}>
                              <View style={[styles.semDot, { backgroundColor: borderCol }]} />
                              <View style={[styles.semDot, { backgroundColor: isOut ? '#CBD5E1' : borderCol }]} />
                              <View style={[styles.semDot, { backgroundColor: isOut || isLow ? '#CBD5E1' : borderCol }]} />
                              <Text style={[styles.semPillText, { color: badgeFg }]}>{label}</Text>
                            </View>
                          </View>
                        );
                      })}

                      {live.lines.length === 0 && !live.expense && live.stock.length === 0 ? (
                        <View style={styles.liveActionCard}>
                          <Ionicons name="sparkles-outline" size={18} color={colors.verified} />
                          <Text style={styles.hint} numberOfLines={2}>
                            {liveIntent?.kind === 'ask' ? `Vas a preguntar si hay «${liveIntent.name}». Toca «Preguntar».` : liveIntent?.kind === 'add' && mode === 'inventory' ? `Vas a sumar ${liveIntent.qty} a «${liveIntent.name}».` : liveIntent?.kind === 'remove' && mode === 'inventory' ? `Vas a descontar ${liveIntent.qty} de «${liveIntent.name}».` : liveIntent?.kind === 'count' && mode === 'inventory' ? `Vas a dejar «${liveIntent.name}» en ${liveIntent.qty}.` : `Empre AI procesará tu frase completa al tocar «${mode === 'inventory' ? 'Actualizar' : 'Continuar'}».`}
                          </Text>
                        </View>
                      ) : null}
                    </ScrollView>
                  )}
                </View>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {/* SLOT D: Dock Inferior Estilo Google Gemini (Teclado · Onda Acústica Multicolor · Acción Directa) */}
              <View style={styles.geminiDock}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={keyboardOpen ? 'Ocultar edición con teclado' : 'Escribir o corregir con teclado'}
                  onPress={() => {
                    const next = !keyboardOpen;
                    setKeyboardOpen(next);
                    if (next) setTimeout(() => inputRef.current?.focus(), 80);
                  }}
                  style={[styles.dockRoundBtn, keyboardOpen && styles.dockRoundBtnOn]}
                >
                  <Ionicons name="keypad-outline" size={20} color={keyboardOpen ? '#fff' : colors.ink} />
                </Pressable>

                {canSpeak ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={listening ? 'Pausar micrófono de Empre AI' : 'Hablar con Empre AI'}
                    onPress={() => void listen()}
                    style={[styles.geminiOrbBtn, listening && styles.geminiOrbBtnActive]}
                  >
                    <View style={styles.waveBars}>
                      <Animated.View style={[styles.waveBar, { backgroundColor: '#14B8B0', transform: [{ scaleY: wave1 }] }]} />
                      <Animated.View style={[styles.waveBar, { backgroundColor: '#38BDF8', height: 18, transform: [{ scaleY: wave2 }] }]} />
                      <Animated.View style={[styles.waveBar, { backgroundColor: '#FF8A1F', height: 16, transform: [{ scaleY: wave3 }] }]} />
                      <Animated.View style={[styles.waveBar, { backgroundColor: '#F03232', height: 18, transform: [{ scaleY: wave1 }] }]} />
                      <Animated.View style={[styles.waveBar, { backgroundColor: '#14B8B0', transform: [{ scaleY: wave2 }] }]} />
                    </View>
                    <Text style={styles.geminiOrbText}>{listening ? 'Escuchando…' : 'Hablar'}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.geminiOrbBtn}>
                    <Text style={styles.geminiOrbText}>Modo texto</Text>
                  </View>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={mode === 'search' ? 'Buscar ahora' : 'Continuar y revisar tarjetas'}
                  disabled={!text.trim() || busy}
                  onPress={() => void interpret()}
                  style={[styles.dockConfirmBtn, (!text.trim() || busy) && styles.dockConfirmBtnDisabled]}
                >
                  <Text style={styles.dockConfirmText}>
                    {busy ? '…' : mode === 'search' ? 'Buscar' : liveIntent?.kind === 'ask' ? 'Preguntar' : mode === 'inventory' ? 'Actualizar' : 'Continuar'}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.headRow}>
                <View style={styles.brandRow}>
                  <EmpreSymbol product="ai" size={28} animated={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liveBrandText}>EMPRE AI · PASO FINAL</Text>
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#14B8B0' },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11, 21, 38, 0.52)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
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
  geminiAura: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: -36,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(20, 184, 176, 0.08)',
  },
  geminiAuraActive: {
    backgroundColor: 'rgba(20, 184, 176, 0.16)',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  liveTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveBrandText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.verified, letterSpacing: 0.7 },
  livePulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  subtitle: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.selectedSoft,
  },
  modeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modePill: {
    flex: 1,
    minHeight: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  modePillOn: {
    backgroundColor: colors.selectedSoft,
  },
  modePillText: {
    fontSize: 12,
    fontFamily: fonts.ui.extrabold,
    color: colors.muted,
  },
  modePillTextOn: {
    color: colors.ink,
  },
  stageBox: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 10,
  },
  stageEyebrow: {
    fontSize: 11,
    letterSpacing: 0.8,
    fontFamily: fonts.ui.extrabold,
    color: colors.faint,
  },
  liveTranscriptTap: {
    minHeight: 84,
    justifyContent: 'center',
  },
  liveTranscriptText: {
    fontSize: 21,
    lineHeight: 30,
    fontFamily: fonts.display.bold,
    color: colors.ink,
  },
  livePlaceholder: {
    fontSize: 18,
    lineHeight: 26,
    fontFamily: fonts.display.bold,
    color: colors.placeholder,
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
  wordKnown: {
    fontFamily: fonts.display.bold,
    color: colors.ink,
  },
  tagItem: {
    color: colors.verified,
    backgroundColor: colors.verifiedSoft,
  },
  tagMoney: {
    color: '#0369A1',
    backgroundColor: '#E0F2FE',
  },
  tagStockOut: {
    color: colors.danger,
    backgroundColor: '#FEE2E2',
  },
  tagStockLow: {
    color: colors.accentInk,
    backgroundColor: '#FEF3C7',
  },
  tagFilter: {
    color: '#047857',
    backgroundColor: '#D1FAE5',
  },
  promptsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  promptChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  promptChipText: {
    fontSize: 12,
    fontFamily: fonts.ui.bold,
    color: colors.muted,
  },
  clearChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
  },
  clearChipText: {
    fontSize: 12,
    fontFamily: fonts.ui.extrabold,
    color: colors.danger,
  },
  liveCardsSection: {
    gap: 8,
    paddingTop: 4,
  },
  liveCardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveReadyBadge: {
    fontSize: 11.5,
    fontFamily: fonts.ui.extrabold,
    color: colors.verified,
  },
  liveActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  liveActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveActionTag: {
    fontSize: 10.5,
    letterSpacing: 0.5,
    fontFamily: fonts.ui.extrabold,
    color: colors.verified,
  },
  liveActionTitle: {
    fontSize: 14.5,
    fontFamily: fonts.ui.extrabold,
    color: colors.ink,
  },
  liveActionAmount: {
    fontSize: 15,
    fontFamily: fonts.ui.extrabold,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  semPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  semDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  semPillText: {
    fontSize: 11.5,
    fontFamily: fonts.ui.extrabold,
    marginLeft: 2,
  },
  searchPreviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  searchPreviewText: {
    fontSize: 12.5,
    fontFamily: fonts.ui.extrabold,
    color: '#fff',
    maxWidth: 200,
  },
  filterPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: fonts.ui.extrabold,
  },
  geminiDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  dockRoundBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockRoundBtnOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  geminiOrbBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    ...softShadow,
  },
  geminiOrbBtnActive: {
    backgroundColor: colors.ink,
  },
  waveBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    height: 20,
  },
  waveBar: {
    width: 3.5,
    height: 14,
    borderRadius: 2,
  },
  geminiOrbText: {
    fontSize: 13,
    fontFamily: fonts.ui.extrabold,
    color: '#fff',
  },
  dockConfirmBtn: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.verified,
  },
  dockConfirmBtnDisabled: {
    opacity: 0.4,
  },
  dockConfirmText: {
    fontSize: 13,
    fontFamily: fonts.ui.extrabold,
    color: '#fff',
  },
  destList: { alignSelf: 'stretch', gap: spacing.sm },
  destRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  destTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  title: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  hint: { flex: 1, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
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
  doneBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
});
