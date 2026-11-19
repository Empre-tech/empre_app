import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, G, LinearGradient, Mask, Path, Pattern, Rect, Stop } from 'react-native-svg';

import type { DiscoveryItem } from '@/api/types';
import type { BestPrice } from '@/lib/askMany';
import { pesos } from '@/lib/askMany';
import { categoryColor } from '@/lib/categoryColor';
import { onFootOrDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { artKeyFor } from '@/components/CategoryArt';
import { ART_TINT, CategoryIllustration } from '@/components/CategoryIllustration';
import { benefitOf, countdown, priceView, timeBadge, type MarketItem } from '@/lib/offerMarket';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

const walk = (m?: number | null) => (m == null ? null : onFootOrDistance(m / 1000));

function Wash({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="0.7" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * El fondo de una sección especial, sin borde: el color entra desde el fondo de la pantalla, se sostiene donde están
 * las tarjetas y se vuelve a ir. Encima, etiquetitas de precio muy suaves que hablan de ofertas; se desvanecen igual,
 * así no hay ninguna línea de corte.
 */
function BandGlow({ id, tint, ink, opacity }: { id: string; tint: string; ink: string; opacity: number }) {
  const fade = (c: string) => [
    <Stop key="a" offset="0" stopColor={c} stopOpacity={0} />,
    <Stop key="b" offset="0.3" stopColor={c} stopOpacity={1} />,
    <Stop key="c" offset="0.72" stopColor={c} stopOpacity={1} />,
    <Stop key="d" offset="1" stopColor={c} stopOpacity={0} />,
  ];
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          {fade(tint)}
        </LinearGradient>
        <LinearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          {fade('#FFFFFF')}
        </LinearGradient>
        <Mask id={`${id}m`}>
          <Rect width="100%" height="100%" fill={`url(#${id}f)`} />
        </Mask>
        <Pattern id={`${id}p`} width={64} height={64} patternUnits="userSpaceOnUse">
          <G fill="none" stroke={ink} strokeOpacity={opacity} strokeWidth={1.6} strokeLinejoin="round">
            <Path d="M10 14h14l12 12-12 12H10z" transform="rotate(-18 22 26)" />
            <Path d="M40 40h11l9 9-9 9H40z" transform="rotate(14 50 49)" />
          </G>
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id}g)`} />
      <Rect width="100%" height="100%" fill={`url(#${id}p)`} mask={`url(#${id}m)`} />
    </Svg>
  );
}

const sealOf = (o: MarketItem) => {
  const p = priceView(o);
  if (p.save) return p.save.replace(' ', '');
  const b = benefitOf(o);
  return b === 'multi' ? '2x1' : b === 'free' ? 'Gratis' : 'Oferta';
};

/** El velo de la foto: un poco arriba (para las barras) y fuerte abajo (para leer el precio en blanco). */
function Scrim({ id }: { id: string }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#14100C" stopOpacity={0.3} />
          <Stop offset="0.26" stopColor="#14100C" stopOpacity={0} />
          <Stop offset="0.42" stopColor="#14100C" stopOpacity={0} />
          <Stop offset="1" stopColor="#14100C" stopOpacity={0.84} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Las mejores de hoy (tablero «Empre Offers», teléfono 1, 2026-11-14): la foto a todo el ancho, como Uber Eats y las
 * historias; arriba, una barra por oferta que se llena en 4,2 s y entonces pasa a la siguiente; abajo, sobre un velo,
 * el negocio, el precio grande y cuándo termina; el sello entra con un rebote. Sin foto, el fondo de su categoría con
 * su dibujo. Si la persona la toca o la desliza, deja de pasar sola. Con «Reducir movimiento» no pasan solas ni rebotan.
 */
export function HeroCarousel({ items, bizById, now, onOpen }: { items: MarketItem[]; bizById: Record<string, DiscoveryItem>; now: number; onOpen: (o: MarketItem) => void }) {
  const { width } = useWindowDimensions();
  const w = width - 40;
  const reduce = useReduceMotion();
  const ref = useRef<ScrollView>(null);
  const [i, setI] = useState(0);
  // Si la persona lo toca o lo desliza, deja de pasar solo: manda ella.
  const [held, setHeld] = useState(false);
  const [pop] = useState(() => new Animated.Value(1));
  const [fill] = useState(() => new Animated.Value(0));
  const n = items.length;

  // La barra de la que se ve se llena y, al llenarse, pasa a la siguiente.
  useEffect(() => {
    const still = reduce || held || n < 2;
    fill.setValue(still ? 1 : 0);
    if (still) return;
    const a = Animated.timing(fill, { toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: true });
    a.start(({ finished }) => {
      if (finished) setI((k) => (k + 1) % n);
    });
    return () => a.stop();
  }, [i, n, reduce, held, fill]);
  useEffect(() => {
    ref.current?.scrollTo({ x: i * w, animated: !reduce });
    if (reduce) return;
    pop.setValue(0.6);
    const a = Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [i, w, reduce, pop]);

  return (
    <View style={[styles.hero, { width: w }]}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onTouchStart={() => setHeld(true)}
        onScrollBeginDrag={() => setHeld(true)}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / w))}
        accessibilityLabel="Las mejores ofertas de hoy"
      >
        {items.map((o, k) => {
          const p = priceView(o);
          const tint = categoryColor(o.category_color).bg;
          const biz = bizById[o.entity_id];
          const when = [timeBadge(o.ends_at, now).text, walk(o.distance_meters)].filter(Boolean).join(' · ');
          const onPhoto = Boolean(o.photo);
          return (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={[o.title, p.now, p.was ? `antes ${p.was}` : null, o.entity_name, when].filter(Boolean).join(', ')}
              onPress={() => onOpen(o)}
              style={[styles.slide, { width: w }]}
            >
              {onPhoto ? (
                <>
                  <Image source={{ uri: o.photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                  <Scrim id={`hs${k}`} />
                </>
              ) : (
                <>
                  <Wash id={`hw${k}`} from={tint} to={colors.surface} />
                  <View style={styles.slideArt}>
                    <CategoryIllustration k={artKeyFor(o.category_name, o.category_icon)} size={150} />
                  </View>
                </>
              )}
              <View style={styles.slideText}>
                <View style={styles.slideBiz}>
                  <Image source={{ uri: resolveImageUrl(biz?.profile_url) ?? o.photo }} style={styles.slideLogo} contentFit="cover" accessibilityIgnoresInvertColors />
                  <Text style={[styles.slideBizName, onPhoto && styles.onPhoto]} numberOfLines={1}>
                    {o.entity_name}
                  </Text>
                </View>
                <Text style={[styles.slideName, onPhoto && styles.onPhoto]} numberOfLines={1}>
                  {o.title}
                </Text>
                <View style={styles.slidePriceRow}>
                  {p.now ? <Text style={[styles.slidePrice, onPhoto && styles.onPhoto]}>{p.now}</Text> : null}
                  {p.was ? <Text style={[styles.slideWas, onPhoto && styles.onPhotoSoft]}>{p.was}</Text> : null}
                </View>
                <Text style={[styles.slideWhen, onPhoto && styles.onPhotoSoft]} numberOfLines={1}>
                  {when}
                </Text>
              </View>
              <Animated.View style={[styles.seal, { transform: [{ rotate: '-8deg' }, { scale: k === i ? pop : 1 }] }]}>
                <Text style={styles.sealText}>{sealOf(o)}</Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </ScrollView>
      {n > 1 ? (
        <View style={styles.bars} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {items.map((o, k) => (
            <View key={o.id} style={styles.bar}>
              <Animated.View style={[styles.barFill, { transform: [{ scaleX: k < i ? 1 : k === i ? fill : 0 }] }]} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Mejor precio cerca: lo mismo en varios negocios; la franja dice dónde queda este precio frente a los demás.
 * Funciona sin ofertas: compara lo que cada negocio ya publicó.
 */
export function BestPriceRail({ picks, onOpen }: { picks: BestPrice[]; onOpen: (o: MarketItem) => void }) {
  return (
    <View style={styles.band}>
      <BandGlow id="bp" tint="#FBDCD5" ink={colors.brand} opacity={0.14} />
      <View style={styles.bandHead}>
        <Text style={styles.title} accessibilityRole="header">
          Mejor precio cerca
        </Text>
        <Text style={styles.why}>Lo mismo en varios negocios: aquí está más barato</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bandRail}>
        {picks.map((b) => (
          <Pressable
            key={b.item.id}
            accessibilityRole="button"
            accessibilityLabel={`${b.item.title}, ${pesos(b.min)} en ${b.item.entity_name}, el más bajo de ${b.count}; hasta ${pesos(b.max)}`}
            onPress={() => onOpen(b.item)}
            style={({ pressed }) => [styles.best, pressed && styles.pressed]}
          >
            <View>
              {b.item.photo ? (
                <Image source={{ uri: b.item.photo }} style={styles.bestImg} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : (
                <View style={[styles.bestImg, styles.bestArt, { backgroundColor: ART_TINT[artKeyFor(b.item.category_name, b.item.category_icon)] }]}>
                  <CategoryIllustration k={artKeyFor(b.item.category_name, b.item.category_icon)} size={84} />
                </View>
              )}
              <Text style={styles.bestBadge}>{`El más bajo de ${b.count}`}</Text>
            </View>
            <View style={styles.bestBody}>
              <Text style={styles.bestName} numberOfLines={1}>
                {b.item.title}
              </Text>
              <View style={styles.bestPriceRow}>
                <Text style={styles.bestPrice}>{pesos(b.min)}</Text>
                <Text style={styles.bestBiz} numberOfLines={1}>
                  {b.item.entity_name}
                </Text>
              </View>
              <View style={styles.strip}>
                <View style={styles.stripLine} />
                {b.others.map((x, k) => (
                  <View key={k} style={[styles.stripDot, { left: `${Math.round(x * 92)}%` }]} />
                ))}
                <View style={styles.stripMe} />
              </View>
              <View style={styles.stripLabels}>
                <Text style={styles.stripText}>{pesos(b.min)}</Text>
                <Text style={styles.stripText}>{`hasta ${pesos(b.max)}`}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** El punto que late junto a la cuenta atrás: el único bucle de la pantalla. */
function LiveDot() {
  const reduce = useReduceMotion();
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduce) return;
    const a = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 0.25, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [o, reduce]);
  return <Animated.View style={[styles.live, { opacity: o }]} />;
}

const WINDOW = 8 * 3600_000;

/**
 * Relámpago · terminan hoy: franja naranja suave con etiquetas y la cuenta atrás viva. Solo esta parte se actualiza
 * cada segundo (su propio reloj); el resto de la pantalla no se vuelve a dibujar.
 */
export function Relampago({ items, onOpen }: { items: MarketItem[]; onOpen: (o: MarketItem) => void }) {
  const now = useNow(1000);
  const first = items[0];
  return (
    <View style={styles.band}>
      <BandGlow id="rp" tint="#FFE6CA" ink={colors.accent} opacity={0.26} />
      <View style={[styles.bandHead, styles.bandHeadRow]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} accessibilityRole="header">
            Relámpago · terminan hoy
          </Text>
          <Text style={[styles.why, { color: colors.accentInk }]}>Cuando llega a cero, se va</Text>
        </View>
        {first ? (
          <View style={styles.clock} accessibilityLabel={`La primera termina en ${countdown(first.ends_at, now)}`}>
            <LiveDot />
            <Text style={styles.clockText}>{countdown(first.ends_at, now)}</Text>
          </View>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bandRail}>
        {items.map((o) => {
          const p = priceView(o);
          const left = Math.max(0, Date.parse(o.ends_at) - now);
          return (
            <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={[o.title, p.now, o.entity_name, `quedan ${countdown(o.ends_at, now)}`].filter(Boolean).join(', ')} onPress={() => onOpen(o)} style={({ pressed }) => [styles.flash, pressed && styles.pressed]}>
              <View>
                <Image source={{ uri: o.photo }} style={styles.flashImg} contentFit="cover" accessibilityIgnoresInvertColors />
                <Text style={styles.flashTag}>{sealOf(o)}</Text>
              </View>
              <View style={styles.flashBody}>
                <View style={styles.bestPriceRow}>
                  {p.now ? <Text style={styles.flashPrice}>{p.now}</Text> : null}
                  {p.was ? <Text style={styles.flashWas}>{p.was}</Text> : null}
                </View>
                <Text style={styles.flashName} numberOfLines={1}>
                  {o.title} · {o.entity_name}
                </Text>
                <View style={styles.flashBar}>
                  <View style={[styles.flashFill, { width: `${Math.round(Math.min(1, left / WINDOW) * 100)}%` }]} />
                </View>
                <Text style={styles.flashLeft}>{`Quedan ${countdown(o.ends_at, now)}`}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  title: { fontFamily: fonts.display.semibold, fontSize: 17, color: colors.ink },
  why: { fontFamily: fonts.ui.medium, fontSize: 12, color: colors.muted },
  rail: { gap: 12, paddingHorizontal: 20 },
  hero: { marginHorizontal: 20, height: 232, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.ink, shadowColor: '#2B2622', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  slide: { height: 232, overflow: 'hidden' },
  slideArt: { position: 'absolute', right: -6, bottom: -4 },
  slideText: { position: 'absolute', left: 16, right: 16, bottom: 14, gap: 3 },
  slideBiz: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  slideLogo: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: colors.sandSoft },
  slideBizName: { flexShrink: 1, fontFamily: fonts.ui.semibold, fontSize: 13, color: colors.ink },
  slideName: { fontFamily: fonts.ui.semibold, fontSize: 15, lineHeight: 19, color: colors.ink },
  slidePriceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 },
  slidePrice: { fontFamily: fonts.ui.extrabold, fontSize: 32, letterSpacing: -0.5, color: colors.ink, fontVariant: ['tabular-nums'] },
  slideWas: { fontFamily: fonts.ui.medium, fontSize: 14, color: colors.muted, textDecorationLine: 'line-through' },
  slideWhen: { fontFamily: fonts.ui.semibold, fontSize: 12, color: colors.accentInk },
  // Sobre la foto el texto va en blanco, con una sombra suave para que se lea en cualquier foto.
  onPhoto: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  onPhotoSoft: { color: 'rgba(255,255,255,0.86)' },
  seal: { position: 'absolute', right: 14, top: 22, width: 62, height: 62, borderRadius: 31, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#A35C13', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  sealText: { fontFamily: fonts.ui.extrabold, fontSize: 16, color: colors.ink },
  // Las barras de arriba, como las historias: una por oferta; la de la que se ve se llena.
  bars: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.42)' },
  barFill: { height: '100%', backgroundColor: '#FFFFFF', transformOrigin: 'left' },
  // Una franja especial va de lado a lado y sin borde: su color sale del fondo y vuelve a él (BandGlow). El aire de
  // arriba y abajo es donde el color se desvanece; el título y las tarjetas quedan en la parte llena.
  band: { marginVertical: -14, paddingTop: 40, paddingBottom: 44, gap: 14 },
  bandRail: { gap: 12, paddingHorizontal: 20 },
  bandHead: { paddingHorizontal: 20, gap: 2 },
  bandHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  best: { width: 200, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface, shadowColor: '#B91C1C', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  bestImg: { width: '100%', height: 104, backgroundColor: colors.sandSoft },
  bestArt: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bestBadge: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surface, fontFamily: fonts.ui.semibold, fontSize: 11, color: colors.ink },
  bestBody: { padding: 12, gap: 6 },
  bestName: { fontFamily: fonts.ui.medium, fontSize: 13, color: colors.ink },
  bestPriceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  bestPrice: { fontFamily: fonts.ui.extrabold, fontSize: 22, color: colors.ink, fontVariant: ['tabular-nums'] },
  bestBiz: { flexShrink: 1, fontFamily: fonts.ui.medium, fontSize: 12, color: colors.muted },
  strip: { height: 18, justifyContent: 'center' },
  stripLine: { height: 3, borderRadius: 2, backgroundColor: colors.line },
  stripDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: colors.surface, borderWidth: 2, borderColor: '#B5A98F' },
  stripMe: { position: 'absolute', left: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.surface },
  stripLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  stripText: { fontFamily: fonts.ui.medium, fontSize: 11, color: colors.muted, fontVariant: ['tabular-nums'] },
  clock: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface },
  clockText: { fontFamily: fonts.ui.extrabold, fontSize: 13, color: colors.ink, fontVariant: ['tabular-nums'] },
  live: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  flash: { width: 156, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface },
  flashImg: { width: '100%', height: 120, backgroundColor: colors.sandSoft },
  flashTag: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 2, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, borderTopRightRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden', backgroundColor: colors.accent, fontFamily: fonts.ui.semibold, fontSize: 12, color: colors.ink },
  flashBody: { padding: 12, gap: 4 },
  flashPrice: { fontFamily: fonts.ui.extrabold, fontSize: 16, color: colors.ink, fontVariant: ['tabular-nums'] },
  flashWas: { fontFamily: fonts.ui.medium, fontSize: 11, color: colors.muted, textDecorationLine: 'line-through' },
  flashName: { fontFamily: fonts.ui.medium, fontSize: 12, color: colors.ink },
  flashBar: { height: 4, borderRadius: 2, backgroundColor: '#FBE1C4', overflow: 'hidden', marginTop: 4 },
  flashFill: { height: '100%', backgroundColor: colors.accent },
  flashLeft: { fontFamily: fonts.ui.semibold, fontSize: 11, color: colors.accentInk, fontVariant: ['tabular-nums'] },
});
