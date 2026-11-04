import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { track } from '@/analytics/track';
import { entitiesApi } from '@/api/endpoints';
import { claimsApi, offersApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { formatPesos } from '@/lib/catalog';
import { effectiveClaimStatus } from '@/lib/claims';
import { offerIndications } from '@/lib/discover';
import { resolveImageUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { offerPriceParts } from '@/lib/offer';
import { distanceLabel } from '@/lib/offerMarket';
import { photoTone } from '@/lib/photoTone';
import { metersBetween, planHour } from '@/lib/plans';
import { useCoords } from '@/lib/useCoords';
import { useNow } from '@/lib/useNow';
import { colors, fonts, spacing } from '@/theme';

const RING = 76;
const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

/** La ficha de la oferta (tablero «Ficha de la oferta»): qué es, cuánto ahorras, cuánto queda, qué incluye y cómo funciona. */
export default function OfferScreen() {
  const { id, entityId } = useLocalSearchParams<{ id: string; entityId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const now = useNow(30_000);
  const coords = useCoords();

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
    <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={goBack} style={[styles.back, { top: insets.top + 14 }]}>
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
  const endTime = planHour(ends);
  const endText = sameDay ? `Termina hoy ${endTime}` : `Termina el ${endDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' })}, ${endTime}`;
  const clockTop = days >= 1 ? String(days) : hours > 0 ? `${hours} h` : `${mins}`;
  const clockBottom = days >= 1 ? (days === 1 ? 'día' : 'días') : hours > 0 ? (mins ? `${mins} min` : '') : 'min';
  const clock = `${clockTop} ${clockBottom}`.trim();
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
  const meters = coords && biz && (biz.latitude || biz.longitude) ? metersBetween(coords.latitude, coords.longitude, biz.latitude, biz.longitude) : null;
  const phone = biz?.contact_info?.replace(/[^\d+]/g, '');
  const rows = offerIndications(offer);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
        <View style={[styles.cover, { height: 272 + insets.top, backgroundColor: photoTone(entityId ?? '') }]}>
          {cover ? (
            <Image accessible={false} source={{ uri: resolveImageUrl(cover) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <Ionicons name={displayIcon(biz?.category?.icon) as keyof typeof Ionicons.glyphMap} size={84} color="#fff" />
          )}
        </View>

        <View style={styles.sheet}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${biz?.name ?? 'el negocio'}`} onPress={openBiz} style={styles.bizRow}>
            <View style={styles.bizRing}>
              {biz?.profile_url ? (
                <Avatar uri={biz.profile_url} name={biz.name} size={48} />
              ) : (
                <View style={styles.bizIcon}>
                  <Ionicons name={displayIcon(biz?.category?.icon) as keyof typeof Ionicons.glyphMap} size={22} color={colors.ink} />
                </View>
              )}
            </View>
            <View style={styles.bizText}>
              <View style={styles.bizLine}>
                <Text style={styles.bizName} numberOfLines={1}>
                  {biz?.name ?? ' '}
                </Text>
                {biz?.is_verified ? <Ionicons name="checkmark-circle" size={16} color={colors.verified} accessibilityLabel="Verificado" /> : null}
              </View>
              <Text style={styles.bizSub} numberOfLines={2}>
                {[biz?.category?.name, meters !== null ? `a ${distanceLabel(meters)}` : null].filter(Boolean).join(' · ')}
                {biz ? ' · ' : ''}
                {biz ? <Text style={{ color: biz.is_open_now ? colors.verified : colors.muted, fontFamily: fonts.ui.extrabold }}>{biz.is_open_now ? 'Abierto' : 'Cerrado'}</Text> : null}
              </Text>
            </View>
          </Pressable>

          <Text style={styles.title} accessibilityRole="header">
            {offer.title}
          </Text>

          <View style={styles.priceBlock}>
            <View style={styles.priceSide}>
              <View style={styles.priceRow}>
                {parts.now ? <Text style={styles.price}>{parts.now}</Text> : null}
                {parts.was ? <Text style={styles.was}>{parts.was}</Text> : null}
              </View>
              {parts.savingPct > 0 ? (
                <View style={styles.saving}>
                  <Text style={styles.savingText}>Ahorras {parts.savingPct} %</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.ringSide}>
              <View style={styles.ring} accessible accessibilityLabel={`Quedan ${clock}`} accessibilityLiveRegion="polite">
                <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
                  <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={colors.accentSoft} strokeWidth={8} fill="none" />
                  <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={colors.accent} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={`${RING_C} ${RING_C}`} strokeDashoffset={RING_C * (1 - share)} transform={`rotate(-90 ${RING / 2} ${RING / 2})`} />
                </Svg>
                <Text style={styles.ringTop}>{clockTop}</Text>
                {clockBottom ? <Text style={styles.ringBottom}>{clockBottom}</Text> : null}
              </View>
              <Text style={styles.ends}>{endText}</Text>
            </View>
          </View>

          {offer.items?.length ? (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>INCLUYE</Text>
              {offer.items.map((it, i) => (
                <View key={it.name + i} style={[styles.row, i === offer.items!.length - 1 && styles.rowLast]}>
                  <Text style={styles.rowLeft}>{it.name}</Text>
                  {it.price ? <Text style={styles.rowFaint}>{formatPesos(it.price)} en su catálogo</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.eyebrow}>CÓMO FUNCIONA</Text>
            {rows.map((r, i) => (
              <View key={r.label} style={[styles.row, i === rows.length - 1 && styles.rowLast]}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.value}</Text>
              </View>
            ))}
          </View>

          {address ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`${address}. Ver en el mapa`} disabled={!hasPlace} onPress={directions} style={styles.where}>
              <View style={styles.whereMap}>
                <Ionicons name="location" size={22} color={colors.primaryDark} />
              </View>
              <View style={styles.whereText}>
                <Text style={styles.whereAddress}>{address}</Text>
                {hasPlace ? <Text style={styles.whereLink}>Ver en el mapa</Text> : null}
              </View>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      {backBtn}
      <Pressable accessibilityRole="button" accessibilityLabel="Compartir la oferta" onPress={() => void Share.share({ message: `${offer.title} en ${biz?.name ?? 'Empre'}${parts.now ? `: ${parts.now}` : ''}. ${endText}. Lo vi en Empre.` })} style={[styles.back, styles.shareBtn, { top: insets.top + 14 }]}>
        <Ionicons name="share-outline" size={19} color={colors.ink} />
      </Pressable>
      <View style={[styles.bar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Escribirle a ${biz?.name ?? 'el negocio'}`} onPress={() => router.push({ pathname: '/chat/[entityId]', params: { entityId: entityId! } })} style={styles.barBtn}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.ink} />
        </Pressable>
        {phone ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Llamar a ${biz?.name}`} onPress={() => void Linking.openURL(`tel:${phone}`)} style={styles.barBtn}>
            <Ionicons name="call-outline" size={20} color={colors.verified} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (redeemed) openBiz();
            else if (live) router.push({ pathname: '/offer/claim', params: { claimId: claim!.id, offerId: offer.id } });
            else router.push({ pathname: '/offer/claim', params: { offerId: offer.id, entityId: entityId!, title: offer.title } });
          }}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>{redeemed ? 'Ver el negocio' : live ? 'Ver mi QR' : 'Reclamar oferta'}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: 14, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  shareBtn: { left: undefined, right: 14 },
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheet: { marginTop: -24, paddingTop: 22, paddingHorizontal: 20, gap: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.surface },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bizRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  bizIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  bizText: { flex: 1, minWidth: 0, gap: 2 },
  bizLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bizName: { flexShrink: 1, fontSize: 18, lineHeight: 22, fontFamily: fonts.display.bold, color: colors.ink },
  bizSub: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.muted },
  title: { fontSize: 28, lineHeight: 31, letterSpacing: -0.28, fontFamily: fonts.display.bold, color: colors.ink },
  priceBlock: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  priceSide: { flex: 1, minWidth: 0, gap: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  price: { fontSize: 30, letterSpacing: -0.3, fontFamily: fonts.ui.extrabold, color: colors.ink },
  was: { fontSize: 16, fontFamily: fonts.ui.medium, color: colors.faint, textDecorationLine: 'line-through' },
  saving: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: colors.accent },
  savingText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  ringSide: { width: 92, alignItems: 'center', gap: 4 },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringTop: { fontSize: 15, lineHeight: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  ringBottom: { fontSize: 12, lineHeight: 13, fontFamily: fonts.ui.bold, color: colors.accentInk },
  ends: { fontSize: 12, lineHeight: 15, fontFamily: fonts.ui.bold, color: colors.muted, textAlign: 'center' },
  section: { gap: 4 },
  eyebrow: { marginBottom: 4, fontSize: 13, letterSpacing: 1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  rowLast: { borderBottomWidth: 0 },
  rowLeft: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.ink },
  rowFaint: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.faint, textAlign: 'right' },
  rowLabel: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  rowValue: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'right' },
  where: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: colors.bg },
  whereMap: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  whereText: { flex: 1, minWidth: 0, gap: 2 },
  whereAddress: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.extrabold, color: colors.ink },
  whereLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline },
  barBtn: { width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cta: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: colors.primary },
  ctaText: { fontSize: 16.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
