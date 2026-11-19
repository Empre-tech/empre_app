import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { OfferClaim as Claim } from '@/api/types';
import { formatWindow } from '@/lib/offer';
import { colors, fonts } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const DASH = 70;

/**
 * Justo después de reclamar (tablero «Reclamar una oferta»): la oferta se vuelve ticket, el puente del logo se
 * dibuja encima y su nodo la sella con una onda verde. Una sola vez; con «Reducir movimiento» aparece ya sellada.
 */
export function ClaimEnvelope({ claim, onOpen }: { claim: Claim; onOpen: () => void }) {
  const [ticket] = useState(() => new Animated.Value(0));
  const [draw] = useState(() => new Animated.Value(0));
  const [bar] = useState(() => new Animated.Value(0));
  const [node] = useState(() => new Animated.Value(0));
  const [wave] = useState(() => new Animated.Value(0));
  const [text] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          [ticket, draw, bar, node, text].forEach((v) => v.setValue(1));
          return;
        }
        Animated.sequence([
          Animated.spring(ticket, { toValue: 1, friction: 8, tension: 70, useNativeDriver: false }),
          Animated.timing(draw, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
          Animated.timing(bar, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
          Animated.parallel([
            Animated.spring(node, { toValue: 1, friction: 4, tension: 160, useNativeDriver: false }),
            Animated.timing(wave, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: false }),
            Animated.timing(text, { toValue: 1, duration: 420, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
          ]),
        ]).start();
      })
      .catch(() => [ticket, draw, bar, node, text].forEach((v) => v.setValue(1)));
    return () => {
      cancelled = true;
    };
  }, [ticket, draw, bar, node, wave, text]);

  const minutes = claim.offer?.claim_window_minutes;
  const dash = draw.interpolate({ inputRange: [0, 1], outputRange: [DASH, 0] });
  return (
    <View style={styles.wrap}>
      <View style={styles.middle}>
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.ticket, { opacity: ticket, transform: [{ translateY: ticket.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }, { scale: ticket.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }] }]}
        >
          <View style={styles.top}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>Oferta</Text>
            </View>
            <Text style={styles.offer} numberOfLines={2}>
              {claim.offer?.title ?? 'Tu oferta'}
            </Text>
          </View>
          <View style={styles.cut}>
            <View style={[styles.notch, styles.notchL]} />
            <View style={[styles.notch, styles.notchR]} />
          </View>
          <View style={styles.bottom}>
            <Text style={styles.where} numberOfLines={1}>
              {claim.entity_name ?? 'En el local'}
            </Text>
            <Svg width={92} height={92} viewBox="0 0 64 64" style={styles.seal}>
              <AnimatedPath d="M15 25V18C15 14.686 17.686 12 21 12H47" stroke={colors.ink} strokeWidth={7} strokeLinecap="round" fill="none" strokeDasharray={DASH} strokeDashoffset={dash} />
              <AnimatedPath d="M15 39V46C15 49.314 17.686 52 21 52H43C46.314 52 49 49.314 49 46V42" stroke={colors.ink} strokeWidth={7} strokeLinecap="round" fill="none" strokeDasharray={DASH} strokeDashoffset={dash} />
              <AnimatedRect x={15} y={28.5} height={7} rx={3.5} fill={colors.brand} width={bar.interpolate({ inputRange: [0, 1], outputRange: [0, 25] })} />
              <AnimatedCircle cx={47.5} cy={32} fill="none" stroke={colors.glow} strokeWidth={2} r={wave.interpolate({ inputRange: [0, 1], outputRange: [4, 18] })} opacity={wave.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] })} />
              <AnimatedCircle cx={47.5} cy={32} fill={colors.brand} r={node.interpolate({ inputRange: [0, 1], outputRange: [0, 4] })} />
            </Svg>
          </View>
        </Animated.View>
        <Animated.View style={[styles.text, { opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
          <Text style={styles.title} accessibilityRole="header">
            ¡Es tuyo!
          </Text>
          <Text style={styles.body}>
            {claim.entity_name ? `${claim.entity_name} te guardó un cupo.` : 'Te guardamos un cupo.'}
            {minutes ? ` Tienes ${formatWindow(minutes)} para usarla en el local.` : ''}
          </Text>
          <Text style={styles.saved}>Guardado en tus salidas</Text>
        </Animated.View>
      </View>
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
        <Text style={styles.btnText}>Ver mi QR</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'space-between', gap: 24, paddingBottom: 12 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26 },
  ticket: { width: 300, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', shadowColor: colors.ink, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  top: { padding: 18, gap: 10, backgroundColor: colors.sand },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 10, borderBottomRightRadius: 10, backgroundColor: colors.accent },
  tagText: { fontFamily: fonts.ui.extrabold, fontSize: 12.5, color: colors.ink },
  offer: { fontFamily: fonts.display.bold, fontSize: 20, lineHeight: 24, color: colors.ink },
  cut: { height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.line },
  notch: { position: 'absolute', top: -12, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bg },
  notchL: { left: -11 },
  notchR: { right: -11 },
  bottom: { minHeight: 110, padding: 18, justifyContent: 'center' },
  where: { fontFamily: fonts.ui.extrabold, fontSize: 15, color: colors.ink, maxWidth: 170 },
  seal: { position: 'absolute', right: 12, top: 10 },
  text: { gap: 8, paddingHorizontal: 8, alignItems: 'center' },
  title: { fontSize: 24, lineHeight: 28, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  saved: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.brand },
  btn: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandRef },
  btnText: { fontSize: 17, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
