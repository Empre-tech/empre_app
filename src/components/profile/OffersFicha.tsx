import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { track } from '@/analytics/track';
import { claimsApi } from '@/api/offers';
import type { OfferClaim } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { useActiveOffers } from '@/components/OfferBanner';
import { OfferTicket } from '@/components/offer/OfferTicket';
import { effectiveClaimStatus } from '@/lib/claims';
import { offerIndications, shortLeft } from '@/lib/discover';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  entityId: string;
  isOwner: boolean;
  /** Oferta con la que abrir la ficha (al venir de la franja del mapa). */
  initialOfferId?: string;
}

const STEPS = ['Ver oferta', 'Reclamar', 'Mostrar QR', 'Canjeada'];
const shortTitle = (t: string) => (t.length > 20 ? `${t.slice(0, 19)}…` : t);

/**
 * La ficha de ofertas del perfil: un selector compacto (un chip por oferta, con
 * su tiempo), un solo boleto y sus indicaciones. Su alto no crece con el número
 * de ofertas y nunca muestra una cantidad. Reclamar lleva a la pantalla del QR.
 */
export function OffersFicha({ entityId, isOwner, initialOfferId }: Props) {
  const router = useRouter();
  const { status } = useAuth();
  const offers = useActiveOffers(entityId);
  const claims = useQuery({ queryKey: ['claims-mine'], queryFn: claimsApi.mine, enabled: status === 'signedIn' && !isOwner, staleTime: 30_000 });
  const now = useNow(30_000);
  const [picked, setPicked] = useState<string | undefined>(initialOfferId);

  const list = offers.data ?? [];
  // Medición: la oferta que se ve (la pedida, o la primera) cuenta una vez al verla; no la del propio dueño.
  const viewedOfferId = picked ?? list[0]?.id;
  useEffect(() => {
    if (!isOwner && viewedOfferId) track('offer_viewed', entityId, { offer_id: viewedOfferId });
  }, [isOwner, entityId, viewedOfferId]);
  if (list.length === 0) {
    return isOwner ? (
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/offers', params: { entityId } })} style={styles.ownerLink}>
        <Ionicons name="flash-outline" size={16} color={colors.primary} />
        <Text style={styles.ownerLinkText}>Gestionar ofertas</Text>
      </Pressable>
    ) : null;
  }

  const claimOf = (offerId: string): OfferClaim | undefined =>
    (claims.data ?? []).find((c) => c.offer_id === offerId && effectiveClaimStatus(c, now) !== 'EXPIRADO' && c.status !== 'CANCELADO');
  // Abre en la oferta pedida; si no, en la que tiene un QR activo; si no, en la que termina antes.
  const withQr = list.find((o) => claimOf(o.id)?.status === 'RECLAMADO');
  const selected = list.find((o) => o.id === picked) ?? withQr ?? list[0];
  const claim = claimOf(selected.id);
  const idx = !claim ? 1 : claim.status === 'RECLAMADO' ? 2 : claim.status === 'CANJEADO' ? 3 : 1;
  const redeemed = claim?.status === 'CANJEADO';

  const cta = isOwner
    ? undefined
    : claim?.status === 'RECLAMADO'
      ? { title: 'Ver mi QR', onPress: () => router.push({ pathname: '/offer/claim', params: { claimId: claim.id, offerId: selected.id } }) }
      : redeemed
        ? undefined
        : { title: 'Reclamar', onPress: () => router.push({ pathname: '/offer/claim', params: { offerId: selected.id, entityId, title: selected.title } }) };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Ofertas</Text>
        {isOwner ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/offers', params: { entityId } })} hitSlop={8}>
            <Text style={styles.link}>Gestionar</Text>
          </Pressable>
        ) : null}
      </View>

      {list.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selScroll} contentContainerStyle={styles.sel} accessibilityRole="tablist">
          {list.map((o) => {
            const on = o.id === selected.id;
            const qr = claimOf(o.id)?.status === 'RECLAMADO';
            return (
              <Pressable
                key={o.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${o.title}, termina en ${shortLeft(new Date(o.ends_at).getTime() - now)}${qr ? ', con tu QR activo' : ''}`}
                onPress={() => setPicked(o.id)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <View style={[styles.dot, qr && styles.dotOn]} />
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{shortTitle(o.title)}</Text>
                <Text style={[styles.chipTime, on && styles.chipTextOn]}>{shortLeft(new Date(o.ends_at).getTime() - now)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {!isOwner ? (
        <View style={styles.steps} accessibilityLabel={`Ciclo de la oferta: ${STEPS[idx]}`}>
          {STEPS.map((step, i) => {
            const done = i < idx || (redeemed && i === 3);
            return (
              <View key={step} style={styles.step}>
                <View style={[styles.stepBar, done && (redeemed ? styles.stepOk : styles.stepDone), i === idx && !redeemed && styles.stepNow]} />
                <Text style={[styles.stepText, i === idx && styles.stepTextNow]}>{step}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <OfferTicket offer={selected} cta={cta} showPrice={false} />

      <View style={styles.indic}>
        {offerIndications(selected).map((row) => (
          <View key={row.label} style={styles.indicRow}>
            <Text style={styles.indicLabel}>{row.label}</Text>
            <Text style={styles.indicValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  link: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  selScroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  sel: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  chipTime: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.muted },
  chipTextOn: { color: colors.primaryDark },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.success },
  steps: { flexDirection: 'row', gap: 4 },
  step: { flex: 1, gap: 4, alignItems: 'center' },
  stepBar: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: colors.line },
  stepDone: { backgroundColor: colors.accentDark },
  stepNow: { backgroundColor: colors.accent },
  stepOk: { backgroundColor: colors.success },
  stepText: { fontSize: 10.5, fontFamily: fonts.ui.bold, color: colors.muted, textAlign: 'center' },
  stepTextNow: { color: colors.ink },
  indic: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  indicRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  indicLabel: { width: 96, fontSize: 11.5, fontFamily: fonts.ui.extrabold, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted },
  indicValue: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  ownerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  ownerLinkText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
});
