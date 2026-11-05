import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Pop } from '@/components/ledger/Flow';
import { formatPesos, METHOD_LABEL, type PayMethod } from '@/lib/ledger';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

const LOOK: Record<PayMethod, { bg: string; fg: string; soft: string; label: string; line: string; icon: keyof typeof Ionicons.glyphMap }> = {
  cash: { bg: '#0F5B45', fg: '#FFFFFF', soft: 'rgba(255,255,255,0.78)', label: 'Efectivo', line: 'Entra a tu caja', icon: 'cash-outline' },
  transfer: { bg: '#1C3F8F', fg: '#FFFFFF', soft: 'rgba(255,255,255,0.78)', label: 'Transferencia', line: 'Revisa que te haya llegado', icon: 'phone-portrait-outline' },
  card: { bg: '#131B2E', fg: '#FFFFFF', soft: 'rgba(255,255,255,0.72)', label: 'Tarjeta', line: 'Pásala por tu datáfono', icon: 'card-outline' },
  credit: { bg: '#FFF8E7', fg: colors.ink, soft: '#6B5A36', label: 'Fiado', line: 'Queda en «Te deben»', icon: 'person-outline' },
};

const CARD_H = 196;
const WIRE = 64;
const DEAL_MS = 280;

/** Billetes que se abren en abanico detrás del monto. */
function CashScene({ moving }: { moving: boolean }) {
  const [fan] = useState(() => new Animated.Value(moving ? 0 : 1));
  useEffect(() => {
    if (moving) Animated.spring(fan, { toValue: 1, friction: 6, tension: 60, delay: 120, useNativeDriver: true }).start();
  }, [fan, moving]);
  const bill = (deg: number, x: number, y: number, tone: string) => (
    <Animated.View
      key={deg}
      style={[
        styles.bill,
        {
          backgroundColor: tone,
          transform: [{ translateX: fan.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) }, { translateY: fan.interpolate({ inputRange: [0, 1], outputRange: [10, y] }) }, { rotate: fan.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${deg}deg`] }) }],
        },
      ]}
    >
      <View style={styles.billRing}>
        <Text style={styles.billSign}>$</Text>
      </View>
    </Animated.View>
  );
  return (
    <View pointerEvents="none" style={styles.sceneRight}>
      {bill(-14, -16, 4, '#2E8B6F')}
      {bill(-2, -4, -2, '#37A07F')}
      {bill(11, 8, -6, '#49B593')}
    </View>
  );
}

/** Puntos que viajan de un celular al otro, sin parar mientras se ve. */
function TransferScene({ moving }: { moving: boolean }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!moving) return;
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [moving, t]);
  return (
    <View pointerEvents="none" style={styles.transfer}>
      <View style={styles.phone}>
        <Ionicons name="person" size={16} color="#1C3F8F" />
      </View>
      <View style={styles.wire}>
        {[0, 1, 2, 3].map((i) => {
          // Cada punto sale del celular, llega al negocio y vuelve a empezar, repartidos a lo largo del camino.
          const start = i / 4;
          const x = i === 0 ? t.interpolate({ inputRange: [0, 1], outputRange: [0, WIRE] }) : t.interpolate({ inputRange: [0, 1 - start, 1 - start + 0.001, 1], outputRange: [start * WIRE, WIRE, 0, start * WIRE] });
          return <Animated.View key={i} style={[styles.dot, { transform: [{ translateX: moving ? x : start * WIRE }] }]} />;
        })}
      </View>
      <View style={styles.phoneTo}>
        <Ionicons name="storefront" size={16} color="#1C3F8F" />
      </View>
    </View>
  );
}

/** Una tarjeta de verdad: chip, señal sin contacto y un brillo que la cruza. */
function CardScene({ moving }: { moving: boolean }) {
  const [sweep] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!moving) return;
    const loop = Animated.loop(Animated.sequence([Animated.delay(500), Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.delay(1800), Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [moving, sweep]);
  return (
    <>
      <View pointerEvents="none" style={styles.chipRow}>
        <View style={styles.chip}>
          <View style={styles.chipLine} />
          <View style={styles.chipLine} />
        </View>
        <Ionicons name="wifi" size={20} color="rgba(255,255,255,0.75)" style={{ transform: [{ rotate: '90deg' }] }} />
      </View>
      <Text style={styles.cardDigits} accessible={false}>
        •••• •••• ••••
      </Text>
      {moving ? <Animated.View pointerEvents="none" style={[styles.shine, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-120, 460] }) }, { rotate: '18deg' }] }]} /> : null}
    </>
  );
}

/** La libreta del fiado: renglones y una línea que se escribe sola. */
function CreditScene({ moving, party }: { moving: boolean; party?: string }) {
  const [write] = useState(() => new Animated.Value(moving ? 0 : 1));
  useEffect(() => {
    if (moving) Animated.timing(write, { toValue: 1, duration: 700, delay: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [moving, write]);
  return (
    <>
      <View pointerEvents="none" style={styles.margin} />
      {[58, 92, 126, 160].map((top) => (
        <View key={top} pointerEvents="none" style={[styles.rule, { top }]} />
      ))}
      <View pointerEvents="none" style={styles.noteTag}>
        <Ionicons name="pencil" size={13} color="#6B5A36" />
        <Text style={styles.noteTagText} numberOfLines={1}>
          {party ?? 'Falta a quién'}
        </Text>
      </View>
      <Animated.View pointerEvents="none" style={[styles.ink, { transform: [{ scaleX: write }] }]} />
    </>
  );
}

function PayCard({ method, moving, amount, note, party }: { method: PayMethod; moving: boolean; amount: number; note?: string; party?: string }) {
  const look = LOOK[method];
  return (
    <View style={[styles.card, { backgroundColor: look.bg }]}>
      {method === 'cash' ? <CashScene moving={moving} /> : null}
      {method === 'transfer' ? <TransferScene moving={moving} /> : null}
      {method === 'card' ? <CardScene moving={moving} /> : null}
      {method === 'credit' ? <CreditScene moving={moving} party={party} /> : null}
      <View style={styles.cardFoot}>
        <Text style={[styles.cardLabel, { color: look.soft }]}>{look.label}</Text>
        <Pop value={amount}>
          <Text style={[styles.cardAmount, { color: look.fg }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatPesos(amount)}
          </Text>
        </Pop>
        <Text style={[styles.cardLine, { color: look.soft }]} numberOfLines={1}>
          {note ?? look.line}
        </Text>
      </View>
    </View>
  );
}

/**
 * El cobro como un mazo: cada forma de pago es una carta distinta. Al elegir, la carta de encima sale y entra la nueva; también
 * se puede pasar deslizando. El monto vive solo aquí.
 */
export function PayDeck({ methods, value, onChange, amount, note, party, onEdit }: { methods: PayMethod[]; value: PayMethod; onChange: (m: PayMethod) => void; amount: number; note?: string; party?: string; onEdit?: () => void }) {
  const reduce = useReduceMotion();
  const [leaving, setLeaving] = useState<{ method: PayMethod; dir: number } | null>(null);
  const [deal] = useState(() => new Animated.Value(1));
  const [dir, setDir] = useState(1);
  const before = useRef(value);

  useEffect(() => {
    const prev = before.current;
    if (prev === value) return;
    before.current = value;
    if (reduce) return;
    const d = methods.indexOf(value) >= methods.indexOf(prev) ? 1 : -1;
    setDir(d);
    setLeaving({ method: prev, dir: d });
    deal.setValue(0);
    Animated.timing(deal, { toValue: 1, duration: DEAL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Por tiempo y no al terminar la animación: si el sistema la detiene, la carta vieja no se queda.
    const t = setTimeout(() => setLeaving(null), DEAL_MS);
    return () => clearTimeout(t);
  }, [value, methods, reduce, deal]);

  const here = useRef({ methods, value, onChange });
  useEffect(() => {
    here.current = { methods, value, onChange };
  });
  const swipe = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- el gesto corre por eventos del dedo, nunca durante el render
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) < 40) return;
          const { methods: list, value: cur, onChange: pick } = here.current;
          const next = list[(list.indexOf(cur) + (g.dx < 0 ? 1 : -1) + list.length) % list.length];
          pick(next);
        },
      }),
    [],
  );

  const behind = methods.filter((m) => m !== value).slice(0, 2);
  return (
    <View style={styles.wrap}>
      <View accessible accessibilityRole="summary" accessibilityLabel={`${LOOK[value].label}, ${formatPesos(amount)}. ${note ?? LOOK[value].line}`} accessibilityLiveRegion="polite" style={styles.stage} {...swipe.panHandlers}>
        {behind.map((m, i) => (
          <View key={m} pointerEvents="none" style={[styles.peek, { backgroundColor: LOOK[m].bg, transform: [{ rotate: i === 0 ? '-3deg' : '3deg' }, { translateY: i === 0 ? -5 : -9 }, { scale: i === 0 ? 0.97 : 0.94 }] }]} />
        ))}
        {leaving ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.layer,
              {
                opacity: deal.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0.4, 0] }),
                transform: [{ translateX: deal.interpolate({ inputRange: [0, 1], outputRange: [0, -leaving.dir * 300] }) }, { rotate: deal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${-leaving.dir * 12}deg`] }) }],
              },
            ]}
          >
            <PayCard method={leaving.method} moving={false} amount={amount} party={party} />
          </Animated.View>
        ) : null}
        <Animated.View
          key={value}
          style={[
            styles.layer,
            {
              transform: [{ translateX: deal.interpolate({ inputRange: [0, 1], outputRange: [dir * 260, 0] }) }, { rotate: deal.interpolate({ inputRange: [0, 1], outputRange: [`${dir * 9}deg`, '0deg'] }) }, { scale: deal.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            },
          ]}
        >
          <PayCard method={value} moving={!reduce} amount={amount} note={note} party={party} />
        </Animated.View>
        {onEdit ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Cambiar el monto" onPress={onEdit} style={styles.edit}>
            <Ionicons name="pencil" size={16} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="Cómo te pagaron">
        {methods.map((m) => {
          const on = m === value;
          return (
            <Pressable key={m} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={m === 'credit' ? 'Fiado' : METHOD_LABEL[m]} onPress={() => onChange(m)} style={[styles.tile, m === 'transfer' && styles.tileLong, on && styles.tileOn]}>
              <Ionicons name={LOOK[m].icon} size={22} color={colors.ink} />
              <Text style={styles.tileText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                {LOOK[m].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  stage: { height: CARD_H + 10, justifyContent: 'flex-end' },
  layer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: CARD_H },
  peek: { position: 'absolute', left: 6, right: 6, bottom: 0, height: CARD_H, borderRadius: 22, opacity: 0.55 },
  card: { flex: 1, overflow: 'hidden', borderRadius: 22, ...softShadow },
  cardFoot: { position: 'absolute', left: 18, right: 18, bottom: 16, gap: 1 },
  cardLabel: { fontSize: 12.5, fontFamily: fonts.ui.extrabold },
  cardAmount: { fontSize: 38, lineHeight: 44, fontFamily: fonts.display.bold, fontVariant: ['tabular-nums'] },
  cardLine: { fontSize: 12.5, fontFamily: fonts.ui.bold },
  edit: { position: 'absolute', right: 10, bottom: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)' },
  // Efectivo
  sceneRight: { position: 'absolute', right: 26, top: 22, width: 118, height: 70 },
  bill: { position: 'absolute', right: 0, top: 0, width: 112, height: 62, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  billRing: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' },
  billSign: { fontSize: 17, fontFamily: fonts.display.bold, color: '#FFFFFF' },
  // Transferencia
  transfer: { position: 'absolute', top: 22, right: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
  phone: { width: 36, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  phoneTo: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  wire: { width: 64, height: 10, overflow: 'hidden', justifyContent: 'center' },
  dot: { position: 'absolute', left: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  // Tarjeta
  chipRow: { position: 'absolute', top: 18, left: 18, right: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: { width: 40, height: 30, borderRadius: 7, justifyContent: 'center', gap: 6, paddingHorizontal: 6, backgroundColor: '#D9B45B' },
  chipLine: { height: 1.5, backgroundColor: 'rgba(90,65,10,0.55)' },
  cardDigits: { position: 'absolute', top: 58, left: 18, fontSize: 15, letterSpacing: 2, fontFamily: fonts.ui.bold, color: 'rgba(255,255,255,0.55)' },
  shine: { position: 'absolute', top: -40, bottom: -40, width: 48, backgroundColor: 'rgba(255,255,255,0.1)' },
  // Fiado
  margin: { position: 'absolute', left: 10, top: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(212,32,32,0.35)' },
  rule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(107,90,54,0.16)' },
  noteTag: { position: 'absolute', top: 18, left: 18, right: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteTagText: { flexShrink: 1, fontSize: 14, fontStyle: 'italic', fontFamily: fonts.ui.bold, color: '#6B5A36' },
  ink: { position: 'absolute', top: 44, left: 18, width: 140, height: 2, borderRadius: 1, backgroundColor: colors.ink, transformOrigin: 'left' },
  // Elegir
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, minWidth: 0, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 3, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  // «Transferencia» es la palabra larga: su cuadro crece para que no se corte.
  tileLong: { flex: 1.35 },
  tileOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  tileText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
