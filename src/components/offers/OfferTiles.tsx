import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { distanceLabel, priceView, tileA11y, timeBadge, type MarketItem } from '@/lib/offerMarket';
import { colors, fonts, radius, spacing } from '@/theme';
import { LiveDot } from './MarketMotion';

/** Foto del negocio o, sin foto, el color de su categoría con su icono (la tarjeta nunca queda en blanco). */
function Photo({ item, style, iconSize }: { item: MarketItem; style: object; iconSize: number }) {
  const cat = categoryColor(item.category_color);
  const uri = item.photo ? resolveImageUrl(item.photo) : null;
  return (
    <View style={[style, { backgroundColor: cat.fg }]}>
      {uri ? (
        <Image accessible={false} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} transition={180} />
      ) : (
        <Ionicons name={displayIcon(item.category_icon) as keyof typeof Ionicons.glyphMap} size={iconSize} color="rgba(255,255,255,0.92)" />
      )}
    </View>
  );
}

function Price({ item }: { item: MarketItem }) {
  const p = priceView(item);
  if (!p.now) return null;
  return (
    <View style={styles.priceRow}>
      <Text style={styles.price}>{p.now}</Text>
      {p.was ? <Text style={styles.was}>{p.was}</Text> : null}
      {p.save ? (
        <View style={styles.save}>
          <Text style={styles.saveText}>{p.save}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Tarjeta de las secciones de lado: foto, tiempo que queda, título, negocio, distancia, precio y, si aplica, por qué. */
export function OfferTile({ item, now, onPress, width = TILE_W }: { item: MarketItem; now: number; onPress: () => void; width?: number }) {
  const t = timeBadge(item.ends_at, now);
  const dist = distanceLabel(item.distance_meters);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tileA11y(item, now)} onPress={onPress} style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}>
      <Photo item={item} style={styles.tilePhoto} iconSize={34} />
      {item.trending ? (
        <View style={[styles.badge, styles.badgeLeft]}>
          <LiveDot />
          <Text style={styles.hotText}>En tendencia</Text>
        </View>
      ) : null}
      <View style={[styles.badge, styles.badgeRight, t.urgent ? styles.badgeUrgent : styles.badgeDark]}>
        <Text style={[styles.badgeText, t.urgent ? styles.urgentText : styles.darkText]}>{t.text}</Text>
      </View>
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
            <Text style={styles.reasonText} numberOfLines={1}>
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
      <Photo item={item} style={styles.rowPhoto} iconSize={26} />
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[item.entity_name, dist, t.urgent ? t.text.toLowerCase() : `termina en ${t.text}`].filter(Boolean).join(' · ')}
        </Text>
        <Price item={item} />
      </View>
    </Pressable>
  );
}

export const TILE_W = 216;
export const TILE_GAP = 10;

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.95 },
  tilePhoto: { height: 112, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: { position: 'absolute', top: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeLeft: { left: 8, backgroundColor: 'rgba(255,255,255,0.95)' },
  badgeRight: { right: 8 },
  badgeDark: { backgroundColor: colors.ink },
  badgeUrgent: { backgroundColor: colors.accent },
  badgeText: { fontSize: 11, fontFamily: fonts.ui.extrabold },
  darkText: { color: '#fff' },
  urgentText: { color: colors.ink },
  hotText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.danger },
  tileBody: { padding: spacing.sm + 2, paddingTop: spacing.sm, gap: 2 },
  title: { fontSize: 14, lineHeight: 18, fontFamily: fonts.display.bold, color: colors.ink, minHeight: 18 },
  meta: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  price: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  was: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted, textDecorationLine: 'line-through' },
  save: { backgroundColor: '#E5F5EC', borderRadius: 6, paddingHorizontal: 6 },
  saveText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#1B6B3C' },
  reason: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, maxWidth: '100%' },
  reasonText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm + 2, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  rowPhoto: { width: 76, height: 76, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
});
