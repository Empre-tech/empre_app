import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Cover } from '@/components/Cover';
import { displayIcon } from '@/lib/mapView';
import { distanceLabel, featuredClock, priceView, type MarketItem } from '@/lib/offerMarket';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

const EVERY = 5000;

/**
 * La vitrina de Ofertas: las que terminan primero, una por vez. Pasa sola cada 5 segundos, se puede deslizar y pausar;
 * tocarla la abre. Con «Reducir movimiento» no pasa sola.
 */
export function Showcase({ items, now, onOpen }: { items: MarketItem[]; now: number; onOpen: (o: MarketItem) => void }) {
  const reduce = useReduceMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hold] = useState({ on: false });
  const many = items.length > 1;
  const stopped = paused || reduce;
  const at = items.length ? ((index % items.length) + items.length) % items.length : 0;
  const [fades] = useState(() => new Map<string, Animated.Value>());
  const fadeOf = (id: string) => {
    if (!fades.has(id)) fades.set(id, new Animated.Value(0));
    return fades.get(id)!;
  };
  const cur = items[at];

  useEffect(() => {
    if (!many || stopped) return;
    const t = setInterval(() => {
      if (!hold.on) setIndex((i) => i + 1);
    }, EVERY);
    return () => clearInterval(t);
  }, [many, stopped, hold]);

  useEffect(() => {
    items.forEach((o) => {
      const on = cur?.id === o.id;
      if (reduce) fadeOf(o.id).setValue(on ? 1 : 0);
      else Animated.timing(fadeOf(o.id), { toValue: on ? 1 : 0, duration: 500, useNativeDriver: true }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, items, reduce]);

  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        hold.on = true;
      },
      onPanResponderRelease: (_, g) => {
        hold.on = false;
        if (Math.abs(g.dx) > 30) setIndex((i) => i + (g.dx < 0 ? 1 : -1));
      },
      onPanResponderTerminate: () => {
        hold.on = false;
      },
    }),
  );

  if (!cur) return null;
  const parts = priceView(cur);
  const clock = featuredClock(cur.ends_at, now);

  return (
    <View style={styles.card} accessibilityLabel="Ofertas que terminan primero">
      <View style={styles.stage} {...(many ? pan.panHandlers : {})}>
        {items.map((o) => {
          const on = o.id === cur.id;
          const dist = distanceLabel(o.distance_meters);
          const save = priceView(o).save;
          return (
            <Animated.View key={o.id} pointerEvents={on ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { opacity: fadeOf(o.id) }]}>
              <Pressable accessibilityRole="button" accessibilityElementsHidden={!on} importantForAccessibility={on ? 'yes' : 'no-hide-descendants'} accessibilityLabel={`${o.title}, ${o.entity_name}. Ver la oferta`} onPress={() => onOpen(o)} style={StyleSheet.absoluteFill}>
                <Cover photo={o.photo} category={o.category_name} icon={o.category_icon} iconName={displayIcon(o.category_icon) as keyof typeof Ionicons.glyphMap} iconSize={92} paused={!on} style={StyleSheet.absoluteFill}>
                  {save ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{save}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.text, many && styles.textDots]}>
                    <Text style={styles.biz} numberOfLines={1}>
                      {o.entity_name}
                      {dist ? ` · a ${dist}` : ''}
                    </Text>
                    <Text style={styles.title} numberOfLines={2}>
                      {o.title}
                    </Text>
                  </View>
                </Cover>
              </Pressable>
            </Animated.View>
          );
        })}
        {many ? (
          <>
            <View style={styles.dots} pointerEvents="none">
              {items.map((o, i) => (
                <View key={o.id} style={[styles.dot, i === at && styles.dotOn]} />
              ))}
            </View>
            {reduce ? null : (
              <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Seguir pasando las ofertas' : 'Pausar las ofertas'} onPress={() => setPaused((v) => !v)} style={styles.pause}>
                <View style={styles.pauseIn}>
                  <Ionicons name={paused ? 'play' : 'pause'} size={14} color={colors.ink} />
                </View>
              </Pressable>
            )}
          </>
        ) : null}
      </View>
      <View style={styles.foot}>
        <View style={styles.footText} accessibilityLiveRegion={stopped ? 'polite' : 'none'}>
          <View style={styles.priceRow}>
            {parts.now ? <Text style={styles.price}>{parts.now}</Text> : null}
            {parts.was ? <Text style={styles.was}>{parts.was}</Text> : null}
          </View>
          <View style={styles.clock}>
            <Ionicons name="time-outline" size={13} color={colors.accentInk} />
            <Text style={styles.clockText} numberOfLines={1}>
              {clock.text}
            </Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => onOpen(cur)} style={styles.btn}>
          <Text style={styles.btnText}>Ver oferta</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  stage: { height: 168, backgroundColor: colors.ink },
  badge: { position: 'absolute', left: 10, top: 10, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.accent },
  badgeText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  text: { position: 'absolute', left: 16, right: 56, bottom: 16, gap: 4 },
  textDots: { bottom: 28 },
  biz: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#fff' },
  title: { fontSize: 22, lineHeight: 25, fontFamily: fonts.display.bold, color: '#fff' },
  dots: { position: 'absolute', left: 16, bottom: 12, flexDirection: 'row', gap: 6 },
  dot: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { backgroundColor: '#fff' },
  pause: { position: 'absolute', right: 6, top: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pauseIn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)' },
  foot: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 },
  footText: { flex: 1, minWidth: 0, gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  price: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  was: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.faint, textDecorationLine: 'line-through' },
  clock: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clockText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  btn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary },
  btnText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
