import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { formatPesos, METHOD_LABEL } from '@/lib/ledger';
import { deckCount, type DeckCard, type DeckEntry, type DeckMethod } from '@/lib/methodDeck';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

// Cerradas se montan como un mazo: de cada una se ve la cabecera. Abierta, empuja a las de abajo.
const CLOSED = 112;
const STEP = 60;
const GAP = 12;
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

const ICON: Record<DeckMethod, keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  transfer: 'swap-horizontal',
  card: 'card-outline',
  credit: 'person-outline',
};

interface Face {
  bg: string;
  fg: string;
  sub: string;
  iconBg: string;
  well: string;
  rule: string;
}

const FACE: Record<DeckMethod, Face> = {
  cash: { bg: colors.ink, fg: '#FFFFFF', sub: '#C9D3E2', iconBg: 'rgba(255,255,255,0.12)', well: 'rgba(255,255,255,0.08)', rule: 'rgba(255,255,255,0.12)' },
  transfer: { bg: colors.surface, fg: colors.ink, sub: colors.muted, iconBg: colors.selectedSoft, well: colors.bg, rule: colors.hairline },
  card: { bg: colors.selectedSoft, fg: colors.ink, sub: colors.muted, iconBg: colors.surface, well: colors.surface, rule: colors.line },
  credit: { bg: colors.surface, fg: colors.ink, sub: colors.muted, iconBg: colors.selectedSoft, well: colors.bg, rule: colors.hairline },
};

export interface MethodDeckProps {
  cards: DeckCard[];
  /** «plata»: lo que entró hoy. «caja»: el efectivo es lo que debería haber y lo demás no se cuenta. */
  mode: 'plata' | 'caja';
  /** Al cerrar la caja: lo que debería haber y la base con la que se abrió (los da el servidor). */
  cashExpected?: number;
  cashBase?: number;
  /** Al cerrar la caja: lo que entró y salió en efectivo según el servidor (cuadra con lo que debería haber). */
  cashSums?: { in: number; out: number };
  /** Tocar un movimiento con `id` (por ejemplo, quitar una plata que sacaste). */
  onMove?: (e: DeckEntry) => void;
  /** La que arranca abierta. */
  initialOpen?: DeckMethod | null;
  timeOf: (iso: string) => string;
}

/**
 * Los medios de pago de hoy como tarjetas: entran repartidas, como cartas, y cada una se abre en su sitio con lo
 * que entró, lo que salió y sus movimientos. Con «Reducir movimiento», aparecen y se abren sin moverse.
 */
export function MethodDeck({ cards, mode, cashExpected, cashBase, cashSums, onMove, initialOpen = null, timeOf }: MethodDeckProps) {
  const [open, setOpen] = useState<DeckMethod | null>(initialOpen);
  const reduce = useReduceMotion();
  return (
    <View accessibilityLabel="Tus medios de pago hoy">
      {cards.map((c, i) => (
        <DeckCardView
          key={c.method}
          card={c}
          index={i}
          mode={mode}
          open={open === c.method}
          prevOpen={i > 0 && open === cards[i - 1].method}
          reduce={reduce}
          cashExpected={cashExpected}
          cashBase={cashBase}
          cashSums={cashSums}
          onMove={onMove}
          timeOf={timeOf}
          onToggle={() => setOpen((o) => (o === c.method ? null : c.method))}
        />
      ))}
    </View>
  );
}

