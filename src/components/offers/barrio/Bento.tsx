import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { RollingNumber } from '@/components/finance/RollingNumber';
import { categoryColor } from '@/lib/categoryColor';
import { groupOfName, type GroupId } from '@/lib/categoryGroups';
import { displayIcon } from '@/lib/mapView';
import { blocksLabel, savingPesos, spotlightLabel, type MarketSlide } from '@/lib/offerBarrio';
import { pesos, type MarketItem } from '@/lib/offerMarket';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { useScreenReader } from '@/lib/useScreenReader';
import { alpha, colors, DENSE_TEXT_SCALE, fonts, spacing } from '@/theme';
import { CategoryWash } from './Wash';

type IconName = keyof typeof Ionicons.glyphMap;

// «Hoy en tu barrio» (3.48): una pieza grande y cuatro pequeñas, cada una de un tipo de negocio distinto (lo decide
// el servidor). La grande es la pasarela: tres reglas a la vista que avanzan cada 5 s, se pausan al tocarlas, se
// detienen al deslizar o tocar un punto y se quedan quietas después de una vuelta. Es lo único que se mueve solo en
// la pantalla. Con «Reducir movimiento» o el lector de pantalla no avanza. Las pequeñas entran escalonadas una vez.

const SLIDE_MS = 5000;
const TILE_H = 112;
const GAP = 8;
const EMPHASIZED = Easing.bezier(0.22, 1, 0.36, 1);

const GROUP_LABEL: Record<GroupId, string> = { comer: 'Comer y beber', salud: 'Belleza y salud', compras: 'Compras', servicios: 'Servicios', planes: 'Planes' };

