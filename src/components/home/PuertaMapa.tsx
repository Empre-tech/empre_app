import { Ionicons } from '@/components/Icon';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { DiscoveryItem } from '@/api/types';
import { CategoryIllustration } from '@/components/CategoryIllustration';
import type { ArtCount } from '@/lib/offerHome';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';
import type { DoorRect } from './HomeDoors';

// El mapa limpio (2026-11-16, opción 1): más bajo y sin nada encima; solo lo abierto y tú.
const H = 140;
/** Dónde estás tú dentro del mapa (alto). */
const CY = 70;
/** Cuánto se abren los puntos hacia arriba y hacia abajo de ti. */
const SPREAD_Y = 50;

/**
 * Los colores de mapa (2026-11-14): los del mapa real de Finder (el estándar de Google), un poco más suaves para que lo
 * único que se lea sea lo abierto en rojo y tú.
 */
const MAP = {
  land: '#EFF1F0',
  road: '#FFFFFF',
  roadEdge: '#E2E6E5',
  avenue: '#F3E2B0',
  water: '#C4E2F2',
  park: '#D6ECD1',
} as const;
/** La pieza y las categorías: blanco con filo de arena, sin sombras. */
const CARD = '#FFFFFF';

/** Un barrio cualquiera: calles un poco torcidas, una avenida, agua en una esquina y dos parques. No es tu calle. */
function MapBase({ w }: { w: number }) {
  if (!w) return null;
  const roads = [...[28, 84, 132].map((y) => `M0 ${y} L${w} ${y + 4}`), ...[0.2, 0.5, 0.8].map((f) => `M${w * f} 0 L${w * f + 6} ${H}`)].join(' ');
  return (
    <Svg width="100%" height={H} style={StyleSheet.absoluteFill}>
      <Rect x={w * 0.54} y={8} width={w * 0.26} height={34} rx={6} fill={MAP.park} />
      <Rect x={w * 0.84} y={92} width={w * 0.18} height={36} rx={6} fill={MAP.park} />
      <Path d={roads} stroke={MAP.roadEdge} strokeWidth={9} />
      <Path d={roads} stroke={MAP.road} strokeWidth={7} />
      <Path d={`M0 ${H - 18} L${w} 44`} stroke={MAP.avenue} strokeWidth={10} />
      <Path d={`M0 0 H${w * 0.17} C${w * 0.14} 28 ${w * 0.08} 48 0 58 Z`} fill={MAP.water} />
    </Svg>
  );
}

/** Dónde cae cada negocio abierto en el mapa: su posición real respecto a ti, sin inventar ninguno. */
function place(items: DiscoveryItem[], center: { latitude: number; longitude: number } | null, w: number) {
  if (!center || !w) return [];
  const pts = items.filter((b) => b.latitude && b.longitude).map((b) => ({ id: b.id, dx: (b.longitude as number) - center.longitude, dy: (b.latitude as number) - center.latitude }));
  const max = Math.max(0.0008, ...pts.map((p) => Math.max(Math.abs(p.dx), Math.abs(p.dy))));
  return pts.map((p) => ({ id: p.id, x: w / 2 + (p.dx / max) * (w / 2 - 24), y: CY + (-p.dy / max) * SPREAD_Y }));
}

function Dot({ x, y, live }: { x: number; y: number; live: boolean }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!live || reduce) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [live, reduce, v]);
  return (
    <View pointerEvents="none" style={[styles.dotWrap, { left: x - 13, top: y - 13 }]}>
      <Animated.View style={[styles.dotHalo, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.05] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.4] }) }] }]} />
      <View style={styles.dot} />
    </View>
  );
}

/**
 * Una sola puerta, en capas (tablero «Inicio», 2026-11-16, opción 1): buscar, las categorías y el mapa van en una pieza,
 * cada uno en su lugar, y todo abre Empre Finder. Nada flota sobre el mapa (como Uber o Yelp; los botones encima solo van
 * cuando el mapa ocupa toda la pantalla, como en Google Maps): solo lo abierto en rojo y tú. Lo abierto, en una línea
 * debajo, con «Ver el mapa».
 */
