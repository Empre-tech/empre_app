import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type VoiceAction, type VoiceResult } from '@/api/ledger';
import { actionProblem, errorText } from '@/components/ledger/VoiceSheet';
import { cleanSpeech, prepareVoiceActions, voiceToDraft, type DraftLine } from '@/lib/finance';
import { hapticSuccess } from '@/lib/haptics';
import { categoryLabel, formatPesos, METHOD_LABEL } from '@/lib/ledger';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { speechAvailable, startDictation } from '@/ledger/speech';
import { fin } from '@/finance/tokens';
import { alpha } from '@/theme';
import { Glass } from './Glass';
import { RollingNumber } from './RollingNumber';

const C = fin.color;
const V = fin.color.voice;
const F = fin.font;
const M = fin.motion;

// La voz de Empre Finance a pantalla completa (3.45). Mientras hablas se ven tus palabras; en cada pausa el texto se
// interpreta (solo viaja el texto, nunca el audio) y cada cosa entendida cae como tarjeta, con el total del día rodando
// en vivo. La esfera respira con tu voz y se tiñe de verde (venta) o naranja (gasto). NADA se guarda hasta «Guardar»
// (o, desde un panel, «Agregar»), igual que el dictado de «Mi negocio».

let keySeq = 0;

function title(a: VoiceAction): string {
  if (a.lines && a.lines.length > 0) return a.lines.map((l) => (l.qty > 1 ? `${l.qty} × ${l.name}` : l.name)).join(', ');
  if (a.note) return a.note;
  return a.type === 'sale' ? 'Venta' : a.type === 'expense' ? categoryLabel(a.category ?? 'otro') : 'Abono';
}

function signed(a: VoiceAction): number {
  return a.type === 'sale' ? a.amount : a.type === 'expense' ? -a.amount : 0;
}

function Card({ action, blockedWhy, onRemove, onAccept, reduce }: { action: VoiceAction; blockedWhy: string | null; onRemove: () => void; onAccept: () => void; reduce: boolean }) {
  const [enter] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (!reduce) Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...M.card }).start();
  }, [enter, reduce]);
  const isIn = action.type === 'sale';
  const warning = !blockedWhy && action.warnings?.length ? action.warnings.join(' ') : null;
  const sub = blockedWhy ?? (action.type === 'expense' ? `${categoryLabel(action.category ?? 'otro')} · ${METHOD_LABEL[action.method]}` : METHOD_LABEL[action.method]);
  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }}>
      <Glass dark style={[styles.card, blockedWhy || warning ? styles.cardAsk : null]}>
        <View style={[styles.cardIc, { backgroundColor: isIn ? C.in.fill : action.type === 'expense' ? C.out.fill : C.action.solid }]}>
          <Ionicons name={isIn ? 'add' : action.type === 'expense' ? 'remove' : 'swap-horizontal'} size={18} color={isIn ? V.text : C.out.on} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title(action)}
          </Text>
          <Text style={[styles.cardSub, blockedWhy ? { color: V.warn } : null]} numberOfLines={2}>
            {sub}
          </Text>
          {warning ? (
            <View style={styles.warnRow}>
              <Text style={styles.warnText}>{warning}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Está bien: ${title(action)} por ${formatPesos(action.amount)}`} onPress={onAccept} style={styles.okBtn}>
                <Text style={styles.okText}>Está bien</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardAmt}>
          {action.type === 'sale' ? '+' : action.type === 'expense' ? '−' : ''}
          {formatPesos(action.amount)}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${title(action)}`} onPress={onRemove} hitSlop={10} style={styles.cardX}>
          <Ionicons name="close" size={16} color={V.textSoft} />
        </Pressable>
      </Glass>
    </Animated.View>
  );
}

