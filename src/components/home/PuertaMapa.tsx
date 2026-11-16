import { Ionicons } from '@/components/Icon';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { DiscoveryItem } from '@/api/types';
import { CategoryIllustration } from '@/components/CategoryIllustration';
import type { ArtCount } from '@/lib/offerHome';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';
import type { DoorRect } from './HomeDoors';

// Una sola puerta (2026-11-16): el mapa lleva dentro la búsqueda (arriba) y las categorías (en el borde de abajo).
const H = 250;
/** Dónde estás tú dentro de la tarjeta (alto): entre la búsqueda y las categorías. */
const CY = 122;
/** Cuánto se abren los puntos hacia arriba y hacia abajo de ti, sin meterse bajo la búsqueda ni las categorías. */
const SPREAD_Y = 50;

/**
 * Los colores de mapa (2026-11-14): los mismos del mapa real de Finder (el estándar de Google), no la arena del fondo.
 * Así la tarjeta se lee como un mapa y no como otra caja de la pantalla; lo de Empre (los negocios en rojo, tu puerta)
 * va encima, con borde blanco.
 */
const MAP = {
  land: '#EFF1F0',
  road: '#FFFFFF',
  roadEdge: '#DDE1E0',
  avenue: '#FBE3A1',
  avenueEdge: '#EDCF7A',
  water: '#A9D6EE',
  park: '#CCE8C6',
} as const;
/** Lo que flota sobre el mapa (búsqueda, categorías, el conteo): blanco, como en los mapas. */
const FLOAT = '#FFFFFF';

/** Un barrio cualquiera: calles un poco torcidas, una avenida, agua en una esquina y dos parques. No es tu calle. */
function MapBase({ w }: { w: number }) {
  if (!w) return null;
  const roads = [...[8, 62, 124, 186, 240].map((y) => `M0 ${y} L${w} ${y + 5}`), ...[0.2, 0.5, 0.8].map((f) => `M${w * f} 0 L${w * f + 8} ${H}`)].join(' ');
  const avenue = `M0 ${H - 36} L${w} 74`;
  return (
    <Svg width="100%" height={H} style={StyleSheet.absoluteFill}>
      <Rect x={w * 0.5 + 9} y={18} width={w * 0.3 - 14} height={40} rx={6} fill={MAP.park} />
      <Rect x={w * 0.8 + 12} y={138} width={w * 0.2} height={40} rx={6} fill={MAP.park} />
      <Path d={roads} stroke={MAP.roadEdge} strokeWidth={10} />
      <Path d={roads} stroke={MAP.road} strokeWidth={8} />
      <Path d={avenue} stroke={MAP.avenueEdge} strokeWidth={13} />
      <Path d={avenue} stroke={MAP.avenue} strokeWidth={11} />
      <Path d={`M0 0 H${w * 0.2 + 4} C${w * 0.17} 50 ${w * 0.1} 90 0 108 Z`} fill={MAP.water} />
      <Circle cx={w / 2} cy={CY} r={48} fill="rgba(255,29,37,0.05)" stroke="rgba(43,38,34,.3)" strokeWidth={1.5} strokeDasharray="4 6" />
    </Svg>
  );
}

