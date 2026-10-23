import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { distanceLabel, featuredA11y, featuredClock, initialOf, priceView, tileA11y, tileClock, timeBadge, zoneSubtitle, type MarketItem, type MarketZone } from '@/lib/offerMarket';
import { alpha, colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';
import { LiveDot } from './MarketMotion';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Foto del negocio o, sin foto (3.40), el color de su categoría con su icono grande y tenue de fondo y la inicial del
 * negocio: dos negocios sin foto ya no se ven iguales, y la tarjeta nunca queda en blanco.
 */
function Photo({ item, style, size }: { item: MarketItem; style: object; size: 'sm' | 'md' | 'lg' }) {
  const cat = categoryColor(item.category_color);
  const uri = item.photo ? resolveImageUrl(item.photo) : null;
  const icon = displayIcon(item.category_icon) as IconName;
  const d = DIMS[size];
  return (
    <View style={[style, { backgroundColor: cat.fg }]}>
      {uri ? (
        <Image accessible={false} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} transition={180} />
      ) : (
        <>
          <View style={[styles.ghost, size === 'lg' ? styles.ghostLeft : null]} pointerEvents="none">
            <Ionicons name={icon} size={d.ghost} color={alpha(colors.white, 0.2)} />
          </View>
          <View style={[styles.initial, { width: d.circle, height: d.circle, borderRadius: d.circle / 2 }]}>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.initialText, { fontSize: d.letter, color: cat.fg }]}>{initialOf(item.entity_name)}</Text>
            {size !== 'sm' ? (
              <View style={[styles.initialBadge, { backgroundColor: cat.fg }]}>
                <Ionicons name={icon} size={11} color={colors.white} />
              </View>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}
const DIMS = { sm: { ghost: 54, circle: 36, letter: 16 }, md: { ghost: 88, circle: 46, letter: 20 }, lg: { ghost: 128, circle: 58, letter: 25 } };

function Price({ item, big }: { item: MarketItem; big?: boolean }) {
  const p = priceView(item);
  if (!p.now) return null;
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.price, big && styles.priceBig]}>{p.now}</Text>
      {p.was ? <Text style={styles.was}>{p.was}</Text> : null}
    </View>
  );
}

/** Ahorro sobre la foto (3.40): lo que hace que alguien toque la tarjeta, en grande. Solo si es real. */
function SaveTag({ item }: { item: MarketItem }) {
  const save = priceView(item).save;
  return save ? (
    <View style={styles.saveTag}>
      <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.saveTagText}>{save}</Text>
    </View>
  ) : null;
}

/** Etiqueta del tiempo: bajo una hora, reloj y minutos en naranja (se actualiza cada minuto, sin parpadear). */
function Clock({ endsAt, now }: { endsAt: string; now: number }) {
  const t = tileClock(endsAt, now);
  return (
    <View style={[styles.badge, styles.badgeRight, t.urgent ? styles.badgeUrgent : styles.badgeDark]}>
      {t.urgent ? <Ionicons name="time-outline" size={12} color={colors.ink} /> : null}
      <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.badgeText, t.urgent ? styles.urgentText : styles.darkText]}>{t.text}</Text>
    </View>
  );
}