export function FinanceVoice({
  entityId,
  target,
  demoText,
  baseNet,
  hints,
  onClose,
  onAdd,
  onSaved,
}: {
  entityId: string;
  target: 'save' | 'sale' | 'expense';
  /** Solo para el banco de capturas: interpreta este texto al abrir, como si se hubiera dictado. */
  demoText?: string;
  baseNet: number;
  hints: string[];
  onClose: () => void;
  onAdd?: (lines: DraftLine[], skipped: number) => void;
  onSaved?: (count: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const reduce = useReduceMotion();
  const canSpeak = speechAvailable();
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [typed, setTyped] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [actions, setActions] = useState<VoiceAction[]>([]);
  const [saved, setSaved] = useState<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const draftRef = useRef<string | null>(null);
  const textRef = useRef('');
  const seenRef = useRef(0); // cuántas tarjetas ya destellaron
  const parseSeq = useRef(0); // la interpretación vigente (las que llegan tarde se descartan)

  // Movimiento: la esfera respira (y crece con el volumen), el tinte destella al entender algo.
  const [pulse] = useState(() => new Animated.Value(1));
  const [vol] = useState(() => new Animated.Value(1));
  const [tintIn] = useState(() => new Animated.Value(0));
  const [tintOut] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce || !listening) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.07, duration: M.pulseMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: M.pulseMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, listening, reduce]);

  const flash = (a: VoiceAction) => {
    if (reduce) return;
    const v = a.type === 'sale' ? tintIn : tintOut;
    v.setValue(1);
    Animated.timing(v, { toValue: 0, duration: M.flashMs, useNativeDriver: true }).start();
  };

  useEffect(
    () => () => {
      stopRef.current?.();
    },
    [],
  );

  const discardDraft = () => {
    if (draftRef.current) void ledgerApi.voiceDiscard(entityId, draftRef.current).catch(() => undefined);
    draftRef.current = null;
  };

  const interpret = async (full: string) => {
    const t = full.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    const mine = ++parseSeq.current;
    try {
      const r = await ledgerApi.voiceParse(entityId, t);
      if (mine !== parseSeq.current) {
        void ledgerApi.voiceDiscard(entityId, r.draft_id).catch(() => undefined); // llegó tarde: ya hay una más nueva
        return;
      }
      discardDraft(); // el borrador anterior queda reemplazado por el del texto completo
      draftRef.current = r.draft_id;
      setResult(r);
      r.actions.slice(seenRef.current).forEach(flash);
      seenRef.current = r.actions.length;
      setActions(r.actions);
      if (r.actions.length === 0) setError(r.message ?? 'No entendí qué registrar. Prueba con «vendí dos cortes a veinte mil».');
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (mine === parseSeq.current) setBusy(false);
    }
  };

  const commit = (chunk: string) => {
    const full = cleanSpeech(`${textRef.current} ${chunk}`);
    textRef.current = full;
    setText(full);
    setPartial('');
    void interpret(full);
  };

  const demoDone = useRef(false);
  useEffect(() => {
    if (demoDone.current || !demoText) return;
    demoDone.current = true;
    commit(demoText);
  });

  const listen = async () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setError(null);
    setListening(true);
    let last = '';
    const stop = await startDictation(
      {
        onText: (t, isFinal) => {
          last = t;
          if (isFinal) {
            last = '';
            commit(t);
          } else setPartial(t);
        },
        onEnd: () => {
          setListening(false);
          if (last) commit(last);
          vol.setValue(1);
        },
        onError: (m) => {
          setError(m);
          setListening(false);
        },
        onVolume: (v) => {
          if (!reduce) Animated.spring(vol, { toValue: 1 + Math.max(0, Math.min(10, v)) / 28, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
        },
      },
      hints,
    );
    if (stop) stopRef.current = stop;
    else setListening(false);
  };

  // Desde un panel solo se suma lo de ese tipo; desde la cápsula se guarda todo lo que no pida pasar por Empre.
  const kind = target === 'expense' ? 'expense' : 'sale';
  const why = (a: VoiceAction): string | null => {
    if (target !== 'save' && a.type !== kind) return a.type === 'sale' ? 'Es una venta: no se suma a este gasto' : a.type === 'expense' ? 'Es un gasto: no se suma a esta venta' : 'Un abono se registra en Empre';
    if (a.method === 'credit' || a.type === 'payment') return 'Fiados y abonos se terminan en Empre';
    return actionProblem(a);
  };
  const pendingReview = actions.filter((a) => why(a) === null && (a.warnings?.length ?? 0) > 0).length;
  const usable = actions.filter((a) => why(a) === null && !(a.warnings?.length ?? 0));
  const total = baseNet + usable.reduce((s, a) => s + signed(a), 0);
  const blocked = usable.length === 0 || pendingReview > 0 || busy;

  const close = () => {
    stopRef.current?.();
    discardDraft();
    onClose();
  };

  const primary = async () => {
    if (usable.length === 0 || pendingReview > 0 || busy) return;
    if (target !== 'save') {
      const { lines, skipped } = voiceToDraft(usable, kind, () => `voz:${++keySeq}`);
      discardDraft();
      onAdd?.(lines, skipped + (actions.length - usable.length));
      onClose();
      return;
    }
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      // Una venta con productos sin precio va por su total: si no, el servidor rechaza todo el dictado.
      await ledgerApi.voiceConfirm(entityId, result.draft_id, prepareVoiceActions(usable));
      draftRef.current = null;
      void qc.invalidateQueries({ queryKey: ['ledger', entityId] });
      hapticSuccess();
      setSaved(usable.length);
      setTimeout(() => onSaved?.(usable.length), reduce ? 300 : 1100);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const spoken = `${text}${partial ? ` ${partial}` : ''}`.trim();
  const words = spoken ? spoken.split(/\s+/) : [];

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: V.tintIn, opacity: tintIn }]} />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: V.tintOut, opacity: tintOut }]} />
      </View>

      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sin guardar" onPress={close} style={styles.x} hitSlop={6}>
          <Ionicons name="close" size={22} color={V.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.totLabel}>Hoy quedaría</Text>
          <RollingNumber value={total} prefix={total < 0 ? '−' : ''} style={styles.tot} />
        </View>
        <Text style={styles.count}>
          {usable.length} {usable.length === 1 ? 'registro' : 'registros'}
        </Text>
      </View>

      <Animated.View style={[styles.orb, { transform: [{ scale: pulse }, { scale: vol }] }]} accessible={false}>
        <View style={styles.orbRing} />
        <View style={[styles.orbCore, listening && styles.orbOn]} />
      </Animated.View>

      <View style={styles.said} accessibilityLiveRegion="polite">
        {words.length > 0 ? (
          <Text style={styles.saidText}>
            {words.map((w, i) => (
              <Text key={`${i}${w}`} style={/\d|mil\b|pesos/i.test(w) ? styles.saidNum : undefined}>
                {w}
                {i < words.length - 1 ? ' ' : ''}
              </Text>
            ))}
          </Text>
        ) : (
          <Text style={styles.hint}>{canSpeak ? 'Toca el micrófono y cuéntalo como lo dirías: «vendí dos cortes a veinte mil en efectivo»' : 'Escribe lo que pasó, o usa el micrófono de tu teclado'}</Text>
        )}
        {busy ? <Text style={styles.busy}>Entendiendo…</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.cards}>
        {actions.map((a, i) => (
          <Card key={a.client_id} action={a} blockedWhy={why(a)} reduce={reduce} onRemove={() => setActions((l) => l.filter((_, k) => k !== i))} onAccept={() => setActions((l) => l.map((x, k) => (k === i ? { ...x, warnings: [] } : x)))} />
        ))}
      </ScrollView>

      {!canSpeak ? (
        <View style={styles.typeRow}>
          <TextInput value={typed} onChangeText={setTyped} placeholder="Vendí dos cortes a veinte mil…" placeholderTextColor={V.hint} style={styles.typeInput} multiline maxLength={400} accessibilityLabel="Lo que quieres registrar" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Entender"
            disabled={!typed.trim() || busy}
            onPress={() => {
              commit(typed);
              setTyped('');
            }}
            style={[styles.typeGo, (!typed.trim() || busy) && { opacity: 0.4 }]}
          >
            <Ionicons name="arrow-up" size={20} color={C.text} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
        {canSpeak ? (
          <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Dejar de escuchar' : 'Hablar'} onPress={() => void listen()} style={[styles.mic, listening && styles.micOn]}>
            <Ionicons name={listening ? 'stop' : 'mic'} size={28} color={listening ? V.text : C.action.solid} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={() => void primary()} style={[styles.save, blocked && { opacity: 0.4 }]}>
          <Text style={styles.saveText}>
            {pendingReview > 0
              ? `Revisa ${pendingReview} ${pendingReview === 1 ? 'tarjeta' : 'tarjetas'}`
              : target === 'save'
                ? `Guardar${usable.length ? ` ${usable.length}` : ''}`
                : `Agregar${usable.length ? ` ${usable.length}` : ''} ${target === 'sale' ? 'a la venta' : 'al gasto'}`}
          </Text>
        </Pressable>
      </View>

      {saved !== null ? (
        <View style={styles.done} accessibilityLiveRegion="assertive">
          <View style={styles.doneOk}>
            <Ionicons name="checkmark" size={36} color={V.text} />
          </View>
          <Text style={styles.doneTitle}>
            {saved} {saved === 1 ? 'registro guardado' : 'registros guardados'}
          </Text>
          <Text style={styles.doneBody}>Ya se ven en tu resumen de hoy.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: V.bg, overflow: 'hidden', zIndex: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  x: { width: 44, height: 44, borderRadius: 22, backgroundColor: V.chip, alignItems: 'center', justifyContent: 'center' },
  totLabel: { fontSize: 10.5, letterSpacing: 0.7, textTransform: 'uppercase', fontFamily: F.uiExtra, color: V.hint },
  tot: { fontSize: 26, fontFamily: F.display, color: V.text },
  count: { fontSize: 11.5, fontFamily: F.uiExtra, color: V.text, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: V.chip, overflow: 'hidden' },
  orb: { width: 118, height: 118, alignSelf: 'center', marginTop: 10, alignItems: 'center', justifyContent: 'center' },
  orbRing: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: V.ring },
  orbCore: { width: 118, height: 118, borderRadius: 59, backgroundColor: C.action.solid, borderWidth: 10, borderColor: V.orbEdge },
  orbOn: { backgroundColor: V.orbListening },
  said: { minHeight: 84, paddingHorizontal: 22, paddingTop: 12, alignItems: 'center', gap: 6 },
  saidText: { fontSize: 20, lineHeight: 27, fontFamily: F.displaySoft, color: V.text, textAlign: 'center' },
  saidNum: { color: V.highlight, textDecorationLine: 'underline' },
  hint: { fontSize: 13.5, lineHeight: 19, fontFamily: F.uiSemibold, color: V.hint, textAlign: 'center' },
  busy: { fontSize: 12.5, fontFamily: F.uiBold, color: V.textSoft },
  error: { fontSize: 13, fontFamily: F.uiSemibold, color: V.warn, textAlign: 'center' },
  cards: { paddingHorizontal: 12, paddingVertical: 4, gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingRight: 6, borderRadius: fin.radius.inner },
  cardAsk: { borderColor: alpha(V.warn, 0.6) },
  cardIc: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13.5, fontFamily: F.uiBold, color: V.text },
  cardSub: { fontSize: 11.5, fontFamily: F.uiSemibold, color: V.hint },
  cardAmt: { fontSize: 16, fontFamily: F.display, color: V.text },
  warnRow: { marginTop: 6, gap: 6, alignItems: 'flex-start' },
  warnText: { fontSize: 12, lineHeight: 16, fontFamily: F.uiSemibold, color: V.warn },
  okBtn: { minHeight: 32, paddingHorizontal: 12, borderRadius: fin.radius.control, backgroundColor: V.chip, justifyContent: 'center' },
  okText: { fontSize: 12, fontFamily: F.uiExtra, color: V.text },
  cardX: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  typeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 8 },
  typeInput: { flex: 1, minHeight: 48, maxHeight: 110, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: alpha(V.text, 0.12), color: V.text, fontSize: 15, fontFamily: F.uiMedium },
  typeGo: { width: fin.size.key, height: fin.size.key, borderRadius: fin.radius.control, backgroundColor: V.tile, alignItems: 'center', justifyContent: 'center' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 10 },
  mic: { width: fin.size.mic, height: fin.size.mic, borderRadius: fin.radius.control, backgroundColor: V.tile, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: V.recording },
  save: { flex: 1, minHeight: 56, borderRadius: fin.radius.control, backgroundColor: V.tile, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, fontFamily: F.uiExtra, color: C.text },
  done: { ...StyleSheet.absoluteFill, backgroundColor: V.overlay, alignItems: 'center', justifyContent: 'center', gap: 8 },
  doneOk: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.in.fill, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 22, fontFamily: F.display, color: V.text },
  doneBody: { fontSize: 13, fontFamily: F.uiSemibold, color: V.hint },
});