/** Dónde cae cada negocio abierto en la tarjeta: su posición real respecto a ti, sin inventar ninguno. */
function place(items: DiscoveryItem[], center: { latitude: number; longitude: number } | null, w: number) {
  if (!center || !w) return [];
  const pts = items.filter((b) => b.latitude && b.longitude).map((b) => ({ id: b.id, dx: (b.longitude as number) - center.longitude, dy: (b.latitude as number) - center.latitude }));
  const max = Math.max(0.0008, ...pts.map((p) => Math.max(Math.abs(p.dx), Math.abs(p.dy))));
  return pts.map((p) => ({ id: p.id, x: w / 2 + (p.dx / max) * (w / 2 - 28), y: CY + (-p.dy / max) * SPREAD_Y }));
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
 * Una sola puerta al mapa (tablero «Inicio», 2026-11-16, como Google Maps): buscar, las categorías y el mapa eran tres
 * entradas al mismo lugar; ahora son una pieza. Escribes (la búsqueda de arriba), eliges una categoría (en el borde de
 * abajo, con el número real) o solo miras (tocar el mapa lo abre entero). Lo abierto va encima del mapa, sin título.
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
  const ref = useRef<View>(null);
  const [w, setW] = useState(0);

  const pts = place(items, center, w);
  const go = () => ref.current?.measureInWindow((x, y, ww, hh) => onExplore({ x, y, w: ww, h: hh })) ?? onExplore(null);
  const openText = openCount ? `${openCount} ${openCount === 1 ? 'abierto' : 'abiertos'} ahora` : 'Mira quién abre pronto';
  const nearText = nearCount > 1 ? `${nearCount} negocios` : null;

  return (
    <View ref={ref} style={styles.card} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {/* Solo mirar: tocar el mapa lo abre entero */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={['Ver el mapa', openText, nearText].filter(Boolean).join('. ')}
        onPress={go}
        style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.mapPressed]}
      >
        <MapBase w={w} />
        {pts.map((p, i) => (
          <Dot key={p.id} x={p.x} y={p.y} live={i === 0} />
        ))}
        <View pointerEvents="none" style={[styles.you, { left: w / 2 - 8 }]} />
        <View pointerEvents="none" style={[styles.youTag, { left: w / 2 - 36 }]}>
          <Text style={styles.youText}>Tu puerta</Text>
        </View>
        <View pointerEvents="none" style={styles.count}>
          <View style={styles.countDot} />
          <Text style={styles.countText} numberOfLines={1}>
            {openText}
            {nearText ? <Text style={styles.countNear}>{` · ${nearText}`}</Text> : null}
          </Text>
        </View>
        {/* El ícono de expandir dice que el mapa se abre, sin botón rojo que compita con lo abierto */}
        <View pointerEvents="none" style={styles.expand}>
          <Ionicons name="resize" size={16} color={colors.ink} />
        </View>
      </Pressable>

      {/* Escribir: abre la búsqueda de Finder con el mapa a la vista */}
      <Pressable accessibilityRole="button" accessibilityLabel="Buscar en Empre" onPress={onSearch} style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
        <Ionicons name="search" size={20} color={colors.ink} />
        <Text style={styles.searchText} numberOfLines={1}>
          Busca negocios, cortes, almuerzos…
        </Text>
      </Pressable>

      {/* Elegir: las categorías con lo que hay, sobre el borde de abajo; cada una abre el mapa ya filtrado */}
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
    </View>
  );
}

const shadow = { shadowColor: '#2B2622', shadowOffset: { width: 0, height: 1 } } as const;

const styles = StyleSheet.create({
  card: { height: H, borderRadius: 22, overflow: 'hidden', backgroundColor: MAP.land, borderWidth: 1, borderColor: 'rgba(43,38,34,0.06)' },
  mapPressed: { opacity: 0.94 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  dotWrap: { position: 'absolute', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  dotHalo: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandRef },
  dot: { width: 15, height: 15, borderRadius: 8, backgroundColor: colors.brandRef, borderWidth: 2.5, borderColor: '#FFFFFF', ...shadow, shadowOpacity: 0.25, shadowRadius: 4, elevation: 2 },
  you: { position: 'absolute', top: CY - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.ink, borderWidth: 3, borderColor: '#FFFFFF', ...shadow, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  youTag: { position: 'absolute', top: CY + 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: FLOAT, ...shadow, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 },
  youText: { fontFamily: fonts.ui.extrabold, fontSize: 10.5, color: colors.ink },
  count: { position: 'absolute', left: 12, right: 60, top: 70, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: FLOAT, ...shadow, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 },
  countDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandRef },
  countText: { flexShrink: 1, fontFamily: fonts.ui.semibold, fontSize: 13, color: colors.ink },
  countNear: { fontFamily: fonts.ui.medium, color: colors.muted },
  expand: { position: 'absolute', right: 12, top: 68, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: FLOAT, ...shadow, shadowOpacity: 0.16, shadowRadius: 6, elevation: 3 },
  search: { position: 'absolute', left: 12, right: 12, top: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: FLOAT, ...shadow, shadowOpacity: 0.14, shadowRadius: 10, elevation: 4 },
  searchText: { flex: 1, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted },
  cats: { position: 'absolute', left: 0, right: 0, bottom: 10 },
  catsIn: { gap: 8, paddingHorizontal: 12, paddingVertical: 2 },
  cat: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 6, paddingRight: 13, paddingVertical: 4, borderRadius: 999, backgroundColor: FLOAT, ...shadow, shadowOpacity: 0.16, shadowRadius: 5, elevation: 3 },
  catText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  catCount: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, fontVariant: ['tabular-nums'] },
});
