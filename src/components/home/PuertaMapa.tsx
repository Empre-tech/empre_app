import { Ionicons } from '@/components/Icon';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { DiscoveryItem } from '@/api/types';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts } from '@/theme';
import type { DoorRect } from './HomeDoors';

const H = 150;
/** Dónde va el negocio en el mapa (alto del centro de su foto). */
const PIN_Y = 52;
const PIN = 46;

/** Colores de mapa suaves (los del mapa real de Finder): lo único que destaca es el negocio y su zona. */
const MAP = { land: '#EEF0EF', road: '#FFFFFF', roadEdge: '#E2E6E5', park: '#CFE9D2', zone: 'rgba(251,227,140,0.55)', zoneEdge: 'rgba(230,200,100,0.55)' } as const;

/** Un barrio cualquiera, con la zona del negocio resaltada en amarillo (como Encontrar). No es tu calle. */
function MapBase({ w }: { w: number }) {
  if (!w) return null;
  const cx = w * 0.56;
  const roads = [`M0 ${H * 0.62} L${w} ${H * 0.66}`, `M${w * 0.34} 0 L${w * 0.36} ${H}`, `M${w * 0.8} 0 L${w * 0.82} ${H}`].join(' ');
  // La zona: un polígono suave alrededor del negocio
  const zone = `M${cx - 52} ${PIN_Y - 30} L${cx + 40} ${PIN_Y - 36} L${cx + 58} ${PIN_Y + 34} L${cx + 6} ${PIN_Y + 52} L${cx - 46} ${PIN_Y + 40} Z`;
  return (
    <Svg width="100%" height={H} style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={w * 0.24} height={H} fill={MAP.park} />
      <Path d={roads} stroke={MAP.roadEdge} strokeWidth={10} />
      <Path d={roads} stroke={MAP.road} strokeWidth={8} />
      <Path d={zone} fill={MAP.zone} stroke={MAP.zoneEdge} strokeWidth={1} />
    </Svg>
  );
}

/**
 * El mapa pequeño (tablero «Inicio», 2026-11-16, como la tarjeta de Encontrar de Apple): arriba el estado («● 9
 * abiertos · ahora»), un solo negocio con su foto en su zona resaltada y abajo su etiqueta («Brasa 22, 3 min a pie ›»).
 * Toda la tarjeta abre Empre Finder: ahí está todo lo demás. La puerta crece desde aquí.
 */
export function PuertaMapa({ featured, featuredName, walk, openCount, onExplore }: { featured: DiscoveryItem | null; featuredName: string | null; walk: string | null; openCount: number; onExplore: (rect: DoorRect | null) => void }) {
  const ref = useRef<View>(null);
  const [w, setW] = useState(0);
  const photo = featured ? (resolveImageUrl(featured.photos?.[0]) ?? resolveImageUrl(featured.profile_url)) : null;
  const go = () => ref.current?.measureInWindow((x, y, ww, hh) => onExplore({ x, y, w: ww, h: hh })) ?? onExplore(null);
  const label = featured && featuredName ? [featuredName, walk].filter(Boolean).join(', ') : 'Ver todo en Empre Finder';
  const status = openCount ? `${openCount} ${openCount === 1 ? 'abierto' : 'abiertos'}` : 'Abren pronto';

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={['Abrir Empre Finder', featured && featuredName ? label : null, openCount ? `${status} ahora` : null].filter(Boolean).join('. ')}
      onPress={go}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <MapBase w={w} />
      <View style={styles.status} pointerEvents="none">
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>
          {status}
          <Text style={styles.statusNow}> · Ahora</Text>
        </Text>
      </View>
      {featured && w ? (
        <View pointerEvents="none" style={[styles.pin, { left: w * 0.56 - PIN / 2, top: PIN_Y - PIN / 2 }]}>
          <View style={styles.pinPhoto}>{photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : null}</View>
          <View style={styles.pinTail} />
        </View>
      ) : null}
      <View style={styles.label} pointerEvents="none">
        <Text style={styles.labelText} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.ink} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { height: H, borderRadius: 20, overflow: 'hidden', backgroundColor: MAP.land, borderWidth: 1, borderColor: 'rgba(43,38,34,0.06)' },
  pressed: { opacity: 0.94 },
  status: { position: 'absolute', left: 12, top: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brandRef },
  statusText: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.ink },
  statusNow: { fontFamily: fonts.ui.medium, color: colors.muted },
  pin: { position: 'absolute', width: PIN, alignItems: 'center' },
  pinPhoto: { width: PIN, height: PIN, borderRadius: PIN / 2, overflow: 'hidden', borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: colors.sandSoft, shadowColor: '#2B2622', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  pinTail: { width: 10, height: 10, marginTop: -6, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }], borderRadius: 2 },
  label: { position: 'absolute', alignSelf: 'center', bottom: 12, maxWidth: '86%', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.96)', shadowColor: '#2B2622', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  labelText: { flexShrink: 1, fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
});