function DeckCardView({
  card,
  index,
  mode,
  open,
  prevOpen,
  reduce,
  cashExpected,
  cashBase,
  cashSums,
  onMove,
  timeOf,
  onToggle,
}: {
  card: DeckCard;
  index: number;
  mode: 'plata' | 'caja';
  open: boolean;
  prevOpen: boolean;
  reduce: boolean;
  cashExpected?: number;
  cashBase?: number;
  cashSums?: { in: number; out: number };
  onMove?: (e: DeckEntry) => void;
  timeOf: (iso: string) => string;
  onToggle: () => void;
}) {
  const face = FACE[card.method];
  const caja = mode === 'caja';
  const isCash = card.method === 'cash';
  const name = card.method === 'credit' ? 'Fiado' : METHOD_LABEL[card.method];
  const amount = isCash && caja && cashExpected !== undefined ? cashExpected : card.method === 'credit' ? card.inTotal : isCash ? card.net : card.inTotal;
  const tag = card.method === 'credit' ? 'por cobrar' : isCash ? (caja ? 'deberías tener' : amount < 0 ? 'salió más de lo que entró' : 'quedó hoy') : caja ? 'ya en tu cuenta' : 'entró hoy';
  const sums: { k: string; v: string }[] =
    card.method === 'credit'
      ? [{ k: 'Fiaste hoy', v: formatPesos(card.inTotal) }]
      : isCash && caja && cashBase !== undefined
        ? [
            { k: 'Base', v: formatPesos(cashBase) },
            { k: 'Entró', v: `+${formatPesos(cashSums?.in ?? card.inTotal)}` },
            { k: 'Salió', v: `−${formatPesos(cashSums?.out ?? card.outTotal)}` },
          ]
        : [
            { k: 'Entró', v: formatPesos(card.inTotal) },
            { k: 'Salió', v: formatPesos(card.outTotal) },
          ];
  const note =
    card.method === 'credit'
      ? 'No entra a la caja hasta que te paguen. Queda en «Te deben».'
      : isCash
        ? caja
          ? 'Es lo único que cuentas. Si sacaste o metiste plata, anótalo antes de contar.'
          : ''
        : 'Ya está en tu cuenta: no se cuenta al cerrar la caja.';

  // Reparto: cada carta llega un poco después de la anterior.
  const [deal] = useState(() => new Animated.Value(reduce ? 1 : 0));
  // Altura de la carta, el hueco con la de arriba y lo de adentro (JS: son medidas de diseño, no transformaciones).
  const [h] = useState(() => new Animated.Value(CLOSED));
  const [mt] = useState(() => new Animated.Value(index === 0 ? 0 : -(CLOSED - STEP)));
  const [inside] = useState(() => new Animated.Value(open ? 1 : 0));
  const full = useRef(CLOSED);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    if (reduce) {
      deal.setValue(1);
      return;
    }
    const a = Animated.timing(deal, { toValue: 1, duration: 620, delay: index * 80, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
    // Solo al aparecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const toH = open ? Math.max(full.current, CLOSED) : CLOSED;
    const toMt = index === 0 ? 0 : prevOpen ? GAP : -(CLOSED - STEP);
    if (reduce) {
      h.setValue(toH);
      mt.setValue(toMt);
      inside.setValue(open ? 1 : 0);
      return;
    }
    Animated.parallel([
      Animated.timing(h, { toValue: toH, duration: 440, easing: EASE, useNativeDriver: false }),
      Animated.timing(mt, { toValue: toMt, duration: 440, easing: EASE, useNativeDriver: false }),
      Animated.timing(inside, { toValue: open ? 1 : 0, duration: open ? 360 : 180, delay: open ? 120 : 0, easing: EASE, useNativeDriver: false }),
    ]).start();
  }, [open, prevOpen, index, reduce, measured, h, mt, inside]);

  const onContent = (e: LayoutChangeEvent) => {
    const next = Math.ceil(e.nativeEvent.layout.height);
    if (Math.abs(next - full.current) > 1) {
      full.current = next;
      setMeasured((m) => !m);
    }
  };

  const dealStyle = {
    opacity: deal.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateY: deal.interpolate({ inputRange: [0, 1], outputRange: [56, 0] }) },
      { rotate: deal.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '0deg'] }) },
      { scale: deal.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
    ],
  };

  return (
    <Animated.View style={{ height: h, marginTop: mt, zIndex: index + 1 }}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: face.bg },
          card.method === 'credit' && styles.cardDashed,
          open ? styles.cardOpen : styles.cardStacked,
          dealStyle,
        ]}
      >
        <View style={styles.clip}>
        {isCash ? <CashPattern /> : card.method === 'transfer' ? <TransferPattern /> : null}
        <View onLayout={onContent}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${name}: ${formatPesos(amount)}, ${tag}. ${open ? 'Cerrar' : 'Ver los movimientos de hoy'}`}
            onPress={onToggle}
            style={({ pressed }) => [styles.head, pressed && { opacity: 0.85 }]}
          >
            <View style={[styles.iconBox, { backgroundColor: face.iconBg }]}>
              <Ionicons name={ICON[card.method]} size={20} color={face.fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={[styles.name, { color: face.fg }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.small, { color: face.sub }]} numberOfLines={1}>
                {deckCount(card)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 1 }}>
              <Text style={[styles.amount, { color: face.fg }]} numberOfLines={1}>
                {formatPesos(Math.abs(amount))}
              </Text>
              <Text style={[styles.tag, { color: face.sub }]} numberOfLines={1}>
                {tag}
              </Text>
            </View>
          </Pressable>

          <Animated.View
            style={[styles.body, { opacity: inside, transform: [{ translateY: inside.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          >
            <View style={styles.sums}>
              {sums.map((s) => (
                <View key={s.k} style={[styles.well, { backgroundColor: face.well }]}>
                  <Text style={[styles.small, { color: face.sub }]}>{s.k}</Text>
                  <Text style={[styles.wellValue, { color: face.fg }]} numberOfLines={1} adjustsFontSizeToFit>
                    {s.v}
                  </Text>
                </View>
              ))}
            </View>
            {card.moves.length > 0 ? (
              <View>
                {card.moves.map((m, j) => (
                  <Pressable
                    key={`${m.id ?? ''}${m.at}${m.label}${j}`}
                    disabled={!m.id || !onMove || !open}
                    accessibilityRole={m.id && onMove ? 'button' : undefined}
                    accessibilityHint={m.id && onMove ? 'Toca para quitarlo' : undefined}
                    onPress={() => onMove?.(m)}
                    style={({ pressed }) => [styles.row, { borderTopColor: face.rule }, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={[styles.time, { color: face.sub }]} numberOfLines={1}>
                      {m.at ? timeOf(m.at) : 'Hoy'}
                    </Text>
                    <Text style={[styles.what, { color: face.fg }]} numberOfLines={1}>
                      {m.label}
                    </Text>
                    <Text style={[styles.rowAmount, { color: face.fg }]}>{`${m.amount < 0 ? '−' : '+'}${formatPesos(Math.abs(m.amount))}`}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.note, { color: face.sub }]}>Hoy no ha entrado ni salido efectivo.</Text>
            )}
            {note ? <Text style={[styles.note, { color: face.sub }]}>{note}</Text> : null}
          </Animated.View>
        </View>
        {card.method === 'card' ? <Animated.View pointerEvents="none" style={[styles.chip, { opacity: inside.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} /> : null}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** El efectivo: líneas finas en círculo, como el fondo de un billete. */
function CashPattern() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        {[14, 30, 46, 62, 78, 94, 110, 126, 142, 158, 174].map((r) => (
          <Circle key={r} cx="92%" cy={40} r={r} stroke="#FFFFFF" strokeOpacity={0.07} strokeWidth={1.5} fill="none" />
        ))}
      </Svg>
    </View>
  );
}

/** La transferencia: rayas suaves en diagonal. */
function TransferPattern() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        {Array.from({ length: 24 }, (_, i) => (
          <Line key={i} x1={i * 22 - 120} y1={0} x2={i * 22} y2={220} stroke={colors.ink} strokeOpacity={0.04} strokeWidth={10} />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // La sombra va afuera y el recorte adentro: en iPhone, recortar la tarjeta también borra su sombra.
  card: { flex: 1, borderRadius: 20 },
  clip: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  cardStacked: { shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -2 }, elevation: 3 },
  cardOpen: { shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  cardDashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.placeholder },
  head: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontFamily: fonts.ui.extrabold },
  small: { fontSize: 12.5, fontFamily: fonts.ui.bold },
  amount: { fontSize: 22, lineHeight: 26, fontFamily: fonts.display.bold, fontVariant: ['tabular-nums'] },
  tag: { fontSize: 12, fontFamily: fonts.ui.bold },
  body: { gap: 10, paddingHorizontal: 14, paddingBottom: 14 },
  sums: { flexDirection: 'row', gap: 8 },
  well: { flex: 1, minWidth: 0, gap: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 },
  wellValue: { fontSize: 15, fontFamily: fonts.ui.extrabold, fontVariant: ['tabular-nums'] },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1 },
  time: { width: 64, fontSize: 12, fontFamily: fonts.ui.bold },
  what: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: fonts.ui.bold },
  rowAmount: { fontSize: 14, fontFamily: fonts.ui.extrabold, fontVariant: ['tabular-nums'] },
  note: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.semibold },
  chip: { position: 'absolute', right: 16, top: 74, width: 34, height: 26, borderRadius: 6, backgroundColor: colors.line },
});
