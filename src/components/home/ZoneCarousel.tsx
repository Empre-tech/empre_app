import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { DiscoveryItem } from '@/api/types';
import { artKeyFor } from '@/components/CategoryArt';
import { BusinessArt } from '@/components/CategoryIllustration';
import { resolveImageUrl } from '@/lib/image';
import { useReduceMotion } from '@/lib/useReduceMotion';
import type { ZoneSlide } from '@/lib/zoneShowcase';
import { colors, fonts } from '@/theme';

const HERO_H = 220;
/** Cuánto se queda cada zona antes de pasar a la siguiente. */
const STAY_MS = 4500;

const photoOf = (b: DiscoveryItem) => resolveImageUrl(b.photos?.[0]) ?? resolveImageUrl(b.profile_url);

/**
 * Las zonas pasan solas, como historias (tablero «Inicio», 2026-11-16): barras arriba, cambia cada 4,5 s, se desliza
 * con el dedo y tocarla pasa a la siguiente. Cada zona dice qué se mueve hoy en ella. Debajo, tres negocios de la zona
 * que se ve, que cambian con ella: la ciudad variada, no una sola lista. Con «Reducir movimiento» las zonas no pasan
 * solas y los cambios son inmediatos. Fuera de la pantalla, se detiene.
 */
export function ZoneCarousel({
  slides,
  city,
  nameOf,
  lineOf,
  onBusiness,
}: {
  slides: ZoneSlide<DiscoveryItem>[];
  /** La ciudad de las zonas, de los datos («Santa Marta»); sin ella, «Zonas cerca de ti». */
  city: string | null;
  /** El nombre que se muestra (sin el barrio del final). */
  nameOf: (b: DiscoveryItem) => string;
  /** La línea de cada ejemplo: tipo y a cuánto queda. */
  lineOf: (b: DiscoveryItem) => string;
  onBusiness: (id: string) => void;
}) {
  const reduce = useReduceMotion();
  const ref = useRef<ScrollView>(null);
  const [w, setW] = useState(0);
  const [i, setI] = useState(0);
  const [focused, setFocused] = useState(true);
  const [fill] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  const n = slides.length;
  const idx = n ? i % n : 0;
  const slide = slides[idx];

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const go = useCallback(
    (next: number) => {
      if (!n) return;
      const k = ((next % n) + n) % n;
      ref.current?.scrollTo({ x: k * w, animated: !reduce });
      setI(k);
    },
    [n, w, reduce],
  );

  // Pasa sola: la barra de la zona se llena y al terminar viene la siguiente.
  useEffect(() => {
    fill.setValue(0);
    if (reduce || !focused || n < 2 || !w) {
      fill.setValue(n < 2 || reduce ? 1 : 0);
      return;
    }
    const a = Animated.timing(fill, { toValue: 1, duration: STAY_MS, easing: Easing.linear, useNativeDriver: true });
    a.start(({ finished }) => {
      if (finished) go(idx + 1);
    });
    return () => a.stop();
  }, [idx, reduce, focused, n, w, fill, go]);

  // Los negocios de abajo entran suaves cuando cambia la zona.
  useEffect(() => {
    if (reduce) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    const a = Animated.timing(fade, { toValue: 1, duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [idx, reduce, fade]);

  if (!slide) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.hero} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => (w ? setI(Math.round(e.nativeEvent.contentOffset.x / w)) : undefined)}
        >
          {slides.map((s) => {
            const photo = photoOf(s.hero);
            return (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                accessibilityLabel={[s.name, s.line, `${s.count} negocios`, n > 1 ? 'Toca para ver otra zona' : null].filter(Boolean).join('. ')}
                onPress={() => go(idx + 1)}
                style={{ width: w, height: HERO_H }}
              >
                {photo ? (
                  <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.noPhoto]}>
                    <BusinessArt k={artKeyFor(s.hero.category_name, s.hero.category_icon)} size={140} />
                  </View>
                )}
                <Svg width="100%" height={HERO_H} style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Defs>
                    <LinearGradient id={`velo-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#2B2622" stopOpacity={0.28} />
                      <Stop offset="0.3" stopColor="#2B2622" stopOpacity={0} />
                      <Stop offset="0.45" stopColor="#2B2622" stopOpacity={0} />
                      <Stop offset="1" stopColor="#2B2622" stopOpacity={0.78} />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height={HERO_H} fill={`url(#velo-${s.key})`} />
                </Svg>
                <View style={styles.heroText} pointerEvents="none">
                  <Text style={styles.over}>{city ? `Zonas de ${city}` : 'Zonas cerca de ti'}</Text>
                  <Text style={styles.zoneName} numberOfLines={1}>
                    {s.name}
                  </Text>
                  {s.line ? (
                    <Text style={styles.zoneLine} numberOfLines={1}>
                      {s.line}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        {n > 1 ? (
          <View style={styles.bars} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {slides.map((s, k) => (
              <View key={s.key} style={styles.bar}>
                <Animated.View style={[styles.barFill, { transform: [{ scaleX: k < idx ? 1 : k === idx ? fill : 0 }] }]} />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Debajo, negocios de la zona que se ve: cambian con ella */}
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{`En ${slide.name}`}</Text>
        <Text style={styles.count}>{`${slide.count} ${slide.count === 1 ? 'negocio' : 'negocios'}`}</Text>
      </View>
      <Animated.View style={[styles.row, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        {slide.examples.map((b) => {
          const photo = photoOf(b);
          const name = nameOf(b);
          const line = lineOf(b);
          return (
            <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${name}. ${line}`} onPress={() => onBusiness(b.id)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <View style={styles.itemImg}>
                {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : <BusinessArt k={artKeyFor(b.category_name, b.category_icon)} size={104} round={false} />}
              </View>
              <Text style={styles.itemName} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.itemLine} numberOfLines={1}>
                {line}
              </Text>
            </Pressable>
          );
        })}
        {/* Si la zona trae menos de tres, el espacio queda vacío y las tarjetas no se estiran */}
        {Array.from({ length: Math.max(0, 3 - slide.examples.length) }, (_, k) => (
          <View key={`hueco-${k}`} style={styles.item} />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hero: { height: HERO_H, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.sandSoft },
  noPhoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sandSoft },
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 14, gap: 2 },
  over: { fontSize: 12, fontFamily: fonts.ui.semibold, color: 'rgba(255,255,255,0.85)' },
  zoneName: { fontSize: 24, fontFamily: fonts.display.bold, color: '#FFFFFF' },
  zoneLine: { fontSize: 13, fontFamily: fonts.ui.medium, color: 'rgba(255,255,255,0.9)' },
  bars: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.45)' },
  barFill: { height: '100%', backgroundColor: '#FFFFFF', transformOrigin: 'left' },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 2 },
  title: { flex: 1, fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  count: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  row: { flexDirection: 'row', gap: 10 },
  item: { flex: 1, minWidth: 0, gap: 3 },
  itemImg: { height: 104, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.sandSoft },
  itemName: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink, marginTop: 4 },
  itemLine: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
