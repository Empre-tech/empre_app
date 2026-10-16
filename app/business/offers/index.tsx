import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Offer, Promotion, PromotionStatus } from '@/api/types';
import { offersApi, promotionsApi } from '@/api/offers';
import { offerTypeLabel, formatOfferEndsAt, formatCurrency, formatDiscount, formatSlotsLeft } from '@/lib/offer';
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
  const promotions = useQuery({
    queryKey: ['promotions', entityId],
    queryFn: () => promotionsApi.list(entityId ?? ''),
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

  const setPromotionStatus = async (promotionId: string, status: PromotionStatus) => {
    try {
      await promotionsApi.update(promotionId, { status });
      await queryClient.invalidateQueries({ queryKey: ['promotions', entityId] });
      await queryClient.invalidateQueries({ queryKey: ['promotions-active', entityId] });
    } catch (e) {
      // Por ejemplo: el límite de promociones activas, o la fecha de fin de un borrador que ya pasó.
      Alert.alert('No pudimos cambiar la promoción', e instanceof Error ? e.message : 'Inténtalo de nuevo.');
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Ofertas</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {/* --- Relámpagos --- */}
        <View style={styles.sectionRow}>
          <Text style={styles.section}>Relámpagos</Text>
          <Pressable onPress={() => router.push({ pathname: '/business/offers/new', params: { entityId } })} hitSlop={8}>
            <Text style={styles.link}>+ Nueva oferta</Text>
          </Pressable>
        </View>

        {offers.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : (offers.data ?? []).length === 0 ? (
          <Text style={styles.empty}>Aún no tienes relámpagos.</Text>
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

        {/* --- Promociones --- */}
        <View style={styles.sectionRow}>
          <Text style={styles.section}>Promociones</Text>
          <Pressable
            onPress={() => router.push({ pathname: '/business/offers/promotions/new', params: { entityId } })}
            hitSlop={8}
          >
            <Text style={styles.link}>+ Nueva promoción</Text>
          </Pressable>
        </View>

        {promotions.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : (promotions.data ?? []).length === 0 ? (
          <Text style={styles.empty}>Aún no tienes promociones.</Text>
        ) : (
          (promotions.data ?? []).map((promotion) => (
            <PromotionCard
              key={promotion.id}
              promotion={promotion}
              onToggle={() =>
                setPromotionStatus(promotion.id, promotion.status === 'active' ? 'paused' : 'active')
              }
              onFinish={() => setPromotionStatus(promotion.id, 'finished')}
            />
          ))
        )}
      </ScrollView>
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
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(100, Math.round((offer.used_slots / Math.max(1, offer.total_slots)) * 100))}%` },
          ]}
        />
      </View>
      <Text style={styles.progressText}>
        {offer.used_slots} de {offer.total_slots} cupos reclamados
      </Text>

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

function PromotionCard({
  promotion,
  onToggle,
  onFinish,
}: {
  promotion: Promotion;
  onToggle: () => void;
  onFinish: () => void;
}) {
  const active = promotion.status === 'active';
  const draft = promotion.status === 'draft';
  const finished = promotion.status === 'finished';
  const value = formatDiscount(promotion.discount) || formatCurrency(promotion.price);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{promotion.title}</Text>
          <Text style={styles.cardMeta}>
            {value ? `${value} · ` : ''}hasta {formatOfferEndsAt(promotion.ends_at)}
          </Text>
        </View>
        <View style={[styles.status, active ? styles.statusActive : styles.statusInactive]}>
          <Text style={styles.statusText}>{draft ? 'Borrador' : finished ? 'Finalizada' : active ? 'Activa' : 'Pausada'}</Text>
        </View>
      </View>

      {finished ? null : (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onToggle} style={styles.action}>
            <Ionicons name={active ? 'pause-circle-outline' : 'play-circle-outline'} size={16} color={colors.primary} />
            <Text style={styles.actionText}>{draft ? 'Publicar' : active ? 'Pausar' : 'Reactivar'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onFinish} style={styles.action}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.actionText}>Finalizar</Text>
          </Pressable>
        </View>
      )}
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
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  section: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  link: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
  empty: { color: colors.muted, fontSize: 14, fontFamily: fonts.ui.medium },
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
  slots: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.accentInk },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  progressText: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  actionText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primary },
});
