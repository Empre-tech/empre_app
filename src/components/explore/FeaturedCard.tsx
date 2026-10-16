import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DiscoveryItem } from '@/api/types';
import { formatDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts, radius, spacing } from '@/theme';

export type WithDistance = DiscoveryItem & { distanceKm: number | null };

/** Una tarjeta del carrusel de Destacados: miniatura cuadrada + nombre, distancia y rating. */
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
            color={colors.primary}
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
              <Ionicons name="star" size={11} color={colors.accent} />
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
          <View style={[styles.statusBadge, entity.is_open_now ? styles.statusOpen : styles.statusClosed]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {entity.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.distance}>{distance ?? entity.category_name}</Text>
          {hasRating ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={11} color={colors.accent} />
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
  item: { width: 144, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  image: { width: '100%', height: 88, backgroundColor: colors.primarySoft },
  statusBadge: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  statusOpen: { backgroundColor: 'rgba(22, 163, 74, 0.92)' },
  statusClosed: { backgroundColor: 'rgba(107, 114, 128, 0.92)' },
  statusText: { fontSize: 10, fontFamily: fonts.ui.bold, color: '#fff' },
  itemCompact: {
    width: 144,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  compactIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactInfo: { flex: 1, gap: 2 },
  info: { padding: spacing.sm, gap: 4 },
  name: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  distance: { fontSize: 11, fontFamily: fonts.ui.medium, color: colors.muted, flexShrink: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.ink },
});
