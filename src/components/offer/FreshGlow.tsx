import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius } from '@/theme';

/**
 * Lo recién publicado se nota: un brillo naranja recorre la tarjeta una vez, el borde late dos veces y una etiqueta
 * «Recién publicada» queda mientras dura. Con «Reducir movimiento», solo el borde y la etiqueta, quietos.
 */
export function FreshGlow({ active, children }: { active: boolean; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const [sweep] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active || reduce) return;
    sweep.setValue(0);
    pulse.setValue(0);
    Animated.parallel([
      Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 350, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();
  }, [active, reduce, sweep, pulse]);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {children}
      {active ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.ring, { opacity: reduce ? 1 : pulse }]} />
          {!reduce && w > 0 ? (
            <View pointerEvents="none" style={styles.clip}>
              <Animated.View
                style={[
                  styles.band,
                  { width: w * 0.35, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.4, w * 1.05] }) }, { skewX: '-18deg' }] },
                ]}
              />
            </View>
          ) : null}
          <View pointerEvents="none" style={styles.tag} accessible accessibilityLabel="Recién publicada">
            <Text style={styles.tagText}>Recién publicada</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: -3, right: -3, top: -3, bottom: -3, borderRadius: radius.lg + 5, borderWidth: 2.5, borderColor: colors.accent },
  clip: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius.lg + 2, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(245,130,32,0.28)' },
  tag: { position: 'absolute', top: -10, left: 14, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.accent },
  tagText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
