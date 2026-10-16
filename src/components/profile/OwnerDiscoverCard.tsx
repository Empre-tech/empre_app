import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EntityDetail, Offer } from '@/api/types';
import { DiscoverCard } from '@/components/explore/ExploreCards';
import { categoryColor } from '@/lib/categoryColor';
import { openLine, ownerChecklist, reasonPill } from '@/lib/discover';
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
 * Del lado del dueño: así se ve su tarjeta en Descubre y qué le falta. Un negocio
 * sin portada no se oculta ni baja en el orden; sale con el círculo y el icono,
 * y aquí se le explica qué puede completar.
 */
export function OwnerDiscoverCard({ business, offer, onEdit, onPublishOffer }: Props) {
  const now = useNow(60_000);
  const cover = business.banner_url || (business.photos ?? []).find((p) => !p.content_type?.startsWith('video/'))?.url || null;
  const tagline = business.tagline?.trim() ?? '';
  const check = ownerChecklist({ hasCover: Boolean(cover), hasTagline: tagline.length > 0, hasOffer: Boolean(offer) });

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
      <View style={styles.meter} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: check.percent }}>
        <View style={[styles.meterFill, { width: `${check.percent}%` }]} />
      </View>
      <Text style={styles.meterText}>{check.percent === 100 ? 'Tu tarjeta está completa.' : `Tu tarjeta está ${check.percent} % completa.`}</Text>
      {check.todo.map((t) => (
        <Pressable
          key={t.key}
          accessibilityRole="button"
          onPress={t.key === 'offer' ? onPublishOffer : onEdit}
          style={({ pressed }) => [styles.todo, pressed && styles.pressed]}
        >
          <Text style={styles.todoText}>
            <Text style={styles.todoTitle}>{t.title}: </Text>
            {t.why}
          </Text>
          <Text style={styles.todoAction}>{t.key === 'offer' ? 'Publicar' : 'Editar'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  title: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  meter: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden', marginTop: spacing.xs },
  meterFill: { height: 8, backgroundColor: colors.success },
  meterText: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  todo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  todoText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  todoTitle: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  todoAction: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  pressed: { opacity: 0.85 },
});
