import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { photoTone } from '@/lib/photoTone';
import { distanceLabel, featuredA11y, featuredClock, priceView, tileA11y, timeBadge, zoneSubtitle, type MarketItem, type MarketZone } from '@/lib/offerMarket';
import { colors, fonts, radius, spacing } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Foto del negocio o, sin foto, un tono de tinta del lienzo con su icono en blanco. */
function Photo({ item, style, size }: { item: MarketItem; style: object; size: 'sm' | 'md' | 'lg' }) {
  const uri = item.photo ? resolveImageUrl(item.photo) : null;
  return (
    <View style={[style, { backgroundColor: photoTone(item.entity_id) }]}>
      {uri ? (
        <Image accessible={false} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} transition={180} />
      ) : (
        <Ionicons name={displayIcon(item.category_icon) as IconName} size={DIMS[size]} color="#fff" />
      )}
    </View>
  );
}
const DIMS = { sm: 26, md: 34, lg: 44 };

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

/**
 * La tarjeta del lienzo: foto con su ahorro, negocio y distancia, título, precio y cuánto le queda. La elegida en el
 * mapa lleva el aro de tinta.
 */
export function OfferTile({ item, now, onPress, width = TILE_W, selected }: { item: MarketItem; now: number; onPress: () => void; width?: number; selected?: boolean }) {
  const dist = distanceLabel(item.distance_meters);
  const save = priceView(item).save;
  const clock = featuredClock(item.ends_at, now);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tileA11y(item, now)} accessibilityState={{ selected: Boolean(selected) }} onPress={onPress} style={({ pressed }) => [styles.tile, { width }, selected && styles.tileOn, pressed && styles.pressed]}>
      <View style={styles.tileClip}>
        <Photo item={item} style={styles.tilePhoto} size="md" />
        {save ? (
          <View style={styles.saveTag}>
            <Text style={styles.saveTagText}>{save}</Text>
          </View>
        ) : null}
        <View style={styles.tileBody}>
          <Text style={styles.tileBiz} numberOfLines={1}>
            {item.entity_name}
            {dist ? (
              <>
                {' · '}
                <Text style={styles.tileDist}>a {dist}</Text>
              </>
            ) : null}
          </Text>
          <Text style={styles.tileTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Price item={item} />
          <View style={styles.tileClock}>
            <Ionicons name="time-outline" size={14} color={clock.urgent ? colors.warning : colors.muted} />
            <Text style={[styles.tileClockText, clock.urgent && { color: colors.warning }]} numberOfLines={1}>
              {clock.text}
            </Text>
          </View>
          {item.reason ? (
            <Text style={styles.reasonText} numberOfLines={1}>
              {item.reason}
            </Text>
          ) : null}
        </View>
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
              <Text style={styles.saveText}>{priceView(item).save}</Text>
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
        <Text style={styles.ruleText}>Mayor ahorro de hoy</Text>
      </View>
      {save ? (
        <View style={styles.bigSave}>
          <Text style={styles.bigSaveText}>{save.replace(' ', '')}</Text>
          <Text style={styles.bigSaveSub}>AHORRO</Text>
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
            <Text style={[styles.clockText, clock.urgent && styles.urgentText]}>{clock.text}</Text>
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
      <Text style={[styles.catText, active && styles.catTextOn]} numberOfLines={1}>
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
            <Ionicons name={displayIcon(l.icon) as IconName} size={18} color="rgba(255,255,255,0.92)" />
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
            <Text style={styles.hereText}>Tu zona</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const ZONE_W = 168;
// Verde del ahorro y tonos del reloj (los mismos del mockup vitrina_viva.html).
const SAVE_GREEN = '#2E7D4F';
const ACCENT_SOFT = '#FFF1E3';
const ACCENT_INK = '#8F4300';
export const TILE_W = 212;
export const TILE_GAP = 12;

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.surface, borderRadius: 20, shadowColor: colors.ink, shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tileOn: { borderWidth: 2.5, borderColor: colors.ink, margin: -2.5 },
  tileClip: { borderRadius: 20, overflow: 'hidden' },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.95 },
  tilePhoto: { height: 116, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: { position: 'absolute', top: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeLeft: { left: 8, backgroundColor: 'rgba(255,255,255,0.95)' },
  urgentText: { color: colors.ink },
  tileBody: { paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, gap: 5 },
  tileBiz: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  tileDist: { color: colors.verified },
  tileTitle: { fontSize: 16.5, lineHeight: 20, minHeight: 40, fontFamily: fonts.display.bold, color: colors.ink },
  tileClock: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tileClockText: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  title: { fontSize: 14, lineHeight: 18, fontFamily: fonts.display.bold, color: colors.ink, minHeight: 18 },
  meta: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  price: { fontSize: 17, fontFamily: fonts.ui.extrabold, color: colors.ink },
  was: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.faint, textDecorationLine: 'line-through' },
  save: { backgroundColor: '#E3F5F3', borderRadius: 6, paddingHorizontal: 6 },
  saveText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#1B6B3C' },
  reasonText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm + 2, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  rowPhoto: { width: 76, height: 76, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
  zone: { width: 168, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  mosaic: { flexDirection: 'row', height: 64 },
  mosaicCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  zoneBody: { padding: spacing.sm + 2, paddingTop: spacing.sm, gap: 2 },
  here: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 6 },
  hereText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  saveTag: { position: 'absolute', left: 10, top: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accent },
  saveTagText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowPrice: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  priceBig: { fontSize: 22 },
  feat: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  featPhoto: { height: 150, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ruleText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bigSave: { position: 'absolute', right: 12, top: 98, width: 74, height: 74, borderRadius: 37, backgroundColor: SAVE_GREEN, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  bigSaveText: { fontSize: 19, lineHeight: 22, fontFamily: fonts.display.bold, color: '#fff' },
  bigSaveSub: { fontSize: 8.5, fontFamily: fonts.ui.extrabold, color: '#fff', letterSpacing: 0.4 },
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
