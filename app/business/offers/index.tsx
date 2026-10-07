import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Offer } from '@/api/types';
import { offersApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { offerTypeLabel, formatOfferEndsAt, formatCurrency, formatSlotsLeft } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Gestión de ofertas de un negocio (dueño): lista activas + acciones rápidas
 * (extender, subir cupos) y acceso a crear una nueva.
 */
export default function OffersScreen() {
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const offers = useQuery({
    queryKey: ['offers', entityId],
    queryFn: () => offersApi.list(entityId ?? ''),
    enabled: Boolean(entityId),
  });

  const quickAction = async (offerId: string, action: 'extend' | 'slots', value: number) => {
    setBusyId(offerId);
    try {
      await offersApi.quickAction(offerId, action, value);
      await queryClient.invalidateQueries({ queryKey: ['offers', entityId] });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Ofertas</Text>
        <Pressable
          onPress={() => router.push({ pathname: '/business/offers/new', params: { entityId } })}
          hitSlop={8}
        >
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </Pressable>
      </View>

      {offers.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {(offers.data ?? []).length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="flash-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyTitle}>Aún no tienes ofertas</Text>
              <Text style={styles.emptyText}>Publica una oferta en menos de 30 segundos.</Text>
              <Button
                title="Crear oferta"
                onPress={() => router.push({ pathname: '/business/offers/new', params: { entityId } })}
                style={styles.emptyButton}
              />
            </View>
          ) : (
            (offers.data ?? []).map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                busy={busyId === offer.id}
                onExtend={() => quickAction(offer.id, 'extend', 30)}
                onAddSlots={() => quickAction(offer.id, 'slots', 5)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function OfferCard({
  offer,
  busy,
  onExtend,
  onAddSlots,
}: {
  offer: Offer;
  busy: boolean;
  onExtend: () => void;
  onAddSlots: () => void;
}) {
  const active = new Date(offer.ends_at).getTime() > Date.now();
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{offer.title}</Text>
          <Text style={styles.cardMeta}>
            {offerTypeLabel(offer.type)} · {offer.price ? `${formatCurrency(offer.price)} · ` : ''}hasta{' '}
            {formatOfferEndsAt(offer.ends_at)}
          </Text>
        </View>
        <View style={[styles.status, active ? styles.statusActive : styles.statusInactive]}>
          <Text style={styles.statusText}>{active ? 'Activa' : 'Finalizada'}</Text>
        </View>
      </View>

      <Text style={styles.slots}>{formatSlotsLeft(offer.slots_left)}</Text>

      {active ? (
        <View style={styles.actions}>
          <Pressable onPress={onExtend} disabled={busy} style={styles.action}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={styles.actionText}>Extender 30 min</Text>
          </Pressable>
          <Pressable onPress={onAddSlots} disabled={busy} style={styles.action}>
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.actionText}>+5 cupos</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  list: { padding: spacing.lg, gap: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxl },
  emptyTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  emptyText: { fontSize: 14, fontFamily: fonts.ui.regular, color: colors.muted, textAlign: 'center' },
  emptyButton: { marginTop: spacing.md, minWidth: 180 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardInfo: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  cardMeta: { fontSize: 13, fontFamily: fonts.ui.regular, color: colors.muted },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusActive: { backgroundColor: colors.verifiedSoft },
  statusInactive: { backgroundColor: colors.bg },
  statusText: { fontSize: 12, fontFamily: fonts.ui.bold },
  slots: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.accent },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  actionText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primary },
});
