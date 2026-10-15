import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { promotionsApi } from '@/api/offers';
import { formatCurrency, formatOfferEndsAt } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Sección «Promociones» del perfil de un negocio (público): lista las
 * promociones activas. No aparece si no hay ninguna.
 */
export function PromotionsSection({ entityId }: { entityId: string }) {
  const promotions = useQuery({
    queryKey: ['promotions-active', entityId],
    queryFn: () => promotionsApi.active(entityId),
    enabled: Boolean(entityId),
  });

  if ((promotions.data ?? []).length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Promociones</Text>
      {(promotions.data ?? []).map((p) => {
        const value = p.discount ? `${p.discount}%` : formatCurrency(p.price);
        return (
          <View key={p.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.name} numberOfLines={1}>
                {p.title}
              </Text>
              {value ? <Text style={styles.value}>{value}</Text> : null}
            </View>
            <Text style={styles.meta}>hasta {formatOfferEndsAt(p.ends_at)}</Text>
            {p.description ? (
              <Text style={styles.desc} numberOfLines={2}>
                {p.description}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.lg },
  title: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  value: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.primary },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  desc: { fontSize: 13, fontFamily: fonts.ui.regular, color: colors.muted },
});