/** Tarjeta de las secciones de lado: foto, tiempo que queda, título, negocio, distancia, precio y, si aplica, por qué. */
export function OfferTile({ item, now, onPress, width = TILE_W }: { item: MarketItem; now: number; onPress: () => void; width?: number }) {
  const dist = distanceLabel(item.distance_meters);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tileA11y(item, now)} onPress={onPress} style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}>
      <Photo item={item} style={styles.tilePhoto} size="md" />
      {item.trending ? (
        <View style={[styles.badge, styles.badgeLeft]}>
          <LiveDot />
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.hotText}>En tendencia</Text>
        </View>
      ) : null}
      <Clock endsAt={item.ends_at} now={now} />
      <SaveTag item={item} />
      <View style={styles.tileBody}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[item.entity_name, dist].filter(Boolean).join(' · ')}
        </Text>
        <Price item={item} />
        {item.reason ? (
          <View style={styles.reason}>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.reasonText} numberOfLines={1}>
              {item.reason}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Fila de «Todas»: lo mismo, horizontal y compacto. */
export function OfferRow({ item, now, onPress }: { item: MarketItem; now: number; onPress: () => void }) {
  const t = timeBadge(item.ends_at, now);
  const dist = distanceLabel(item.distance_meters);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tileA11y(item, now)} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Photo item={item} style={styles.rowPhoto} size="sm" />
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[item.entity_name, dist, t.urgent ? t.text.toLowerCase() : `termina en ${t.text}`].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.rowPrice}>
          <Price item={item} />
          {priceView(item).save ? (
            <View style={styles.save}>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.saveText}>{priceView(item).save}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * «Mayor ahorro de hoy» (3.40): la destacada de la vitrina, por una regla que se lee en la etiqueta (nunca pagada).
 * Foto grande, el ahorro en un círculo verde y el reloj.
 */
export function FeaturedOffer({ item, now, onPress }: { item: MarketItem; now: number; onPress: () => void }) {
  const save = priceView(item).save;
  const clock = featuredClock(item.ends_at, now);
  const dist = distanceLabel(item.distance_meters);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={featuredA11y(item, now)} onPress={onPress} style={({ pressed }) => [styles.feat, pressed && styles.pressed]}>
      <Photo item={item} style={styles.featPhoto} size="lg" />
      <View style={[styles.badge, styles.badgeLeft]}>
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.ruleText}>Mayor ahorro de hoy</Text>
      </View>
      {save ? (
        <View style={styles.bigSave}>
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.bigSaveText}>{save.replace(' ', '')}</Text>
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.bigSaveSub}>AHORRO</Text>
        </View>
      ) : null}
      <View style={styles.featBody}>
        <Text style={styles.featTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[item.entity_name, dist].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.featFoot}>
          <Price item={item} big />
          <View style={[styles.clock, clock.urgent && styles.clockUrgent]}>
            <Ionicons name="time-outline" size={13} color={clock.urgent ? colors.ink : ACCENT_INK} />
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.clockText, clock.urgent && styles.urgentText]}>{clock.text}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Una categoría de la fila con iconos (3.40): icono en su color, nombre corto debajo, 44 pt o más para tocar. */
export function CategoryTile({ name, short, icon, color, active, onPress }: { name: string; short: string; icon?: string; color?: string; active: boolean; onPress: () => void }) {
  const c = categoryColor(color);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.cat, pressed && styles.catPressed]}>
      <View style={[styles.catIcon, { backgroundColor: c.bg }, active && { borderColor: colors.ink }]}>
        <Ionicons name={displayIcon(icon) as IconName} size={22} color={c.fg} />
      </View>
      <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.catText, active && styles.catTextOn]} numberOfLines={1}>
        {short}
      </Text>
    </Pressable>
  );
}

/** Tarjeta de «Por zona» (3.39): mosaico de hasta 3 categorías, nombre y qué tan lejos queda. Lleva a la lista de esa
 * zona. Sin conteos. */
