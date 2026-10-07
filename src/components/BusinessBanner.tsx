import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { entitiesApi } from '@/api/endpoints';
import { statusApi } from '@/api/offers';
import type { BusinessHour, DiscoveryItem } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { categoryColor } from '@/lib/categoryColor';
import { formatDistance } from '@/lib/format';
import { formatOfferEndsAt, offerTypeLabel } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

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

/**
 * Banner que aparece al tocar un negocio (reemplaza al panel de Destacados,
 * nunca se apilan). Resumen + acciones rápidas + franja de oferta. Es la única
 * vía al perfil ("Ver perfil").
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
  const cat = categoryColor(entity.category_color);
  const distance = formatDistance(entity.distanceKm);
  const hasRating = entity.review_count > 0;
  const statusLabel = entity.has_hours ? (entity.is_open_now ? 'Abierto' : 'Cerrado') : null;
  const offer = entity.has_active_offer ? entity.active_offer : undefined;

  // Detalle (horario) y disponibilidad en tiempo real: se cargan al abrir el
  // banner (no vienen en el resultado de descubrimiento).
  const detail = useQuery({
    queryKey: ['entity', entity.id],
    queryFn: () => entitiesApi.get(entity.id),
    staleTime: 60_000,
  });
  const status = useQuery({
    queryKey: ['entity-status', entity.id],
    queryFn: () => statusApi.get(entity.id),
    staleTime: 60_000,
  });
  const today = detail.data?.hours && detail.data.hours.length > 0 ? todaysHoursLabel(detail.data.hours) : null;
  const availability = status.data?.availability?.trim() || null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Avatar uri={entity.profile_url} name={entity.name} size={52} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {entity.category_name}
            {distance ? ` · ${distance}` : ''}
          </Text>
          <View style={styles.badgesRow}>
            {hasRating ? (
              <View style={styles.rating}>
                <Ionicons name="star" size={12} color={colors.accent} />
                <Text style={styles.ratingText}>{entity.avg_rating.toFixed(1)}</Text>
              </View>
            ) : null}
            {statusLabel ? (
              <View style={[styles.statusPill, entity.is_open_now ? styles.statusOpen : styles.statusClosed]}>
                <View style={[styles.dot, entity.is_open_now ? styles.dotOpen : styles.dotClosed]} />
                <Text style={[styles.statusText, entity.is_open_now ? styles.statusTextOpen : styles.statusTextClosed]}>
                  {statusLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {today || availability ? (
        <View style={styles.detailRow}>
          {today ? (
            <View style={styles.detailItem}>
              <Ionicons name="time-outline" size={14} color={colors.muted} />
              <Text style={styles.detailText} numberOfLines={1}>
                Hoy {today}
              </Text>
            </View>
          ) : null}
          {availability ? (
            <View style={styles.detailItem}>
              <Ionicons name="people-outline" size={14} color={colors.primary} />
              <Text style={styles.detailText} numberOfLines={1}>
                {availability}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {offer ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onClaimOffer(offer.id, offer.title)}
          style={({ pressed }) => [styles.offerStrip, pressed && styles.pressed]}
        >
          <View style={styles.offerIcon}>
            <Ionicons name="flash" size={14} color="#fff" />
          </View>
          <View style={styles.offerInfo}>
            <Text style={styles.offerTitle} numberOfLines={1}>
              {offer.title}
            </Text>
            <Text style={styles.offerMeta} numberOfLines={1}>
              {offer.price ? `${offer.price} · ` : ''}
              {offerTypeLabel(offer.type)} · hasta {formatOfferEndsAt(offer.ends_at)} · quedan {offer.slots_left} cupos
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
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
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  statusOpen: { backgroundColor: colors.verifiedSoft },
  statusClosed: { backgroundColor: colors.bg },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOpen: { backgroundColor: colors.verified },
  dotClosed: { backgroundColor: colors.muted },
  statusText: { fontSize: 12, fontFamily: fonts.ui.bold },
  statusTextOpen: { color: colors.verified },
  statusTextClosed: { color: colors.muted },
  close: { padding: 4 },
  detailRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  offerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offerIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  offerInfo: { flex: 1, gap: 1 },
  offerTitle: { fontSize: 14.5, fontFamily: fonts.ui.bold, color: '#fff' },
  offerMeta: { fontSize: 12, fontFamily: fonts.ui.medium, color: '#fff' },
  pressed: { opacity: 0.85 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, paddingHorizontal: spacing.sm, minHeight: 44 },
});
