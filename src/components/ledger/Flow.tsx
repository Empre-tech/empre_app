import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

/** Lo que tarda en salir el paso actual y en entrar el nuevo. Quien espere a que el paso esté quieto usa FLOW_SETTLE_MS. */
export const FLOW_OUT_MS = 140;
export const FLOW_IN_MS = 340;
export const FLOW_SETTLE_MS = FLOW_OUT_MS + FLOW_IN_MS;

/**
 * El paso que se ve y su movimiento: el actual sale hacia un lado y el nuevo entra por el otro, según se avance o se
 * vuelva. Con «Reducir movimiento» cambia sin moverse. `order` da el sentido. Empezar otro registro desde «Listo»
 * (del último paso al primero) cuenta como avanzar, no como volver.
 */
export function useFlowStep<T extends string>(target: T, order: readonly T[]) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(target);
  const [p] = useState(() => new Animated.Value(1));
  const [dir, setDir] = useState(1);
  useEffect(() => {
    if (reduce) return;
    if (target === shown) {
      // Si cambió de idea a mitad de camino, vuelve a quedar quieto.
      Animated.timing(p, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      return;
    }
    const restart = order.indexOf(shown) === order.length - 1 && order.indexOf(target) === 0;
    const d = restart || order.indexOf(target) >= order.indexOf(shown) ? 1 : -1;
    setDir(d);
    const out = Animated.timing(p, { toValue: 0, duration: FLOW_OUT_MS, easing: Easing.out(Easing.quad), useNativeDriver: true });
    out.start();
    // Con reloj y no al terminar la animación: el contenido cambia aunque el teléfono se atrase con un cuadro.
    const swap = setTimeout(() => {
      setShown(target);
      p.setValue(-1);
      Animated.timing(p, { toValue: 1, duration: FLOW_IN_MS, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
    }, FLOW_OUT_MS);
    return () => {
      out.stop();
      clearTimeout(swap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce]);
  // p va de 1 (quieto) a 0 (saliendo); entra desde -1. Con esto el mismo valor mueve la salida y la entrada.
  // Recorrido corto y la opacidad sube antes que el movimiento termine: se siente un paso, no un salto.
  const style = reduce
    ? undefined
    : {
        opacity: p.interpolate({ inputRange: [-1, -0.4, 0, 1], outputRange: [0, 0.6, 0, 1] }),
        transform: [{ translateX: p.interpolate({ inputRange: [-1, 0, 1], outputRange: [20 * dir, -12 * dir, 0] }) }],
      };
  // La barra de abajo cambia con el contenido: se desvanece y sube un poco, sin moverse de lado.
  const footStyle = reduce
    ? undefined
    : {
        opacity: p.interpolate({ inputRange: [-1, -0.4, 0, 1], outputRange: [0, 0.6, 0, 1] }),
        transform: [{ translateY: p.interpolate({ inputRange: [-1, 0, 1], outputRange: [12, 6, 0] }) }],
      };
  return { shown: reduce ? target : shown, style, footStyle };
}

/** Volver con el botón del teléfono: mientras `onBack` exista, retrocede un paso en vez de salir. */
export function useFlowBack(onBack: (() => void) | null) {
  useEffect(() => {
    if (!onBack) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);
}

/** Cabecera de un registro: volver, título, Venta | Gasto al empezar y la barra de avance, que crece al pasar de paso. */
export function FlowHeader({ title, step, steps, onBack, kind, onKind, label }: { title: string; step: number; steps: number; onBack?: () => void; kind?: 'sale' | 'expense'; onKind?: (k: 'sale' | 'expense') => void; label: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [w] = useState(() => new Animated.Value(step / steps));
  useEffect(() => {
    if (reduce) {
      w.setValue(step / steps);
      return;
    }
    Animated.timing(w, { toValue: step / steps, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [step, steps, reduce, w]);
  return (
    <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={onBack ? 'Volver al paso anterior' : 'Volver a Finanzas'} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')))} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {kind && onKind ? (
          <View style={styles.kinds} accessibilityRole="tablist" accessibilityLabel="Qué vas a registrar">
            {(['sale', 'expense'] as const).map((k) => (
              <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: kind === k }} onPress={() => onKind(k)} style={[styles.kind, kind === k && styles.kindOn]}>
                <Text style={styles.kindText}>{k === 'sale' ? 'Venta' : 'Gasto'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.track} accessible accessibilityLabel={`Paso ${step} de ${steps}: ${label}`}>
        <Animated.View style={[styles.fill, { width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </View>
  );
}

/** Un número o aviso que da un saltico cuando cambia. */
export function Pop({ value, children, style }: { value: unknown; children: ReactNode; style?: object }) {
  const reduce = useReduceMotion();
  const [s] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    s.setValue(1.18);
    Animated.spring(s, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [value, reduce, s]);
  return <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>;
}

/** El cierre: el visto entra con un resorte. */
export function DoneMark({ voided }: { voided?: boolean }) {
  const reduce = useReduceMotion();
  const [s] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) return;
    Animated.spring(s, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  }, [reduce, s]);
  return (
    <Animated.View style={[styles.done, voided && { backgroundColor: colors.placeholder }, { opacity: s, transform: [{ scale: s }] }]}>
      <Ionicons name={voided ? 'close' : 'checkmark'} size={44} color="#fff" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: { gap: 10, paddingHorizontal: 20, paddingBottom: 10, backgroundColor: colors.bg },
  headRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, ...softShadow },
  title: { flex: 1, minWidth: 0, fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  kinds: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 12, backgroundColor: colors.surface, ...softShadow },
  kind: { minHeight: 38, minWidth: 58, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  kindOn: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  kindText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.line },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.ink },
  done: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
});
