import { Ionicons } from '@/components/Icon';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { DiscoveryItem } from '@/api/types';
import type { NovedadItem } from '@/lib/novedades';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';
import type { DoorRect } from './HomeDoors';

// Más bajo (2026-11-14): buscar, categorías y lo abierto entran en la primera pantalla sin bajar.
const H = 196;
/** Dónde estás tú dentro de la tarjeta (alto). */
const CY = 92;

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

/** Un barrio cualquiera: calles un poco torcidas, una avenida, agua en una esquina y dos parques. No es tu calle. */
function MapBase({ w }: { w: number }) {
  if (!w) return null;
  const roads = [...[36, 98, 160].map((y) => `M0 ${y} L${w} ${y + 6}`), ...[0.2, 0.5, 0.8].map((f) => `M${w * f} 0 L${w * f + 8} ${H}`)].join(' ');
  const avenue = `M0 ${H - 20} L${w} 50`;
  return (
    <Svg width="100%" height={H} style={StyleSheet.absoluteFill}>
      <Rect x={w * 0.5 + 9} y={-6} width={w * 0.3 - 14} height={38} rx={6} fill={MAP.park} />
      <Rect x={w * 0.8 + 12} y={112} width={w * 0.2} height={40} rx={6} fill={MAP.park} />
      <Path d={roads} stroke={MAP.roadEdge} strokeWidth={10} />
      <Path d={roads} stroke={MAP.road} strokeWidth={8} />
      <Path d={avenue} stroke={MAP.avenueEdge} strokeWidth={13} />
      <Path d={avenue} stroke={MAP.avenue} strokeWidth={11} />
      <Path d={`M0 0 H${w * 0.2 + 4} C${w * 0.17} 40 ${w * 0.1} 70 0 84 Z`} fill={MAP.water} />
      <Circle cx={w / 2} cy={CY} r={50} fill="rgba(212,32,32,0.05)" stroke="rgba(43,38,34,.3)" strokeWidth={1.5} strokeDasharray="4 6" />
    </Svg>
  );
}

/** Dónde cae cada negocio abierto en la tarjeta: su posición real respecto a ti, sin inventar ninguno. */
function place(items: DiscoveryItem[], center: { latitude: number; longitude: number } | null, w: number) {
  if (!center || !w) return [];
  const pts = items.filter((b) => b.latitude && b.longitude).map((b) => ({ id: b.id, dx: (b.longitude as number) - center.longitude, dy: (b.latitude as number) - center.latitude }));
  const max = Math.max(0.0008, ...pts.map((p) => Math.max(Math.abs(p.dx), Math.abs(p.dy))));
  return pts.map((p) => ({ id: p.id, x: w / 2 + (p.dx / max) * (w / 2 - 28), y: CY + (-p.dy / max) * 62 }));
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
 * El ancla del inicio (tablero «Inicio · los negocios a la puerta de tu casa»): un mapa con colores de mapa, los
 * negocios abiertos en rojo y sobre él corre lo último que pasó cerca. Toda la tarjeta abre el mapa; abajo a la
 * derecha, un ícono de expandir lo dice sin botón rojo (el rojo, en el mapa, es lo abierto).
 */
export function PuertaMapa({
  items,
  center,
  openCount,
  ticker,
  whenOf,
  onExplore,
}: {
  items: DiscoveryItem[];
  center: { latitude: number; longitude: number } | null;
  openCount: number;
  ticker: NovedadItem[];
  whenOf: (iso: string) => string;
  onExplore: (rect: DoorRect | null) => void;
}) {
  const reduce = useReduceMotion();
  const ref = useRef<View>(null);
  const [w, setW] = useState(0);
  const [k, setK] = useState(0);
  const [fade] = useState(() => new Animated.Value(1));

  // Lo último que pasó cerca cambia solo cada 3,4 s (con «Reducir movimiento» se queda en el primero).
  useEffect(() => {
    if (ticker.length < 2 || reduce) return;
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
        setK((n) => n + 1);
        Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
    }, 3400);
    return () => clearInterval(t);
  }, [ticker.length, reduce, fade]);

  const pts = place(items, center, w);
  const tick = ticker.length ? ticker[k % ticker.length] : null;
  const go = () => ref.current?.measureInWindow((x, y, ww, hh) => onExplore({ x, y, w: ww, h: hh })) ?? onExplore(null);

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`Ver el mapa. ${openCount} abiertos ahora.`}
      onPress={go}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <MapBase w={w} />
      {pts.map((p, i) => (
        <Dot key={p.id} x={p.x} y={p.y} live={i === 0} />
      ))}
      <View pointerEvents="none" style={[styles.you, { left: w / 2 - 8 }]} />
      <View pointerEvents="none" style={[styles.youTag, { left: w / 2 - 36 }]}>
        <Text style={styles.youText}>Tu puerta</Text>
      </View>
      <View style={styles.count}>
        <View style={styles.countDot} />
        <Text style={styles.countText}>{openCount ? `${openCount} ${openCount === 1 ? 'abierto' : 'abiertos'} ahora` : 'Mira quién abre pronto'}</Text>
      </View>
      <View style={styles.bottom}>
        {tick ? (
          <Animated.View style={[styles.tick, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
            <View style={[styles.tickIcon, { backgroundColor: tick.kind === 'offer' ? colors.accent : colors.nightText }]}>
              <Ionicons name={tick.kind === 'offer' ? 'pricetag' : 'images'} size={15} color={colors.night} />
            </View>
            <View style={styles.tickBody}>
              <Text style={styles.tickTitle} numberOfLines={1}>
                {tick.entity_name}: {tick.title.trim() || (tick.kind === 'offer' ? 'oferta nueva' : 'publicó algo nuevo')}
              </Text>
              <Text style={styles.tickWhen}>{whenOf(tick.at)}</Text>
            </View>
          </Animated.View>
        ) : null}
        {/* Toda la tarjeta abre el mapa: el ícono de expandir lo dice sin tapar el mapa ni competir con el rojo de lo abierto */}
        <View style={styles.expand}>
          <Ionicons name="resize" size={18} color={colors.ink} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { height: H, borderRadius: 22, overflow: 'hidden', backgroundColor: MAP.land, borderWidth: 1, borderColor: 'rgba(43,38,34,0.06)' },
  dotWrap: { position: 'absolute', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  dotHalo: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand },
  dot: { width: 15, height: 15, borderRadius: 8, backgroundColor: colors.primary, borderWidth: 2.5, borderColor: '#FFFFFF', shadowColor: '#2B2622', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  you: { position: 'absolute', top: CY - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.ink, borderWidth: 3, borderColor: '#FFFFFF', shadowColor: '#2B2622', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  youTag: { position: 'absolute', top: CY - 36, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surface, shadowColor: '#2B2622', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  youText: { fontFamily: fonts.ui.extrabold, fontSize: 10.5, color: colors.ink },
  count: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface, shadowColor: '#2B2622', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  countDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.glow },
  countText: { fontFamily: fonts.ui.semibold, fontSize: 13, color: colors.primaryDark },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 8, alignItems: 'flex-end' },
  tick: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  tickIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tickBody: { flex: 1, minWidth: 0 },
  tickTitle: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, color: colors.ink },
  tickWhen: { fontFamily: fonts.ui.bold, fontSize: 12, color: colors.nightText },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.985 }] },
  // Sin botón rojo (2026-11-14): un círculo blanco con el ícono de expandir, como las vistas previas de los mapas.
  expand: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: '#2B2622', shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
});
