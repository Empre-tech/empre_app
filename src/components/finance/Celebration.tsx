import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { formatPesos } from '@/lib/ledger';
import { useReduceMotion } from '@/lib/useReduceMotion';
import type { Fly, Toast } from '@/finance/useCelebration';
import { fin } from '@/finance/tokens';
import { alpha } from '@/theme';
import { Glass } from './Glass';

const C = fin.color;
const T = fin.type;
const R = fin.radius;
const S = fin.space;
const M = fin.motion;

/** «+$20.000» que sube (venta) o baja (gasto) desde la pieza y se desvanece. Con «Reducir movimiento» no aparece. */
export function FlyAmount({ fly, onDone }: { fly: Fly; onDone: () => void }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      onDone();
      return;
    }
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: M.flyMs, useNativeDriver: true }).start(({ finished }) => finished && onDone());
    // Una vez por cada registro (fly.n).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly.n]);
  if (reduce) return null;
  const up = fly.amount >= 0;
  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.fly,
        up ? styles.flyIn : styles.flyOut,
        {
          opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: up ? [6, -64] : [-40, 30] }) }],
        },
      ]}
    >
      {up ? '+' : '−'}
      {formatPesos(Math.abs(fly.amount))}
    </Animated.Text>
  );
}

/** «Registrado… · Deshacer» arriba de la pantalla, durante unos segundos. */
export function UndoToast({ toast, top, onUndo }: { toast: Toast; top: number; onUndo: () => void }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, ...M.toast }).start();
    // Entra de nuevo con cada registro (toast.n).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.n]);
  return (
    <Animated.View style={[styles.wrap, { top, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) }] }]}>
      <Glass dark style={styles.toast}>
        <Text style={styles.text} numberOfLines={1}>
          {toast.text}
        </Text>
        <Pressable accessibilityRole="button" onPress={onUndo} style={styles.undo}>
          <Text style={styles.undoText}>Deshacer</Text>
        </Pressable>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fly: { position: 'absolute', top: -6, alignSelf: 'center', zIndex: 3, fontSize: 20, fontFamily: T.amount.fontFamily, paddingHorizontal: S.md, paddingVertical: S.xs, borderRadius: R.badge, overflow: 'hidden' },
  flyIn: { color: C.in.ink, backgroundColor: alpha(C.in.soft, 0.95) },
  flyOut: { color: C.out.ink, backgroundColor: alpha(C.out.soft, 0.95) },
  wrap: { position: 'absolute', alignSelf: 'center', zIndex: 10, maxWidth: '92%' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingLeft: S.lg, paddingRight: 6, paddingVertical: 6, borderRadius: R.control, backgroundColor: alpha(C.voice.bg, 0.92) },
  text: { ...T.small, fontSize: 12.5, flexShrink: 1, color: C.voice.text },
  undo: { minHeight: 36, paddingHorizontal: S.md, borderRadius: R.control, backgroundColor: C.voice.chip, justifyContent: 'center' },
  undoText: { ...T.button, fontSize: 12.5, color: C.voice.text },
});