function Slide({ s, width, zone, onPress }: { s: MarketSlide; width: number; zone: string; onPress: () => void }) {
  const o = s.item;
  const rule = spotlightLabel(s.rule, zone);
  const save = savingPesos(o);
  const cat = categoryColor(o.category_color).fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${rule.text}: ${o.title}, ${o.entity_name}${save ? `, ahorras ${pesos(save)}` : ''}`}
      onPress={onPress}
      style={[styles.slide, { width }]}
    >
      <CategoryWash color={cat} />
      <Ionicons name={displayIcon(o.category_icon) as IconName} size={150} color={alpha(colors.white, 0.16)} style={styles.bigGhost} />
      <View style={styles.rule}>
        <Ionicons name={rule.icon} size={13} color={colors.white} />
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.ruleText} numberOfLines={2}>
          {rule.text}
        </Text>
      </View>
      <View style={styles.bottom}>
        {save ? (
          <>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.kick}>
              AHORRAS
            </Text>
            <RollingNumber value={save} style={styles.bigSave} />
          </>
        ) : null}
        <Text style={styles.bigTitle} numberOfLines={2}>
          {o.title}
        </Text>
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.by} numberOfLines={1}>
          {[o.attendant_name, o.entity_name, blocksLabel(o.distance_meters)].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

function Spotlight({ slides, zone, onOpen }: { slides: MarketSlide[]; zone: string; onOpen: (o: MarketItem) => void }) {
  const reduce = useReduceMotion();
  const reader = useScreenReader();
  const [width, setWidth] = useState(0);
  const [cur, setCur] = useState(0);
  const [auto, setAuto] = useState(true);
  const [fill] = useState(() => new Animated.Value(0));
  const list = useRef<FlatList<MarketSlide>>(null);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const moving = auto && !reduce && !reader && slides.length > 1;

  const go = useCallback(
    (k: number) => {
      setCur(k);
      list.current?.scrollToOffset({ offset: k * width, animated: !reduce });
    },
    [width, reduce],
  );
  // Una sola vuelta: la raya del punto actual se llena en 5 s y pasa a la siguiente; tras la última, se queda quieta.
  const run = useCallback(
    (from: number) => {
      anim.current?.stop();
      if (!moving || !width) return;
      fill.setValue(from);
      anim.current = Animated.timing(fill, { toValue: 1, duration: SLIDE_MS * (1 - from), easing: Easing.linear, useNativeDriver: true });
      anim.current.start(({ finished }) => {
        if (!finished) return;
        if (cur < slides.length - 1) go(cur + 1);
        else setAuto(false);
      });
    },
    [moving, width, fill, cur, slides.length, go],
  );
  useEffect(() => {
    run(0);
    return () => anim.current?.stop();
  }, [run]);
  const stop = () => {
    anim.current?.stop();
    setAuto(false);
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const k = Math.round(e.nativeEvent.contentOffset.x / width);
    if (k !== cur) {
      setCur(k);
      stop(); // deslizó la persona: ya no avanza sola
    }
  };

  return (
    <View
      style={styles.big}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onTouchStart={() => anim.current?.stop()}
      onTouchEnd={() => moving && fill.stopAnimation((v) => run(v))}
      accessibilityRole="adjustable"
      accessibilityLabel={`Lo mejor de hoy, ${cur + 1} de ${slides.length}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        stop();
        if (e.nativeEvent.actionName === 'increment') go(Math.min(slides.length - 1, cur + 1));
        else go(Math.max(0, cur - 1));
      }}
    >
      {width ? (
        <FlatList
          ref={list}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => s.item.id}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item }) => <Slide s={item} width={width} zone={zone} onPress={() => onOpen(item.item)} />}
        />
      ) : null}
      {slides.length > 1 ? (
        <View style={styles.dots} pointerEvents="box-none">
          {slides.map((s, k) => (
            <Pressable
              key={s.item.id}
              accessibilityRole="button"
              accessibilityLabel={`Ir a ${spotlightLabel(s.rule, zone).text}`}
              hitSlop={{ top: 16, bottom: 16, left: 4, right: 4 }}
              onPress={() => {
                stop();
                go(k);
              }}
              style={styles.dot}
            >
              {k < cur || (k === cur && !moving) ? <View style={[StyleSheet.absoluteFill, styles.dotFill]} /> : null}
              {k === cur && moving ? <Animated.View style={[StyleSheet.absoluteFill, styles.dotFill, styles.dotOrigin, { transform: [{ scaleX: fill }] }]} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {moving ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Pausar el carrusel" onPress={stop} style={styles.pause}>
          <Ionicons name="pause" size={15} color={alpha(colors.white, 0.9)} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Tile({ o, index, onPress }: { o: MarketItem; index: number; onPress: () => void }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) return;
    const a = Animated.timing(v, { toValue: 1, duration: 420, delay: 120 + index * 60, easing: EMPHASIZED, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [reduce, v, index]);
  const save = savingPesos(o);
  const cat = categoryColor(o.category_color).fg;
  const kind = GROUP_LABEL[groupOfName(o.category_name)];
  return (
    <Animated.View style={[styles.tileWrap, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${kind}: ${o.title}, ${o.entity_name}${save ? `, ahorras ${pesos(save)}` : ''}`}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      >
        <CategoryWash color={cat} />
        <Ionicons name={displayIcon(o.category_icon) as IconName} size={88} color={alpha(colors.white, 0.16)} style={styles.ghost} />
        <View style={styles.kind}>
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.kindText} numberOfLines={1}>
            {kind}
          </Text>
        </View>
        {save ? <RollingNumber value={save} prefix="−" style={styles.save} /> : null}
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.title} numberOfLines={1}>
          {o.title}
        </Text>
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.by} numberOfLines={1}>
          {o.entity_name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** El mosaico: la pasarela a la izquierda (dos filas) y hasta cuatro piezas de tipos distintos. */
export function Bento({ slides, tiles, zone, onOpen }: { slides: MarketSlide[]; tiles: MarketItem[]; zone: string; onOpen: (o: MarketItem) => void }) {
  if (!slides.length && !tiles.length) return null;
  // Sin pasarela, la primera pieza ocupa el lugar grande.
  const big: MarketSlide[] = slides.length ? slides : [{ rule: 'save_today', item: tiles[0] }];
  const small = slides.length ? tiles : tiles.slice(1);
  return (
    <View style={styles.grid}>
      <View style={styles.top}>
        <Spotlight slides={big} zone={zone} onOpen={onOpen} />
        <View style={styles.col}>
          {small.slice(0, 2).map((o, i) => (
            <Tile key={o.id} o={o} index={i} onPress={() => onOpen(o)} />
          ))}
        </View>
      </View>
      {small.length > 2 ? (
        <View style={styles.rowBottom}>
          {small.slice(2, 4).map((o, i) => (
            <Tile key={o.id} o={o} index={i + 2} onPress={() => onOpen(o)} />
          ))}
          {small.length === 3 ? <View style={styles.tileWrap} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.97 }] },
  grid: { paddingHorizontal: spacing.lg, gap: GAP },
  top: { flexDirection: 'row', gap: GAP },
  col: { flex: 1, gap: GAP },
  rowBottom: { flexDirection: 'row', gap: GAP },
  big: { flex: 1, height: TILE_H * 2 + GAP, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.primaryDark },
  slide: { height: TILE_H * 2 + GAP, padding: spacing.md, paddingBottom: 30, justifyContent: 'space-between', overflow: 'hidden' },
  bigGhost: { position: 'absolute', right: -34, top: 22 },
  rule: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: alpha(colors.white, 0.22) },
  ruleText: { flexShrink: 1, fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: colors.white },
  bottom: { gap: 1 },
  kick: { fontSize: 9, letterSpacing: 0.6, fontFamily: fonts.ui.extrabold, color: alpha(colors.white, 0.9) },
  bigSave: { fontSize: 30, fontFamily: fonts.display.bold, color: colors.white },
  bigTitle: { fontSize: 15.5, lineHeight: 19, fontFamily: fonts.display.bold, color: colors.white },
  by: { fontSize: 11, fontFamily: fonts.ui.bold, color: alpha(colors.white, 0.88) },
  dots: { position: 'absolute', left: spacing.md, bottom: 13, flexDirection: 'row', gap: 5 },
  dot: { width: 18, height: 5, borderRadius: 3, backgroundColor: alpha(colors.white, 0.32), overflow: 'hidden' },
  dotFill: { backgroundColor: colors.white },
  dotOrigin: { transformOrigin: 'left' },
  pause: { position: 'absolute', right: 0, bottom: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tileWrap: { flex: 1, height: TILE_H },
  tile: { flex: 1, borderRadius: 22, overflow: 'hidden', padding: spacing.sm + 2, justifyContent: 'flex-end' },
  ghost: { position: 'absolute', right: -18, top: -14 },
  kind: { position: 'absolute', left: spacing.sm, top: spacing.sm, maxWidth: '90%', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: alpha(colors.white, 0.22) },
  kindText: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: colors.white },
  save: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.white },
  title: { fontSize: 13, lineHeight: 16, fontFamily: fonts.display.bold, color: colors.white },
});
