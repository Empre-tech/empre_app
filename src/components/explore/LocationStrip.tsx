import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { SETTLE_MS, shouldAnnounce, type StripText } from '@/lib/locationStrip';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { alpha, colors, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  text: StripText;
  /** El dedo mueve el mapa: la franja se atenúa y el nombre espera a que el mapa se detenga. */
  moving: boolean;
  /** «Volver» (el mapa vuelve a la persona) o «Activar ubicación». */
  onAction: () => void;
}

const SHIFT = 18;
/** Verde oscuro para texto sobre blanco (el verde de estado da 3,3:1). */
const HERE_INK = colors.successInk;

/**
 * Franja de arriba de Explorar: «Estás en Comuna 4 · Santa Marta» o «Explorando Mamatoco · Santa Marta» con
 * «a 3,1 km · Volver». Cuando la zona cambia (y el mapa lleva quieto 0,4 s) el nombre viejo sale hacia arriba y
 * entra el nuevo; con «Reducir movimiento» cambia sin deslizarse. El lector de pantalla lo anuncia cada 3 s como mucho.
 */
export function LocationStrip({ text, moving, onAction }: Props) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(text);
  const [prev, setPrev] = useState<StripText | null>(null);
  const [p] = useState(() => new Animated.Value(1));
  const lastSaid = useRef<number | null>(null);

  useEffect(() => {
    if (moving || text.key === shown.key) return;
    const timer = setTimeout(() => {
      setShown(text);
      const now = Date.now();
      if (shouldAnnounce(lastSaid.current, now)) {
        lastSaid.current = now;
        AccessibilityInfo.announceForAccessibility(text.a11y);
      }
      if (reduce) return;
      setPrev(shown);
      p.setValue(0);
      Animated.timing(p, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => setPrev(null));
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [text, moving, shown, reduce, p]);

  const enter = {
    opacity: p,
    transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [SHIFT, 0] }) }],
  };
  const leave = {
    opacity: p.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -SHIFT] }) }],
  };
  // El botón de la derecha sigue a lo que se ve (la distancia cambia con el nombre, no antes).
  const current = moving ? shown : text;
  const label = (t: StripText) => (
    <>
      <Text style={styles.lead} numberOfLines={1}>
        {t.lead}
        {moving ? ' …' : ''}
      </Text>
      <Text style={styles.title} numberOfLines={1}>
        {t.title}
        {t.city && t.city !== t.title ? <Text style={styles.city}> · {t.city}</Text> : null}
      </Text>
    </>
  );

  return (
    <View style={[styles.strip, moving && styles.moving]}>
      <View style={styles.pin}>
        <Ionicons name="location" size={17} color={colors.primary} />
      </View>
      <View style={styles.texts} accessible accessibilityRole="text" accessibilityLabel={shown.a11y}>
        {prev ? <Animated.View style={[styles.prev, leave]}>{label(prev)}</Animated.View> : null}
        <Animated.View style={prev ? enter : null}>{label(shown)}</Animated.View>
      </View>
      {current.action === 'here' ? (
        <View style={styles.here} accessible accessibilityLabel="Estás aquí">
          <Ionicons name="navigate" size={13} color={HERE_INK} />
          <Text style={styles.hereText}>Aquí</Text>
        </View>
      ) : current.action === 'none' ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={current.action === 'back' ? 'Volver a mi ubicación' : 'Activar ubicación'}
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          {current.action === 'enable' ? <Ionicons name="navigate" size={13} color={colors.primaryDark} /> : null}
          <Text style={styles.actionText} numberOfLines={1}>
            {current.actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingVertical: 4,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    borderRadius: radius.md,
    backgroundColor: alpha(colors.white, 0.97),
    ...shadow,
  },
  moving: { opacity: 0.72 },
  pin: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, overflow: 'hidden', justifyContent: 'center' },
  prev: { position: 'absolute', left: 0, right: 0, top: 0 },
  lead: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.muted },
  title: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  city: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  here: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: spacing.md },
  hereText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: HERE_INK },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
    maxWidth: '48%',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  pressed: { opacity: 0.7 },
  actionText: { flexShrink: 1, fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
});
