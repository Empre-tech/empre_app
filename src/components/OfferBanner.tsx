import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { offersApi } from '@/api/offers';
import { formatCurrency, formatOfferEndsAt, offerTypeLabel } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Bloque "Oferta activa" del perfil del negocio. Para el visitante muestra la
 * oferta vigente con su franja naranja y botón "Reclamar"; para el dueño, un
 * acceso a gestionar sus ofertas.
 */
export function OfferBanner({ entityId, isOwner }: { entityId: string; isOwner: boolean }) {
  const router = useRouter();
  const offer = useQuery({
    queryKey: ['offer', entityId],
    queryFn: () => offersApi.active(entityId),
    enabled: !isOwner && Boolean(entityId),
  });

  if (isOwner) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/business/offers', params: { entityId } })}
        style={({ pressed }) => [styles.ownerLink, pressed && styles.pressed]}
      >
        <Ionicons name="flash-outline" size={16} color={colors.primary} />
        <Text style={styles.ownerLinkText}>Gestionar ofertas</Text>
      </Pressable>
    );
  }

  const active = offer.data?.data ?? null;
  if (!active) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.bannerTop}>
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerLabel}>OFERTA ACTIVA</Text>
          <Text style={styles.bannerTitle}>{active.title}</Text>
          {active.price ? <Text style={styles.bannerPrice}>{formatCurrency(active.price)}</Text> : null}
          <Text style={styles.bannerMeta}>
            {offerTypeLabel(active.type)} · hasta {formatOfferEndsAt(active.ends_at)} · quedan {active.slots_left} cupos
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/offer/claim', params: { offerId: active.id, title: active.title } })}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>Reclamar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bannerInfo: { flex: 1, gap: 2 },
  bannerLabel: { fontSize: 10, fontFamily: fonts.ui.bold, color: colors.accent, letterSpacing: 1.2 },
  bannerTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  bannerPrice: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.accent },
  bannerMeta: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ctaText: { fontSize: 14, fontFamily: fonts.ui.bold, color: '#fff' },
  ownerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  ownerLinkText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
  pressed: { opacity: 0.8 },
});
