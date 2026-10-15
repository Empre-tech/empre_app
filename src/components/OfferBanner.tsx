import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { offersApi } from '@/api/offers';
import { OfferTicket } from '@/components/offer/OfferTicket';
import { colors, fonts, spacing } from '@/theme';

/**
 * Bloque de oferta en el perfil del negocio. Para el visitante, la oferta
 * vigente como un boleto con el tiempo que queda y los cupos; para el dueño,
 * un acceso a gestionar sus ofertas.
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
    <View style={styles.wrap}>
      <OfferTicket
        offer={active}
        cta={{
          title: 'Ver oferta',
          onPress: () =>
            router.push({ pathname: '/offer/claim', params: { offerId: active.id, entityId, title: active.title } }),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  ownerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  ownerLinkText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
  pressed: { opacity: 0.8 },
});
