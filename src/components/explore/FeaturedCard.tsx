import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DiscoveryItem } from '@/api/types';
import { formatDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

export type WithDistance = DiscoveryItem & { distanceKm: number | null };

/** Una tarjeta del carrusel de Destacados: superficie blanca elevada, pastilla de estado con punto vivo, distancia y rating. */
export function FeaturedCard({ entity, onPress }: { entity: WithDistance; onPress: () => void }) {
  const src = resolveImageUrl(entity.profile_url);
  const distance = formatFeaturedDistance(entity.distanceKm);
  const hasRating = entity.review_count > 0;
  const hasPhoto = !!src;
  const statusLabel = entity.has_hours ? (entity.is_open_now ? 'Abierto' : 'Cerrado') : null;

  // Sin foto: tarjeta compacta con ícono de categoría en vez de una miniatura vacía.
  if (!hasPhoto) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ver perfil de ${entity.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.itemCompact, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.compactIconWrap}>
          <Ionicons
            name={(entity.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap}
            size={22}
            color={colors.ink}
          />
        </View>
        <View style={styles.compactInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          <Text style={styles.distance} numberOfLines={1}>
            {distance ?? entity.category_name}
          </Text>
          {hasRating ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={12} color={colors.accent} />
              <Text style={styles.ratingText}>{entity.avg_rating.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil de ${entity.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
    >
      <View>
        <Image accessible={false} source={{ uri: src }} style={styles.image} contentFit="cover" transition={150} />
        {statusLabel ? (
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, entity.is_open_now ? styles.dotOpen : styles.dotClosed]} />
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {entity.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.distance} numberOfLines={1}>
            {distance ?? entity.category_name}
          </Text>
          {hasRating ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={12} color={colors.accent} />
              <Text style={styles.ratingText}>{entity.avg_rating.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Misma distancia en el pin, la tarjeta y la cápsula de zona: un solo formateador. */
export function formatFeaturedDistance(km: number | null): string | null {
  return formatDistance(km);
}

const styles = StyleSheet.create({
  item: {
    width: 156,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...softShadow,
  },
  image: { width: '100%', height: 90, backgroundColor: colors.selectedSoft },
  statusBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14, 35, 70, 0.82)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  dotOpen: { backgroundColor: '#2DD4BF' },
  dotClosed: { backgroundColor: '#94A3B8' },
  statusText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  itemCompact: {
    width: 156,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...softShadow,
  },
  compactIconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.selectedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactInfo: { flex: 1, gap: 2 },
  info: { padding: 10, gap: 4 },
  name: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  distance: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted, flexShrink: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
