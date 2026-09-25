import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { EntityMap } from '@/api/types';
import { formatDistance } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

interface Props {
  entity: EntityMap;
  distanceKm?: number | null;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Fila/tarjeta de negocio: se usa en la lista y en la vista previa del mapa. */
export function BusinessRow({ entity, distanceKm, onPress, style }: Props) {
  const distance = formatDistance(distanceKm);
  const hasRating = entity.review_count > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil de ${entity.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      <Avatar uri={entity.profile_url} name={entity.name} size={56} />
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          {entity.is_verified ? <VerifiedBadge /> : null}
        </View>
        <View style={styles.metaRow}>
          {hasRating ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={13} color={colors.warning} />
              <Text style={styles.ratingText}>{entity.avg_rating.toFixed(1)}</Text>
              <Text style={styles.reviewCount}>({entity.review_count})</Text>
            </View>
          ) : null}
          <Text style={styles.meta} numberOfLines={1}>
            {[entity.category_name, distance].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
  },
  pressed: { opacity: 0.85 },
  info: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  reviewCount: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  meta: { flexShrink: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
});
