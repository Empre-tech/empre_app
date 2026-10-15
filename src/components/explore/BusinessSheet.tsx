import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { entitiesApi } from '@/api/endpoints';
import { promotionsApi } from '@/api/offers';
import type { BusinessHour } from '@/api/types';
import { Button } from '@/components/Button';
import { categoryColor } from '@/lib/categoryColor';
import { formatDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { formatCurrency, formatSavings, formatSlotsLeft, offerUrgency, timeLeftLabel, timeLeftMs } from '@/lib/offer';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { WithDistance } from './FeaturedCard';

interface Props {
  entity: WithDistance;
  isMine: boolean;
  onClose: () => void;
  onDirections: () => void;
  onProfile: () => void;
  onClaimOffer: (offerId: string, title: string, entityId: string) => void;
  onScan?: () => void;
  onPublishOffer?: () => void;
}

/** «Abierto · cierra 18:00», «Abierto 24 h», «Cerrado»; vacío si el negocio no tiene horario. */
function openLabel(entity: WithDistance, hours?: BusinessHour[]): string | null {
  if (!entity.has_hours) return null;
  if (!entity.is_open_now) return 'Cerrado';
  const today = hours?.find((h) => h.weekday === new Date().getDay());
  if (today?.is_24h) return 'Abierto 24 h';
  return today?.close_time ? `Abierto · cierra ${today.close_time}` : 'Abierto';
}

/**
 * Hoja del negocio seleccionado (reemplaza al banner). Foto o color de la
 * categoría arriba con el nombre y el estado; si hay oferta, una franja con el
 * precio, el ahorro y el tiempo que queda contando hacia atrás; y la acción
 * principal. Para el dueño, las acciones de gestión. Tocar la foto abre el perfil.
 */
export function BusinessSheet({
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
  const thumb = entity.profile_url ? resolveImageUrl(entity.profile_url) : null;
  const icon = (entity.category_icon || 'storefront') as keyof typeof Ionicons.glyphMap;
  const distance = formatDistance(entity.distanceKm);

  const detail = useQuery({
    queryKey: ['entity', entity.id],
    queryFn: () => entitiesApi.get(entity.id),
    staleTime: 60_000,
  });
  const promotions = useQuery({
    queryKey: ['promotions-active', entity.id],
    queryFn: () => promotionsApi.active(entity.id),
    staleTime: 60_000,
  });
  const status = openLabel(entity, detail.data?.hours);

  // Cuenta regresiva de la oferta: cada segundo (basta para que los minutos se
  // mantengan al día y la última llamada cuente de verdad).
  const offer = entity.has_active_offer ? entity.active_offer : undefined;
  const now = useNow(offer ? 1000 : 60_000);
  const msLeft = offer ? timeLeftMs(offer.ends_at, now) : 0;
  const live = offer && msLeft > 0 ? offer : undefined;
  const urgency = offerUrgency(msLeft);
  const hot = urgency === 'hot';

  // Entrada breve; sin movimiento si el sistema lo pide.
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) enter.setValue(1);
        else Animated.timing(enter, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      })
      .catch(() => enter.setValue(1));
    return () => {
      cancelled = true;
    };
  }, [enter]);

  const meta = [entity.category_name, distance && `a ${distance}`].filter(Boolean).join(' · ');
  const rating = entity.review_count > 0 ? `★ ${entity.avg_rating.toFixed(1).replace('.', ',')} (${entity.review_count})` : null;
  const price = live ? formatCurrency(live.price) : '';
  const normal = live ? formatCurrency(live.normal_price) : '';
  const savings = live ? formatSavings(live.price, live.normal_price) : '';

  return (
    <Animated.View
      style={[styles.sheet, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ver perfil de ${entity.name}`}
        onPress={onProfile}
        style={[styles.hero, { backgroundColor: cat.fg }]}
      >
        {thumb ? (
          <Image accessible={false} source={{ uri: thumb }} style={styles.fill} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.fill, styles.heroIconWrap]}>
            <Ionicons name={icon} size={72} color="rgba(255,255,255,0.28)" />
          </View>
        )}
        {/* Dos capas translúcidas dejan el texto blanco legible sobre cualquier foto. */}
        <View style={[styles.fill, styles.scrim]} />
        <View style={styles.scrimBottom} />

        <View style={styles.heroTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={8} style={styles.closeButton}>
            <Ionicons name="close" size={20} color={colors.ink} />
          </Pressable>
          {status ? (
            <View style={styles.statusChip}>
              <View style={[styles.statusDot, { backgroundColor: entity.is_open_now ? colors.success : '#9AA7B5' }]} />
              <Text style={[styles.statusText, !entity.is_open_now && styles.statusTextClosed]}>{status}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroBottom}>
          <Text style={styles.name} numberOfLines={1}>
            {entity.name}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {[meta, rating].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Pressable>

      {live ? (
        <View style={[styles.offer, hot && styles.offerHot]}>
          <View style={[styles.bolt, hot && styles.boltHot]}>
            <Ionicons name="flash" size={16} color={hot ? colors.accent : colors.ink} />
          </View>
          <View style={styles.offerText}>
            <Text style={styles.offerTitle} numberOfLines={1}>
              {isMine ? `Tu oferta: ${live.title}` : live.title}
            </Text>
            {price ? (
              <View style={styles.priceRow}>
                <Text style={styles.price}>{price}</Text>
                {normal ? <Text style={[styles.normal, hot && styles.normalHot]}>{normal}</Text> : null}
                {savings ? <Text style={[styles.savings, hot && styles.savingsHot]}>{savings}</Text> : null}
              </View>
            ) : null}
            <Text style={[styles.time, hot && styles.timeHot]}>
              {timeLeftLabel(msLeft)} · {formatSlotsLeft(live.slots_left)}
            </Text>
          </View>
        </View>
      ) : null}

      {promotions.data && promotions.data.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={onProfile} style={({ pressed }) => [styles.promoChip, pressed && styles.pressed]}>
          <Ionicons name="pricetag" size={14} color={colors.primary} />
          <Text style={styles.promoChipText} numberOfLines={1}>
            {promotions.data.length} {promotions.data.length === 1 ? 'promoción' : 'promociones'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        {isMine ? (
          <>
            {onPublishOffer ? <Button title="Publicar oferta" onPress={onPublishOffer} style={styles.main} /> : null}
            {onScan ? <Button title="Escanear canje" variant="secondary" onPress={onScan} style={styles.action} /> : null}
          </>
        ) : live ? (
          <>
            <Button title="Ver oferta" onPress={() => onClaimOffer(live.id, live.title, entity.id)} style={styles.main} />
            <Button title="Cómo llegar" variant="secondary" onPress={onDirections} style={styles.action} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver perfil de ${entity.name}`}
              onPress={onProfile}
              style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
            >
              <Ionicons name="storefront-outline" size={20} color={colors.primaryDark} />
            </Pressable>
          </>
        ) : (
          <>
            <Button title="Ver perfil" onPress={onProfile} style={styles.main} />
            <Button title="Cómo llegar" variant="secondary" onPress={onDirections} style={styles.action} />
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 2,
    borderTopRightRadius: radius.lg + 2,
    overflow: 'hidden',
    paddingBottom: spacing.lg,
    gap: spacing.md,
    ...shadow,
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hero: { height: 128, justifyContent: 'space-between', padding: spacing.md },
  heroIconWrap: { alignItems: 'center', justifyContent: 'center' },
  scrim: { backgroundColor: 'rgba(10, 20, 40, 0.30)' },
  scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 72, backgroundColor: 'rgba(10, 20, 40, 0.40)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: '#17673A' },
  statusTextClosed: { color: '#4A5A70' },
  heroBottom: { gap: 1 },
  name: { fontSize: 20, fontFamily: fonts.display.bold, color: '#fff' },
  heroMeta: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: '#fff' },

  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(245, 130, 32, 0.35)',
  },
  // Última llamada: la franja se vuelve ámbar sólido, con texto en tinta (6,1:1).
  offerHot: { backgroundColor: colors.accent, borderColor: colors.accent },
  bolt: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  boltHot: { backgroundColor: colors.ink },
  offerText: { flex: 1, gap: 2 },
  offerTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 },
  price: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  normal: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, textDecorationLine: 'line-through' },
  normalHot: { color: '#5A2D00' },
  savings: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  savingsHot: { color: colors.ink },
  time: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  timeHot: { color: colors.ink },

  promoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  promoChipText: { flex: 1, fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  pressed: { opacity: 0.85 },

  actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  main: { flex: 1.3, paddingHorizontal: spacing.sm, minHeight: 46 },
  action: { flex: 1, paddingHorizontal: spacing.sm, minHeight: 46 },
  profileButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
