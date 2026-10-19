import { StyleSheet, Text, View } from 'react-native';
import type { EntityDetail, Offer } from '@/api/types';
import { DiscoverCard } from '@/components/explore/ExploreCards';
import { categoryColor } from '@/lib/categoryColor';
import { openLine, reasonPill } from '@/lib/discover';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  business: EntityDetail;
  /** La oferta vigente que termina antes, si hay. */
  offer?: Offer;
  onEdit: () => void;
  onPublishOffer: () => void;
}

/**
 * Del lado del dueño: así se ve su tarjeta en Descubre. Un negocio sin portada no se
 * oculta ni baja en el orden; sale con el círculo y el icono. Lo que le falta lo dice
 * «Haz que tu negocio destaque» (GrowthCard, 3.40).
 */
export function OwnerDiscoverCard({ business, offer, onEdit, onPublishOffer }: Props) {
  const now = useNow(60_000);
  const cover = business.banner_url || (business.photos ?? []).find((p) => !p.content_type?.startsWith('video/'))?.url || null;
  const tagline = business.tagline?.trim() ?? '';

  const model = {
    id: business.id,
    name: business.name,
    latitude: business.latitude,
    longitude: business.longitude,
    image: business.profile_url,
    cover,
    color: categoryColor(business.category?.color),
    icon: business.category?.icon || 'storefront',
    open: business.hours && business.hours.length > 0 ? Boolean(business.is_open_now) : null,
    distance: null,
    sub: business.subcategories?.[0]?.name || business.category?.name || '',
    line: offer ? tagline || undefined : business.is_open_now ? openLine(undefined) : tagline || undefined,
    pill: offer ? reasonPill({ kind: 'offer', ends_at: offer.ends_at }, now) : null,
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Así te ven en Descubre</Text>
      <DiscoverCard model={model} onPress={onEdit} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  title: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
});
