import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { track } from '@/analytics/track';
import { claimsApi } from '@/api/offers';
import type { Offer, OfferClaim } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { useActiveOffers } from '@/components/OfferBanner';
import { OfferTicket } from '@/components/offer/OfferTicket';
import { effectiveClaimStatus } from '@/lib/claims';
import { offerIndications } from '@/lib/discover';
import { offersHasAll, offersMode, offersShown } from '@/lib/profileLayout';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';
import { SectionHeader } from './SectionHeader';

interface Props {
  entityId: string;
  isOwner: boolean;
  /** Oferta con la que abrir la ficha (al venir de la franja del mapa): va primera y con sus condiciones abiertas. */
  initialOfferId?: string;
  /** «profile»: las reglas por cantidad del perfil; «all»: la lista completa apilada (pantalla «Todas las ofertas»). */
  variant?: 'profile' | 'all';
}

const STEPS = ['Ver oferta', 'Reclamar', 'Mostrar QR', 'Canjeada'];

/**
 * Las ofertas del perfil con el mismo formato que Fotos y Reseñas (maqueta `perfil_secciones.html`): 1, una tarjeta
 * completa con el ciclo; 2 o más, las 2 que terminan antes apiladas y, con más de 2, «Ver todas las ofertas» (sin
 * número). Orden y tope los pone el servidor (termina antes; a igualdad, más
 * cupos libres). Nunca muestra cuántas ofertas hay ni precios. Reclamar lleva a la pantalla del QR.
 */
export function OffersFicha({ entityId, isOwner, initialOfferId, variant = 'profile' }: Props) {
  const router = useRouter();
  const { status } = useAuth();
  const offers = useActiveOffers(entityId);
  const claims = useQuery({ queryKey: ['claims-mine'], queryFn: claimsApi.mine, enabled: status === 'signedIn' && !isOwner, staleTime: 30_000 });
  const now = useNow(30_000);
  const [open, setOpen] = useState<string | undefined>(initialOfferId);

  // La oferta pedida va primera; el resto, en el orden del servidor.
  const all = offers.data ?? [];
  const list = initialOfferId ? [...all].sort((a, b) => Number(b.id === initialOfferId) - Number(a.id === initialOfferId)) : all;
  const mode = variant === 'all' ? (list.length === 1 ? 'single' : 'stack') : offersMode(list.length);
  const shown = variant === 'all' ? list : list.slice(0, offersShown(list.length));

  // Medición: la primera oferta que se ve cuenta una vez al verla; no la del propio dueño.
  const viewedOfferId = open ?? list[0]?.id;
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
  const ctaFor = (o: Offer) => {
    if (isOwner) return undefined;
    const claim = claimOf(o.id);
    if (claim?.status === 'RECLAMADO') return { title: 'Ver mi QR', onPress: () => router.push({ pathname: '/offer/claim', params: { claimId: claim.id, offerId: o.id } }) };
    if (claim?.status === 'CANJEADO') return undefined;
    return { title: 'Reclamar', onPress: () => router.push({ pathname: '/offer/claim', params: { offerId: o.id, entityId, title: o.title } }) };
  };

  const stepsFor = (o: Offer) => {
    const claim = claimOf(o.id);
    const idx = !claim ? 1 : claim.status === 'RECLAMADO' ? 2 : claim.status === 'CANJEADO' ? 3 : 1;
    const redeemed = claim?.status === 'CANJEADO';
    return (
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
    );
  };

  const includes = (o: Offer) =>
    o.items && o.items.length > 0 ? (
      <Text style={styles.includes} accessibilityLabel={`Incluye: ${o.items.map((i) => i.name).join(', ')}`}>
        Incluye: {o.items.map((i) => i.name).join(' · ')}
      </Text>
    ) : null;

  const indications = (o: Offer) => (
    <View style={styles.indic}>
      {offerIndications(o).map((row) => (
        <View key={row.label} style={styles.indicRow}>
          <Text style={styles.indicLabel}>{row.label}</Text>
          <Text style={styles.indicValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );

  /** Una oferta completa; con una sola, con su ciclo y condiciones abiertas; con dos, condiciones desplegables. */
  const card = (o: Offer, how: 'single' | 'inline') => {
    const expanded = how === 'single' || open === o.id;
    return (
      <View key={o.id} style={{ gap: spacing.sm }}>
        {how === 'single' && !isOwner ? stepsFor(o) : null}
        <OfferTicket offer={o} cta={ctaFor(o)} />
        {includes(o)}
        {how === 'single' ? (
          indications(o)
        ) : (
          <>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? undefined : o.id)} style={styles.toggle}>
              <Text style={styles.toggleText}>{expanded ? 'Ocultar condiciones ⌃' : 'Ver condiciones ⌄'}</Text>
            </Pressable>
            {expanded ? indications(o) : null}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Ofertas" link={isOwner ? 'Gestionar' : null} onLink={() => router.push({ pathname: '/business/offers', params: { entityId } })} />

      {mode === 'single' ? card(shown[0], 'single') : <View style={styles.stack}>{shown.map((o) => card(o, 'inline'))}</View>}
      {variant === 'profile' && offersHasAll(list.length) ? (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/public-offers/[id]', params: { id: entityId } })} style={styles.allBtn}>
          <Text style={styles.allBtnText}>Ver todas las ofertas</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  stack: { gap: spacing.md },
  allBtn: { minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  allBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  toggle: { minHeight: 44, justifyContent: 'center' },
  toggleText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primary },
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
  includes: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  ownerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  ownerLinkText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
});
