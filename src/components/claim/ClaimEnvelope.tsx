import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { OfferClaim as Claim } from '@/api/types';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { formatWindow } from '@/lib/offer';
import { colors, fonts } from '@/theme';

const W = 300;
const H = 200;

/** Justo después de reclamar: el sobre cerrado con el sello de Empre. Abrirlo lleva al QR. */
export function ClaimEnvelope({ claim, onOpen }: { claim: Claim; onOpen: () => void }) {
  const [enter] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          enter.setValue(1);
          return;
        }
        Animated.spring(enter, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
          ]),
        );
        loop.start();
      })
      .catch(() => enter.setValue(1));
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [enter, pulse]);

  const minutes = claim.offer?.claim_window_minutes;
  return (
    <View style={styles.wrap}>
      <View style={styles.middle}>
        <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.envelope, { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
          <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <Rect width={W} height={H} rx={14} fill={colors.ink} />
            <Path d={`M0 70 L${W / 2} 140 L${W} 70 V${H - 14} A14 14 0 0 1 ${W - 14} ${H} H14 A14 14 0 0 1 0 ${H - 14} Z`} fill="#0B1A36" />
          </Svg>
          <Animated.View
            style={[
              styles.seal,
              {
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }],
              },
            ]}
          >
            <EmpreSymbol product="offers" size={54} />
          </Animated.View>
        </Animated.View>
        <View style={styles.text}>
          <Text style={styles.title} accessibilityRole="header">
            Tu oferta está lista
          </Text>
          <Text style={styles.body}>
            {claim.entity_name ? `${claim.entity_name} te guardó un cupo.` : 'Te guardamos un cupo.'}
            {minutes ? ` Tienes ${formatWindow(minutes)} para usarla en el local.` : ''}
          </Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
        <Text style={styles.btnText}>Abrir el sobre</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'space-between', gap: 24, paddingBottom: 12 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26 },
  envelope: { width: W, height: H, alignItems: 'center' },
  seal: { position: 'absolute', top: 100, width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  text: { gap: 8, paddingHorizontal: 8 },
  title: { fontSize: 26, lineHeight: 30, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.faint, textAlign: 'center' },
  btn: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary },
  btnText: { fontSize: 17, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
