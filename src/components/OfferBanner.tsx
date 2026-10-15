import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { offersApi } from '@/api/offers';
import type { Offer } from '@/api/types';
import { OfferTicket } from '@/components/offer/OfferTicket';
import { colors, fonts, spacing } from '@/theme';

/** Ofertas vigentes y con cupos del negocio (público), la que termina antes primero. */
export function useActiveOffers(entityId: string, enabled = true) {
  return useQuery({
    queryKey: ['offers-active', entityId],
    queryFn: () => offersApi.activeList(entityId),
    enabled: enabled && Boolean(entityId),
  });
}

function useOpenOffer(entityId: string) {
  const router = useRouter();
  return (offer: Offer) =>
    router.push({ pathname: '/offer/claim', params: { offerId: offer.id, entityId, title: offer.title } });
}

/**
 * Bloque de oferta en el perfil del negocio. Para el visitante, la oferta que
 * termina antes como un boleto, con un acceso a las demás si hay más de una;
 * para el dueño, un acceso a gestionar sus ofertas.
 */
export function OfferBanner({
  entityId,
  isOwner,
  onSeeMore,
}: {
  entityId: string;
  isOwner: boolean;
  /** Abre la pestaña Ofertas cuando hay más de una vigente. */
  onSeeMore?: () => void;
}) {
  const router = useRouter();
  const offers = useActiveOffers(entityId, !isOwner);
  const openOffer = useOpenOffer(entityId);

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

  const list = offers.data ?? [];
  const featured = list[0];
  if (!featured) return null;
  const more = list.length - 1;

  return (
    <View style={styles.wrap}>
      <OfferTicket offer={featured} cta={{ title: 'Ver oferta', onPress: () => openOffer(featured) }} />
      {more > 0 && onSeeMore ? (
        <Pressable accessibilityRole="button" onPress={onSeeMore} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <Text style={styles.moreText}>
            +{more} {more === 1 ? 'oferta más' : 'ofertas más'}
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Contenido de la pestaña Ofertas: todas las vigentes, cada una como boleto. */
export function OffersTab({ entityId }: { entityId: string }) {
  const offers = useActiveOffers(entityId);
  const openOffer = useOpenOffer(entityId);
  const list = offers.data ?? [];

  return (
    <View style={styles.tab}>
      {list.map((offer) => (
        <OfferTicket key={offer.id} offer={offer} notchColor={colors.surface} cta={{ title: 'Ver oferta', onPress: () => openOffer(offer) }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  tab: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.sm },
  moreText: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.primary },
  ownerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  ownerLinkText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
  pressed: { opacity: 0.8 },
});
