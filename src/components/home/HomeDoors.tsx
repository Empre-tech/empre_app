import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { DiscoveryItem } from '@/api/types';
import { HomeMap } from '@/components/explore/HomeMap';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export interface SmallDoor {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
}

/** El aro de 3 colores del logo alrededor del ícono; cada puerta lo gira distinto. */
function BrandRing({ turn }: { turn: number }) {
  const r = 18;
  const len = 2 * Math.PI * r;
  const seg = (from: number, size: number) => ({ strokeDasharray: `${len * size} ${len}`, strokeDashoffset: -len * from });
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" style={StyleSheet.absoluteFill} rotation={turn} origin="20, 20">
      <Circle cx={20} cy={20} r={r} fill={colors.bg} stroke={colors.brand} strokeWidth={2.5} {...seg(0, 0.22)} />
      <Circle cx={20} cy={20} r={r} fill="none" stroke="#14B8B0" strokeWidth={2.5} {...seg(0.22, 0.3)} />
      <Circle cx={20} cy={20} r={r} fill="none" stroke={colors.accent} strokeWidth={2.5} {...seg(0.52, 0.48)} />
    </Svg>
  );
}

/** La etiqueta de Ofertas se mece; quieta con «Reducir movimiento». */
function SwingTag() {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      v.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, reduce]);
  return (
    <Animated.View style={[styles.tag, { transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] }) }] }]}>
      <Ionicons name="pricetag" size={46} color="#FFFFFF" />
    </Animated.View>
  );
}

/**
 * Las puertas del inicio (3.59): Explorar con el mapa (la más grande, porque Empre gira alrededor del mapa), Ofertas en
 * naranja (el color que ya tiene ese trabajo) y una fila de puertas pequeñas al resto de Empre.
 */
export function HomeDoors({
  center,
  mapItems,
  mapSub,
  hasOpen,
  offersSub,
  onExplore,
  onOffers,
  doors,
}: {
  center: { latitude: number; longitude: number } | null;
  mapItems: DiscoveryItem[];
  mapSub: string;
  hasOpen: boolean;
  offersSub: string;
  onExplore: () => void;
  onOffers: () => void;
  doors: SmallDoor[];
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bigRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Explorar el mapa. ${mapSub}`} onPress={onExplore} style={({ pressed }) => [styles.explore, pressed && styles.pressed]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {center ? (
              <HomeMap center={center} items={mapItems} selectedId={null} onPick={() => undefined} showUser />
            ) : (
              <View style={styles.mapEmpty}>
                <Ionicons name="map-outline" size={30} color={colors.faint} />
              </View>
            )}
          </View>
          <View style={styles.exploreFoot}>
            <View style={styles.footText}>
              <Text style={styles.doorTitle}>Explorar</Text>
              <View style={styles.live}>
                {hasOpen ? <View style={styles.liveDot} /> : null}
                <Text style={[styles.liveText, !hasOpen && { color: colors.muted }]} numberOfLines={1}>
                  {mapSub}
                </Text>
              </View>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.ink} />
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ofertas. ${offersSub}`} onPress={onOffers} style={({ pressed }) => [styles.offers, pressed && styles.pressed]}>
          <SwingTag />
          <View>
            <Text style={styles.offersTitle}>Ofertas</Text>
            <Text style={styles.offersSub}>{offersSub}</Text>
          </View>
        </Pressable>
      </View>
      <View style={styles.smallRow}>
        {doors.map((d, i) => (
          <Pressable key={d.key} accessibilityRole="button" accessibilityLabel={d.label} onPress={d.onPress} style={({ pressed }) => [styles.small, pressed && styles.pressed]}>
            <View style={styles.ring}>
              <BrandRing turn={i * 90} />
              <Ionicons name={d.icon} size={19} color={colors.ink} />
            </View>
            <Text style={styles.smallLabel} numberOfLines={1}>
              {d.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  bigRow: { flexDirection: 'row', gap: 8, height: 156 },
  explore: { flex: 2, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.selectedSoft, justifyContent: 'flex-end', padding: 10, ...softShadow },
  mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  exploreFoot: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: colors.surface },
  footText: { flex: 1, minWidth: 0, gap: 1 },
  doorTitle: { fontSize: 16, lineHeight: 19, fontFamily: fonts.display.bold, color: colors.ink },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#14B8B0' },
  liveText: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  offers: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.accent, padding: 12, justifyContent: 'flex-end', ...softShadow },
  tag: { position: 'absolute', right: 10, top: 10 },
  offersTitle: { fontSize: 18, lineHeight: 21, fontFamily: fonts.display.bold, color: colors.ink },
  offersSub: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  smallRow: { flexDirection: 'row', gap: 8 },
  small: { flex: 1, minHeight: 84, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, ...softShadow },
  ring: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  smallLabel: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
});