export function ZoneCard({ zone, onPress }: { zone: MarketZone; onPress: () => void }) {
  const looks = zone.looks.length ? zone.looks : [{}];
  const tiles = [0, 1, 2].map((i) => looks[i % looks.length]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver ofertas de ${zone.name}, ${zoneSubtitle(zone).toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [styles.zone, pressed && styles.pressed]}
    >
      <View style={styles.mosaic}>
        {tiles.map((l, i) => (
          <View key={i} style={[styles.mosaicCell, { backgroundColor: categoryColor(l.color).fg }]}>
            <Ionicons name={displayIcon(l.icon) as IconName} size={18} color={alpha(colors.white, 0.92)} />
          </View>
        ))}
      </View>
      <View style={styles.zoneBody}>
        <Text style={styles.title} numberOfLines={1}>
          {zone.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {zoneSubtitle(zone)}
        </Text>
        {zone.here ? (
          <View style={styles.here}>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.hereText}>Tu zona</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const ZONE_W = 168;
// Verde del ahorro y tonos del reloj (los mismos del mockup vitrina_viva.html).
const SAVE_GREEN = colors.successBadge;
const ACCENT_SOFT = colors.accentSoft;
const ACCENT_INK = colors.accentInk;
export const TILE_W = 216;
export const TILE_GAP = 10;

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.95 },
  tilePhoto: { height: 112, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: { position: 'absolute', top: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeLeft: { left: 8, backgroundColor: alpha(colors.white, 0.95) },
  badgeRight: { right: 8 },
  badgeDark: { backgroundColor: colors.ink },
  badgeUrgent: { backgroundColor: colors.accent },
  badgeText: { fontSize: 11, fontFamily: fonts.ui.extrabold },
  darkText: { color: colors.white },
  urgentText: { color: colors.ink },
  hotText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.danger },
  tileBody: { padding: spacing.sm + 2, paddingTop: spacing.sm, gap: 2 },
  title: { fontSize: 14, lineHeight: 18, fontFamily: fonts.display.bold, color: colors.ink, minHeight: 18 },
  meta: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  price: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  was: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted, textDecorationLine: 'line-through' },
  save: { backgroundColor: colors.successSoft, borderRadius: 6, paddingHorizontal: 6 },
  saveText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  reason: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, maxWidth: '100%' },
  reasonText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm + 2, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  rowPhoto: { width: 76, height: 76, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
  zone: { width: 168, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  mosaic: { flexDirection: 'row', height: 64 },
  mosaicCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoneBody: { padding: spacing.sm + 2, paddingTop: spacing.sm, gap: 2 },
  here: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 6 },
  hereText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  // 3.40
  ghost: { position: 'absolute', right: -14, bottom: -22, transform: [{ rotate: '-12deg' }] },
  ghostLeft: { right: undefined, left: -18, bottom: -34 },
  initial: { backgroundColor: alpha(colors.white, 0.96), alignItems: 'center', justifyContent: 'center' },
  initialText: { fontFamily: fonts.display.bold },
  initialBadge: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  saveTag: { position: 'absolute', left: 8, top: 80, height: 24, justifyContent: 'center', backgroundColor: SAVE_GREEN, borderRadius: 8, paddingHorizontal: 8 },
  saveTagText: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.white },
  rowPrice: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  priceBig: { fontSize: 22 },
  feat: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  featPhoto: { height: 150, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ruleText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bigSave: { position: 'absolute', right: 12, top: 98, width: 74, height: 74, borderRadius: 37, backgroundColor: SAVE_GREEN, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  bigSaveText: { fontSize: 19, lineHeight: 22, fontFamily: fonts.display.bold, color: colors.white },
  bigSaveSub: { fontSize: 8.5, fontFamily: fonts.ui.extrabold, color: colors.white, letterSpacing: 0.4 },
  featBody: { padding: spacing.md, paddingTop: spacing.sm + 2, gap: 2 },
  featTitle: { fontSize: 18, lineHeight: 22, fontFamily: fonts.display.bold, color: colors.ink, paddingRight: 76 },
  featFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: 4 },
  clock: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: ACCENT_SOFT },
  clockUrgent: { backgroundColor: colors.accent },
  clockText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: ACCENT_INK },
  cat: { width: 64, alignItems: 'center', gap: 5, minHeight: 44 },
  catPressed: { transform: [{ scale: 0.95 }] },
  catIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'transparent' },
  catText: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.ink },
  catTextOn: { fontFamily: fonts.ui.extrabold },
});