export function PuertaMapa({
  items,
  center,
  openCount,
  nearCount,
  cats,
  onSearch,
  onCategory,
  onExplore,
}: {
  items: DiscoveryItem[];
  center: { latitude: number; longitude: number } | null;
  openCount: number;
  /** Cuántos negocios hay a la puerta (lo que encontró el mapa, nunca inventado). */
  nearCount: number;
  cats: ArtCount[];
  onSearch: () => void;
  onCategory: (c: ArtCount) => void;
  onExplore: (rect: DoorRect | null) => void;
}) {
  const mapRef = useRef<View>(null);
  const [w, setW] = useState(0);

  const pts = place(items, center, w);
  // La puerta se abre desde el mapa (la animación crece desde él), se toque el mapa o «Ver el mapa».
  const go = () => mapRef.current?.measureInWindow((x, y, ww, hh) => onExplore({ x, y, w: ww, h: hh })) ?? onExplore(null);
  const openText = openCount ? `${openCount} ${openCount === 1 ? 'abierto' : 'abiertos'} ahora` : 'Mira quién abre pronto';
  const nearText = nearCount > 1 ? `${nearCount} negocios` : null;
  const mapLabel = ['Ver el mapa', openText, nearText].filter(Boolean).join('. ');

  return (
    <View style={styles.card}>
      {/* Escribir: abre la búsqueda de Finder con el mapa a la vista */}
      <Pressable accessibilityRole="button" accessibilityLabel="Buscar en Empre" onPress={onSearch} style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
        <Ionicons name="search" size={20} color={colors.ink} />
        <Text style={styles.searchText} numberOfLines={1}>
          Busca negocios, cortes, almuerzos…
        </Text>
      </Pressable>

      {/* Elegir: las categorías planas, con el número real; cada una abre el mapa ya filtrado */}
      {cats.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cats} contentContainerStyle={styles.catsIn}>
          {cats.map((c) => (
            <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={`${c.label}, ${c.count} ${c.count === 1 ? 'negocio' : 'negocios'} cerca`} onPress={() => onCategory(c)} style={({ pressed }) => [styles.cat, pressed && styles.pressed]}>
              <CategoryIllustration k={c.key} size={30} />
              <Text style={styles.catText}>{c.label}</Text>
              <Text style={styles.catCount}>{c.count}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Mirar: un mapa limpio, solo lo abierto en rojo y tú; tocarlo abre el mapa entero */}
      <Pressable ref={mapRef} accessibilityRole="button" accessibilityLabel={mapLabel} onPress={go} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={({ pressed }) => [styles.map, pressed && styles.mapPressed]}>
        <MapBase w={w} />
        {pts.map((p, i) => (
          <Dot key={p.id} x={p.x} y={p.y} live={i === 0} />
        ))}
        <View pointerEvents="none" style={[styles.you, { left: w / 2 - 8 }]} />
      </Pressable>

      {/* Lo abierto, en una línea debajo del mapa */}
      <Pressable accessibilityRole="button" accessibilityLabel={mapLabel} onPress={go} style={({ pressed }) => [styles.line, pressed && styles.linePressed]}>
        <View style={styles.lineLeft}>
          <View style={styles.openDot} />
          <Text style={styles.openText} numberOfLines={1}>
            {openText}
            {nearText ? <Text style={styles.nearText}>{` · ${nearText}`}</Text> : null}
          </Text>
        </View>
        <View style={styles.lineRight}>
          <Text style={styles.seeMap}>Ver el mapa</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.ink} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 12, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  search: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.well },
  searchText: { flex: 1, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted },
  cats: { marginHorizontal: -12 },
  catsIn: { gap: 8, paddingHorizontal: 12 },
  cat: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 6, paddingRight: 13, paddingVertical: 4, borderRadius: 999, backgroundColor: CARD, borderWidth: 1, borderColor: colors.line },
  catText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  catCount: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, fontVariant: ['tabular-nums'] },
  map: { height: H, borderRadius: 16, overflow: 'hidden', backgroundColor: MAP.land },
  mapPressed: { opacity: 0.94 },
  dotWrap: { position: 'absolute', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  dotHalo: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandRef },
  dot: { width: 15, height: 15, borderRadius: 8, backgroundColor: colors.brandRef, borderWidth: 2.5, borderColor: '#FFFFFF', shadowColor: '#2B2622', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 2 },
  you: { position: 'absolute', top: CY - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.ink, borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#2B2622', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  line: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 4, marginVertical: -6 },
  linePressed: { opacity: 0.7 },
  lineLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  openDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandRef },
  openText: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  nearText: { fontFamily: fonts.ui.medium, color: colors.muted },
  lineRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeMap: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
});
