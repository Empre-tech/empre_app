import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { track } from '@/analytics/track';
import { entitiesApi } from '@/api/endpoints';
import { claimsApi, offersApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { formatPesos } from '@/lib/catalog';
import { categoryColor } from '@/lib/categoryColor';
import { effectiveClaimStatus } from '@/lib/claims';
import { offerIndications } from '@/lib/discover';
import { resolveImageUrl } from '@/lib/image';
import { offerPriceParts } from '@/lib/offer';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

const RING = 72;
const RING_R = 32;
const RING_C = 2 * Math.PI * RING_R;

/** La ficha de la oferta (tablero «Ficha de la oferta»): qué es, cuánto ahorras, cuánto queda, qué incluye y cómo funciona. */
export default function OfferScreen() {
  const { id, entityId } = useLocalSearchParams<{ id: string; entityId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const now = useNow(30_000);

  const offers = useQuery({ queryKey: ['offers-active', entityId], queryFn: () => offersApi.activeList(entityId!), enabled: Boolean(entityId) });
  const entity = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId!), enabled: Boolean(entityId) });
  const claims = useQuery({ queryKey: ['claims-mine'], queryFn: claimsApi.mine, enabled: status === 'signedIn', staleTime: 30_000 });

  const offer = (offers.data ?? []).find((o) => o.id === id);
  const biz = entity.data;
  const claim = (claims.data ?? []).find((c) => c.offer_id === id && effectiveClaimStatus(c, now) !== 'EXPIRADO' && c.status !== 'CANCELADO');

  const counted = useRef(false);
  useEffect(() => {
    if (offer && entityId && !counted.current) {
      counted.current = true;
      track('offer_viewed', entityId, { offer_id: offer.id });
    }
  }, [offer, entityId]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/offers'));
  const openBiz = () => router.push({ pathname: '/business/[id]', params: { id: entityId! } });
  const backBtn = (
    <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={goBack} style={[styles.back, { top: insets.top + spacing.sm }]}>
      <Ionicons name="chevron-back" size={22} color={colors.ink} />
    </Pressable>
  );

  if (offers.isLoading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Cargando la oferta" />
        {backBtn}
      </View>
    );
  }
  if (!offer) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 64 }]}>
        <EmptyState
          icon="pricetag-outline"
          title={offers.isError ? 'No pudimos traer la oferta' : 'Esta oferta terminó'}
          body={offers.isError ? 'Revisa tu conexión e inténtalo otra vez.' : 'El negocio sigue en Empre: puedes verlo o seguirlo para enterarte de la próxima.'}
          action={offers.isError ? { title: 'Reintentar', onPress: () => void offers.refetch() } : { title: 'Ver el negocio', onPress: openBiz }}
        />
        {backBtn}
      </View>
    );
  }

  const parts = offerPriceParts(offer);
  const ends = Date.parse(offer.ends_at);
  const starts = Date.parse(offer.starts_at);
  const left = Math.max(0, ends - now);
  const hours = Math.floor(left / 3_600_000);
  const mins = Math.floor((left % 3_600_000) / 60_000);
  const days = Math.floor(hours / 24);
  const share = ends > starts ? Math.min(1, left / (ends - starts)) : 0;
  const endDate = new Date(ends);
  const sameDay = endDate.toDateString() === new Date(now).toDateString();
  const endTime = endDate.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  const endText = sameDay ? `Termina hoy ${endTime}` : `Termina el ${endDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' })}, ${endTime}`;
  const clock = days >= 1 ? `${days} ${days === 1 ? 'día' : 'días'}` : hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;
  const cover = biz?.banner_url || biz?.photos?.[0]?.url;
  const address = [biz?.address, biz?.city].filter(Boolean).join(', ');
  const hasPlace = Boolean(biz && (biz.latitude || biz.longitude));
  const directions = () => {
    if (!biz) return;
    track('directions_tapped', biz.id, { origin: 'offer' });
    void Linking.openURL(Platform.select({ ios: `http://maps.apple.com/?daddr=${biz.latitude},${biz.longitude}`, default: `https://www.google.com/maps/dir/?api=1&destination=${biz.latitude},${biz.longitude}` })!);
  };
  const redeemed = claim?.status === 'CANJEADO';
  const live = claim?.status === 'RECLAMADO';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={[styles.cover, { height: 220 + insets.top, backgroundColor: categoryColor(biz?.category?.color).fg }]}>
          {cover ? (
            <Image accessible={false} source={{ uri: resolveImageUrl(cover) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <Ionicons name="pricetag" size={52} color="rgba(255,255,255,0.7)" />
          )}
          {parts.savingPct > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>-{parts.savingPct} %</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${biz?.name ?? 'el negocio'}`} onPress={openBiz} style={styles.bizRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bizName} numberOfLines={1}>
                {biz?.name ?? ' '}
              </Text>
              <Text style={styles.bizSub} numberOfLines={1}>
                {[biz?.category?.name, biz ? (biz.is_open_now ? 'Abierto' : 'Cerrado') : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Text style={styles.title} accessibilityRole="header">
            {offer.title}
          </Text>

          <View style={styles.priceCard}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.priceRow}>
                {parts.now ? <Text style={styles.price}>{parts.now}</Text> : null}
                {parts.was ? <Text style={styles.was}>{parts.was}</Text> : null}
              </View>
              {parts.savingPct > 0 ? <Text style={styles.saving}>Ahorras {parts.savingPct} %</Text> : null}
              <Text style={styles.ends}>{endText}</Text>
            </View>
            <View style={styles.ring} accessible accessibilityLabel={`Quedan ${clock}`} accessibilityLiveRegion="polite">
              <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
                <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={colors.accentSoft} strokeWidth={6} fill="none" />
                <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={colors.accent} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={`${RING_C} ${RING_C}`} strokeDashoffset={RING_C * (1 - share)} transform={`rotate(-90 ${RING / 2} ${RING / 2})`} />
              </Svg>
              <Text style={styles.ringText} numberOfLines={2}>
                {clock}
              </Text>
            </View>
          </View>

          {offer.items?.length ? (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>INCLUYE</Text>
              <View style={styles.card}>
                {offer.items.map((it, i) => (
                  <View key={it.name + i} style={[styles.row, i > 0 && styles.rowLine]}>
                    <Text style={styles.rowLabel}>{it.name}</Text>
                    {it.price ? <Text style={styles.rowMeta}>{formatPesos(it.price)} en su catálogo</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.eyebrow}>CÓMO FUNCIONA</Text>
            <View style={styles.card}>
              {offerIndications(offer).map((r, i) => (
                <View key={r.label} style={[styles.row, i > 0 && styles.rowLine]}>
                  <Text style={styles.rowMeta}>{r.label}</Text>
                  <Text style={styles.rowValue}>{r.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {address ? (
            <View style={[styles.card, styles.whereRow]}>
              <Ionicons name="location-outline" size={18} color={colors.ink} />
              <Text style={styles.rowLabel}>{address}</Text>
              {hasPlace ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Cómo llegar" onPress={directions} style={styles.go}>
                  <Text style={styles.goText}>Llegar</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      {backBtn}
      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.sm }]}>
        {redeemed ? (
          <Button title="Ver el negocio" variant="secondary" onPress={openBiz} />
        ) : live ? (
          <Button title="Ver mi QR" onPress={() => router.push({ pathname: '/offer/claim', params: { claimId: claim!.id, offerId: offer.id } })} />
        ) : (
          <Button title="Reclamar oferta" onPress={() => router.push({ pathname: '/offer/claim', params: { offerId: offer.id, entityId: entityId!, title: offer.title } })} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: spacing.md, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: { position: 'absolute', right: spacing.md, bottom: spacing.md, minHeight: 32, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.accent },
  badgeText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  body: { padding: spacing.lg, gap: spacing.md },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  bizName: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bizSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: 1 },
  title: { fontSize: 26, lineHeight: 31, fontFamily: fonts.display.bold, color: colors.ink },
  priceCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.sm },
  price: { fontSize: 28, fontFamily: fonts.display.bold, color: colors.ink },
  was: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.muted, textDecorationLine: 'line-through' },
  saving: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  ends: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringText: { width: 46, fontSize: 11, lineHeight: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  section: { gap: spacing.sm },
  eyebrow: { fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.ui.extrabold, color: colors.muted },
  card: { borderRadius: radius.lg, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  row: { gap: 2, paddingVertical: 11 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.bold, color: colors.ink },
  rowMeta: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  rowValue: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.ink },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  go: { minHeight: 44, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.selectedSoft },
  goText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
});
