import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { entitiesApi } from '@/api/endpoints';
import { promotionsApi } from '@/api/offers';
import type { BusinessHour, DiscoveryItem } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { formatDistance } from '@/lib/format';
import { formatOfferEndsAt } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

export interface BannerEntity extends DiscoveryItem {
  distanceKm: number | null;
}

interface Props {
  entity: BannerEntity;
  isMine: boolean;
  onClose: () => void;
  onDirections: () => void;
  onProfile: () => void;
  onClaimOffer: (offerId: string, title: string) => void;
  onScan?: () => void;
  onPublishOffer?: () => void;
}

/** Horario de hoy del negocio, en una línea ("Cerrado hoy", "24 horas", "8:00 – 18:00"). */
function todaysHoursLabel(hours: BusinessHour[]): string | null {
  const today = new Date().getDay();
  const h = hours.find((x) => x.weekday === today);
  if (!h) return null;
  if (h.closed) return 'Cerrado hoy';
  if (h.is_24h) return 'Abierto 24 horas';
  if (!h.open_time || !h.close_time) return null;
  return `${h.open_time} – ${h.close_time}`;
}

/**
 * Tarjeta ligera que aparece al tocar un negocio (reemplaza a Destacados).
 * Nivel 1: nombre + una línea (categoría · estado · hoy) + chip de oferta.
 * El cuerpo abre el perfil; el chip de oferta abre el reclamo.
 */
export function BusinessBanner({
  entity,
  isMine,
  onClose,
  onDirections,
  onProfile,
  onClaimOffer,
  onScan,
  onPublishOffer,
}: Props) {
  const distance = formatDistance(entity.distanceKm);
  const hasRating = entity.review_count > 0;
  const statusLabel = entity.has_hours ? (entity.is_open_now ? 'Abierto' : 'Cerrado') : null;
  const offer = entity.has_active_offer ? entity.active_offer : undefined;

  const detail = useQuery({
    queryKey: ['entity', entity.id],
    queryFn: () => entitiesApi.get(entity.id),
    staleTime: 60_000,
  });
  const promotions = useQuery({
    queryKey: ['promotions-active', entity.id],
    queryFn: () => promotionsApi.active(entity.id),
    staleTime: 60_000,
  });
  const today = detail.data?.hours && detail.data.hours.length > 0 ? todaysHoursLabel(detail.data.hours) : null;

  const meta = [entity.category_name, statusLabel, distance && `a ${distance}`, today ? `hoy ${today}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Avatar uri={entity.profile_url} name={entity.name} size={48} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${entity.name}`} style={styles.info} onPress={onProfile}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
          {hasRating ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={12} color={colors.accent} />
              <Text style={styles.ratingText}>{entity.avg_rating.toFixed(1)}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {offer ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onClaimOffer(offer.id, offer.title)}
          style={({ pressed }) => [styles.offerChip, pressed && styles.pressed]}
        >
          <Ionicons name="flash" size={14} color={colors.accent} />
          <Text style={styles.offerChipText} numberOfLines={1}>
            {offer.title} · termina {formatOfferEndsAt(offer.ends_at)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </Pressable>
      ) : null}

      {promotions.data && promotions.data.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onProfile}
          style={({ pressed }) => [styles.promoChip, pressed && styles.pressed]}
        >
          <Ionicons name="pricetag" size={14} color={colors.primary} />
          <Text style={styles.promoChipText} numberOfLines={1}>
            {promotions.data.length} {promotions.data.length === 1 ? 'promoción' : 'promociones'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        {isMine ? (
          <>
            {onPublishOffer ? (
              <Button title="Publicar oferta" onPress={onPublishOffer} style={styles.action} />
            ) : null}
            {onScan ? (
              <Button title="Escanear canje" variant="secondary" onPress={onScan} style={styles.action} />
            ) : null}
          </>
        ) : (
          <>
            <Button title="Ver perfil" onPress={onProfile} style={styles.action} />
            <Button title="Cómo llegar" variant="secondary" onPress={onDirections} style={styles.action} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  ratingText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  close: { padding: 4 },
  offerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offerChipText: { flex: 1, fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  promoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  promoChipText: { flex: 1, fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  pressed: { opacity: 0.85 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, paddingHorizontal: spacing.sm, minHeight: 44 },
});
