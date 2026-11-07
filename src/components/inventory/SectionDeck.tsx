import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { mediaUrl } from '@/lib/image';
import { rowWindow } from '@/lib/sectionDeck';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const OPEN_MS = 620;
const CLOSE_MS = 320;
// Las tres cartas del mazo, de atrás hacia adelante: dónde están y hacia dónde se van al abrir.
const MINI = [
  { left: 0, rot: -8, bg: '#C9D4E3', toX: -4, toY: 8, toRot: -14 },
  { left: 9, rot: -2, bg: '#DCE4EF', toX: 0, toY: 10, toRot: -6 },
  { left: 18, rot: 5, bg: colors.selectedSoft, toX: -18, toY: 0, toRot: 0 },
];

export interface DeckFace {
  cover?: string;
  letter: string;
}

/**
 * Una sección como mazo. Cerrada: tres cartas montadas, el nombre, cuántos tiene y lo urgente. Al abrirla, las cartas
 * de atrás se apartan y las filas salen de la pila, una tras otra; al cerrarla vuelven, más rápido. Con «Reducir
 * movimiento» abre y cierra sin moverse. Las filas solo se montan mientras la sección está abierta.
 */
export function SectionDeck({
  title,
  countText,
  alert,
  faces,
  open,
  onToggle,
  rows,
  footer,
  onReveal,
}: {
  title: string;
  countText: string;
  alert: { text: string; tone: 'out' | 'low' } | null;
  faces: DeckFace[];
  open: boolean;
  onToggle: () => void;
  rows: ReactNode[];
  footer?: ReactNode;
  /** Ya abierta: recibe la sección para que la lista la lleve arriba. */
  onReveal?: (node: View) => void;
}) {
  const reduce = useReduceMotion();
  const [p] = useState(() => new Animated.Value(open ? 1 : 0));
  const [mounted, setMounted] = useState(open);
  const [height, setHeight] = useState(0);
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const root = useRef<View>(null);

  // Abierta, se lleva arriba cuando la anterior ya terminó de cerrarse (así la posición ya es la final).
  useEffect(() => {
    if (!open || !onReveal) return;
    const t = setTimeout(() => {
      if (root.current) onReveal(root.current);
    }, CLOSE_MS + 120);
    return () => clearTimeout(t);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Abrir: primero se montan las filas; al medirlas, corre la animación. Cerrar: corre y luego se desmontan.
  useEffect(() => {
    run.current?.stop();
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- montar las filas es parte de abrir
      setMounted(true);
      if (reduce) p.setValue(1);
      else if (height > 0) {
        run.current = Animated.timing(p, { toValue: 1, duration: OPEN_MS, easing: EASE, useNativeDriver: false });
        run.current.start();
      }
      return;
    }
    if (reduce) {
      p.setValue(0);
      setMounted(false);
      return;
    }
    run.current = Animated.timing(p, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.quad), useNativeDriver: false });
    run.current.start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [open, reduce, height, p]);

  const onContent = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (Math.abs(h - height) > 1) setHeight(h);
  };

  const shown = faces.slice(0, 3);
  const cards = shown.length === 0 ? [{ letter: title.slice(0, 1).toUpperCase() }] : shown;
  // La de adelante es la de la sección: va al final para quedar encima.
  const stack = MINI.slice(3 - Math.max(cards.length, 1));

  return (
    <View ref={root} style={[styles.sec, open && styles.secOpen]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${countText}${alert ? `, ${alert.text}` : ''}. ${open ? 'Cerrar' : 'Abrir'}`}
        onPress={onToggle}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.9 }]}
      >
        <View style={styles.stack} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {stack.map((m, i) => {
            const face = cards[i] ?? cards[0];
            const front = i === stack.length - 1;
            return (
              <Animated.View
                key={i}
                style={[
                  styles.mini,
                  {
                    left: m.left,
                    backgroundColor: front && open ? '#DCE4EF' : m.bg,
                    opacity: front ? 1 : p.interpolate({ inputRange: [0, 0.35], outputRange: [1, 0], extrapolate: 'clamp' }),
                    transform: [
                      { translateX: p.interpolate({ inputRange: [0, 0.5], outputRange: [0, m.toX], extrapolate: 'clamp' }) },
                      { translateY: p.interpolate({ inputRange: [0, 0.5], outputRange: [0, m.toY], extrapolate: 'clamp' }) },
                      { rotate: p.interpolate({ inputRange: [0, 0.5], outputRange: [`${m.rot}deg`, `${m.toRot}deg`], extrapolate: 'clamp' }) },
                    ],
                  },
                ]}
              >
                {face.cover ? <Image source={{ uri: mediaUrl(face.cover) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.miniText}>{face.letter}</Text>}
              </Animated.View>
            );
          })}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{countText}</Text>
            {alert ? (
              <View style={styles.alert}>
                <View style={[styles.dot, { backgroundColor: alert.tone === 'out' ? colors.brand : colors.accent }]} />
                <Text style={styles.alertText} numberOfLines={1}>
                  {alert.text}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Animated.View style={[styles.chev, { transform: [{ rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }]}>
          <Ionicons name="chevron-down" size={18} color={colors.ink} />
        </Animated.View>
      </Pressable>

      {mounted ? (
        <Animated.View style={{ height: height ? p.interpolate({ inputRange: [0, 0.55], outputRange: [0, height], extrapolate: 'clamp' }) : undefined, overflow: 'hidden' }}>
          <View onLayout={onContent} style={styles.fold}>
            {rows.map((r, i) => {
              const [a, b] = rowWindow(i);
              return (
                <Animated.View
                  key={i}
                  style={{
                    opacity: p.interpolate({ inputRange: [a, b], outputRange: [0, 1], extrapolate: 'clamp' }),
                    transform: [
                      { translateY: p.interpolate({ inputRange: [a, b], outputRange: [-28, 0], extrapolate: 'clamp' }) },
                      { scale: p.interpolate({ inputRange: [a, b], outputRange: [0.94, 1], extrapolate: 'clamp' }) },
                    ],
                  }}
                >
                  {r}
                </Animated.View>
              );
            })}
            {footer ? <Animated.View style={{ opacity: p.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }}>{footer}</Animated.View> : null}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sec: { borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  secOpen: { shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  head: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 },
  stack: { width: 58, height: 50 },
  mini: { position: 'absolute', top: 3, width: 40, height: 44, borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  miniText: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  title: { fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  meta: { flexShrink: 0, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  alert: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  alertText: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  chev: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  fold: { paddingBottom: 6 },
});
