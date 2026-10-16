import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { track } from '@/analytics/track';
import { promotionsApi } from '@/api/offers';
import { PromotionCardView } from '@/components/promotion/PromotionCardView';
import { formatCurrency, formatDiscount, formatOfferEndsAt } from '@/lib/offer';
import { cardFromApi } from '@/lib/promotion';
import { colors, fonts, spacing } from '@/theme';

/**
 * Sección «Promociones» del perfil de un negocio (público): lista las
 * promociones activas. No aparece si no hay ninguna.
 */
export function PromotionsSection({ entityId, trackViews = true }: { entityId: string; /** false con el propio dueño: sus vistas no cuentan. */ trackViews?: boolean }) {
  const promotions = useQuery({
    queryKey: ['promotions-active', entityId],
    queryFn: () => promotionsApi.active(entityId),
    enabled: Boolean(entityId),
  });

  // Medición: cada promoción se cuenta una vez por pantalla abierta.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!trackViews) return;
    for (const p of promotions.data ?? []) {
      if (seen.current.has(p.id)) continue;
      seen.current.add(p.id);
      track('promotion_viewed', entityId, { promotion_id: p.id });
    }
  }, [promotions.data, entityId, trackViews]);

  if ((promotions.data ?? []).length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Promociones</Text>
      {(promotions.data ?? []).map((p) => {
        // Las de antes del editor (sin plantilla) conservan su descuento o precio; las nuevas, no inventan ninguno.
        const badge = p.template ? undefined : formatDiscount(p.discount) || formatCurrency(p.price) || undefined;
        return <PromotionCardView key={p.id} badge={badge} model={cardFromApi(p, `Hasta el ${formatOfferEndsAt(p.ends_at)}`)} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.lg },
  title: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
});
