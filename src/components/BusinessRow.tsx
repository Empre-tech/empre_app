import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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

// Más allá de esta distancia el negocio no es "cerca de ti": se atenúa para
// que lo realmente cercano destaque en la lista.
const FAR_KM = 50;

/** Fila/tarjeta de negocio: se usa en la lista y en la vista previa del mapa. */
export function BusinessRow({ entity, distanceKm, onPress, style }: Props) {
  const distance = formatDistance(distanceKm);
  const isFar = typeof distanceKm === 'number' && distanceKm > FAR_KM;
  const hasRating = entity.review_count > 0;
  const reviewsLabel = `${entity.review_count} ${entity.review_count === 1 ? 'reseña' : 'reseñas'}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil de ${entity.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      <Avatar uri={entity.profile_url} name={entity.name} size={64} />
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          {entity.is_verified ? <VerifiedBadge /> : null}
        </View>
        {entity.category_name ? (
          <Text style={styles.category} numberOfLines={1}>
            {entity.category_name}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {hasRating ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={13} color={colors.accent} />
              <Text style={styles.ratingText}>{entity.avg_rating.toFixed(1)}</Text>
              <Text style={styles.reviewCount}>· {reviewsLabel}</Text>
            </View>
          ) : (
            <View style={styles.newPill}>
              <Ionicons name="star-outline" size={13} color={colors.muted} />
              <Text style={styles.newText}>Sin reseñas</Text>
            </View>
          )}
          {entity.has_hours ? (
            <View style={[styles.statusPill, entity.is_open_now ? styles.statusOpen : styles.statusClosed]}>
              <View style={[styles.openDot, entity.is_open_now ? styles.openDotOpen : styles.openDotClosed]} />
              <Text style={[styles.statusText, entity.is_open_now ? styles.statusTextOpen : styles.statusTextClosed]}>
                {entity.is_open_now ? 'Abierto' : 'Cerrado'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {distance ? (
        <View style={styles.distance}>
          <Ionicons name="navigate" size={14} color={isFar ? colors.muted : colors.primary} />
          <Text style={[styles.distanceText, isFar && styles.distanceFar]}>{distance}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...Platform.select({
      ios: {
        shadowColor: colors.ink,
        shadowOpacity: 0.07,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      },
      // En Android la sombra (elevation) deja muescas en las esquinas
      // redondeadas; un borde fino se ve más limpio.
      default: { borderWidth: 1, borderColor: colors.line },
    }),
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  info: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  category: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: 2 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  reviewCount: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  newPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  newText: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusOpen: { backgroundColor: colors.verifiedSoft },
  statusClosed: { backgroundColor: colors.bg },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openDotOpen: { backgroundColor: colors.verified },
  openDotClosed: { backgroundColor: colors.muted },
  statusText: { fontSize: 12, fontFamily: fonts.ui.bold },
  statusTextOpen: { color: colors.verified },
  statusTextClosed: { color: colors.muted },
  distance: { alignItems: 'center', gap: 2, minWidth: 48 },
  distanceText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.primary },
  distanceFar: { color: colors.muted },
});
