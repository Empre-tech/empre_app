import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fin } from '@/finance/tokens';
import { formatPesos } from '@/lib/ledger';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { RollingNumber } from './RollingNumber';

// Así termina la voz al guardar (mockup, sección 8). El check crece, se ve qué quedó registrado y dónde, «Hoy te
// quedó» rueda del valor anterior al nuevo y durante 5 s se puede deshacer exactamente lo recién guardado (por los
// ids que devolvió el servidor). Si el servidor dijo que ese dictado ya estaba guardado, se muestra igual, sin deshacer.

const C = fin.color;
const V = fin.color.voice;
const F = fin.font;
const M = fin.motion;

export interface SavedItem {
  kind: 'sale' | 'expense' | 'payment';
  title: string;
  amount: number;
  /** Id que devolvió el servidor: con él se deshace. */
  id?: string;
}

const signedOf = (it: SavedItem) => (it.kind === 'sale' ? it.amount : it.kind === 'expense' ? -it.amount : 0);

export function VoiceSaved({
  items,
  already,
  baseNet,
  businessName,
  onUndo,
  onOpenLedger,
  onDone,
}: {
  items: SavedItem[];
  already: boolean;
  baseNet: number;
  businessName: string;
  onUndo: (items: SavedItem[]) => void;
  onOpenLedger: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const entered = items.filter((it) => it.kind === 'sale').reduce((s, it) => s + it.amount, 0);
  const left = items.filter((it) => it.kind === 'expense').reduce((s, it) => s + it.amount, 0);
  const after = baseNet + items.reduce((s, it) => s + signedOf(it), 0);
  const undoable = !already && items.some((it) => it.id && it.kind !== 'payment');

  const [net, setNet] = useState(baseNet);
  const [undone, setUndone] = useState(false);
  const [canUndo, setCanUndo] = useState(undoable);
  const [pop] = useState(() => new Animated.Value(reduce ? 1 : 0));
  const [drain] = useState(() => new Animated.Value(1));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // El check crece con un resorte y, un instante después, el total rueda al nuevo valor.
    if (!reduce) Animated.spring(pop, { toValue: 1, useNativeDriver: true, ...M.rise }).start();
    const t = setTimeout(() => setNet(after), reduce ? 0 : 450);
    if (undoable) {
      if (!reduce) Animated.timing(drain, { toValue: 0, duration: M.undoMs, easing: Easing.linear, useNativeDriver: true }).start();
      timer.current = setTimeout(() => setCanUndo(false), M.undoMs);
    }
    return () => {
      clearTimeout(t);
      if (timer.current) clearTimeout(timer.current);
    };
    // Solo al aparecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undo = () => {
    if (!canUndo || undone) return;
    if (timer.current) clearTimeout(timer.current);
    drain.stopAnimation();
    onUndo(items);
    setUndone(true);
    setCanUndo(false);
    setNet(baseNet);
  };

  const n = items.length;
  const title = undone ? 'Deshecho' : already ? 'Ya estaba registrado' : 'Listo, quedó registrado';
  const where = undone
    ? `Se ${n === 1 ? 'anuló el registro' : `anularon los ${n} registros`}`
    : `${n} ${n === 1 ? 'registro' : 'registros'} en ${businessName} · ${already ? 'antes' : 'ahora'}`;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + fin.space.lg, paddingBottom: insets.bottom + fin.space.lg }]} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.check, undone && styles.checkUndone, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
          <Ionicons name={undone ? 'arrow-undo' : 'checkmark'} size={36} color={V.text} />
        </Animated.View>
        <Text style={styles.title} accessibilityRole="header" accessibilityLiveRegion="assertive">
          {title}
        </Text>
        <Text style={styles.where}>{where}</Text>

        <View style={styles.sum}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Entró</Text>
            <Text style={[styles.rowValue, styles.in]}>+{formatPesos(entered)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Salió</Text>
            <Text style={[styles.rowValue, styles.out]}>−{formatPesos(left)}</Text>
          </View>
          <View style={styles.hr} />
          <View style={styles.bigRow}>
            <Text style={styles.kicker}>Hoy te quedó</Text>
            <RollingNumber value={net} prefix={net < 0 ? '−' : ''} style={styles.big} />
          </View>
        </View>

        <View style={styles.items}>
          {items.map((it, i) => (
            <View key={`${it.id ?? i}`} style={styles.item}>
              <Text style={[styles.itemText, undone && styles.struck]} numberOfLines={1}>
                {it.title}
              </Text>
              <Text style={[styles.itemAmount, undone && styles.struck]}>
                {it.kind === 'sale' ? '+' : it.kind === 'expense' ? '−' : ''}
                {formatPesos(it.amount)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.foot}>
        {undoable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canUndo }}
            accessibilityHint="Anula lo que se acaba de guardar"
            disabled={!canUndo}
            onPress={undo}
            style={[styles.undo, !canUndo && styles.undoOff]}
          >
            {canUndo && !reduce ? <Animated.View style={[StyleSheet.absoluteFill, styles.drain, { transform: [{ scaleX: drain }] }]} /> : null}
            <Text style={styles.undoText}>
              {undone ? `Se anularon ${n === 1 ? 'el registro' : `los ${n} registros`}` : canUndo ? 'Deshacer (5 s)' : 'Para anularlo, ve a Mi negocio'}
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onOpenLedger} style={[styles.btn, styles.btnSoft]}>
            <Text style={styles.btnSoftText}>Ver en Mi negocio</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDone} style={[styles.btn, styles.btnMain]}>
            <Text style={styles.btnMainText}>Listo</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, backgroundColor: V.bg, paddingHorizontal: fin.space.lg, zIndex: 30 },
  body: { alignItems: 'center', gap: fin.space.sm, paddingTop: fin.space.xl },
  check: { width: 72, height: 72, borderRadius: fin.radius.control, backgroundColor: C.in.fill, alignItems: 'center', justifyContent: 'center', borderWidth: 10, borderColor: V.tintIn },
  checkUndone: { backgroundColor: C.textSoft, borderColor: V.chip },
  title: { fontSize: 24, fontFamily: F.display, color: V.text, textAlign: 'center', marginTop: fin.space.xs },
  where: { fontSize: 13, fontFamily: F.uiSemibold, color: V.textSoft, textAlign: 'center' },
  sum: { alignSelf: 'stretch', marginTop: fin.space.xs, borderRadius: fin.radius.inner, backgroundColor: V.card, borderWidth: 1, borderColor: V.cardEdge, padding: fin.space.md, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 22 },
  rowLabel: { fontSize: 13, fontFamily: F.uiSemibold, color: V.textSoft },
  rowValue: { fontSize: 15, fontFamily: F.display },
  in: { color: C.in.soft },
  out: { color: C.out.soft },
  hr: { height: 1, backgroundColor: V.cardEdge },
  bigRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  kicker: { ...fin.type.kicker, color: V.hint },
  big: { fontSize: 30, fontFamily: F.display, color: V.text },
  items: { alignSelf: 'stretch', gap: 4, paddingHorizontal: fin.space.xs },
  item: { flexDirection: 'row', justifyContent: 'space-between', gap: fin.space.sm },
  itemText: { flex: 1, fontSize: 12.5, fontFamily: F.uiSemibold, color: V.textSoft },
  itemAmount: { fontSize: 13, fontFamily: F.display, color: V.text },
  struck: { textDecorationLine: 'line-through', opacity: 0.6 },
  foot: { gap: fin.space.sm, paddingTop: fin.space.sm },
  undo: { minHeight: 46, borderRadius: fin.radius.control, backgroundColor: V.chip, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  undoOff: { opacity: 0.6 },
  drain: { backgroundColor: V.chip, transformOrigin: 'left' },
  undoText: { fontSize: 13.5, fontFamily: F.uiExtra, color: V.text },
  actions: { flexDirection: 'row', gap: fin.space.sm },
  btn: { flex: 1, minHeight: 54, borderRadius: fin.radius.control, alignItems: 'center', justifyContent: 'center' },
  btnSoft: { backgroundColor: V.chip },
  btnSoftText: { fontSize: 14, fontFamily: F.uiExtra, color: V.text },
  btnMain: { backgroundColor: V.tile },
  btnMainText: { fontSize: 14, fontFamily: F.uiExtra, color: C.text },
});
