import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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

interface Props {
  entityId: string;
  isOwner: boolean;
  /** Oferta con la que abrir la ficha (al venir de la franja del mapa): va primera y con sus condiciones abiertas. */
  initialOfferId?: string;
  /** «profile»: las reglas por cantidad del perfil; «all»: la lista completa apilada (pantalla «Todas las ofertas»). */
  variant?: 'profile' | 'all';
}

const STEPS = ['Ver oferta', 'Reclamar', 'Mostrar QR', 'Canjeada'];
const CARD_WIDTH = 296;

/**
 * Las ofertas del perfil según cuántas haya (maqueta `perfil_final.html`): 1, una tarjeta completa con el ciclo; 2,
 * dos apiladas; 3 a 5, un carrusel de tarjetas con ajuste (las condiciones, en una hoja inferior); más de 5, las 5 que
 * terminan antes y «Ver todas las ofertas». Orden y tope los pone el servidor (termina antes; a igualdad, más
 * cupos libres). Nunca muestra cuántas ofertas hay ni precios. Reclamar lleva a la pantalla del QR.
 */
export function OffersFicha({ entityId, isOwner, initialOfferId, variant = 'profile' }: Props) {
  const router = useRouter();
  const { status } = useAuth();
  const { width } = useWindowDimensions();
  const offers = useActiveOffers(entityId);
  const claims = useQuery({ queryKey: ['claims-mine'], queryFn: claimsApi.mine, enabled: status === 'signedIn' && !isOwner, staleTime: 30_000 });
  const now = useNow(30_000);
  const [open, setOpen] = useState<string | undefined>(initialOfferId);
  const [sheetOffer, setSheetOffer] = useState<Offer | null>(null);

  // La oferta pedida va primera; el resto, en el orden del servidor.
  const all = offers.data ?? [];
  const list = initialOfferId ? [...all].sort((a, b) => Number(b.id === initialOfferId) - Number(a.id === initialOfferId)) : all;
  const mode = variant === 'all' ? (list.length > 0 ? 'stack' : 'none') : offersMode(list.length);
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

  /** Una oferta completa; las condiciones, desplegables o (en carrusel) en una hoja inferior. */
  const card = (o: Offer, how: 'single' | 'inline' | 'sheet') => {
    const expanded = how === 'single' || open === o.id;
    return (
      <View key={o.id} style={how === 'sheet' ? { width: CARD_WIDTH, gap: spacing.sm } : { gap: spacing.sm }}>
        {how === 'single' && !isOwner ? stepsFor(o) : null}
        <OfferTicket offer={o} cta={ctaFor(o)} />
        {includes(o)}
        {how === 'single' ? (
          indications(o)
        ) : how === 'inline' ? (
          <>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? undefined : o.id)} style={styles.toggle}>
              <Text style={styles.toggleText}>{expanded ? 'Ocultar condiciones ⌃' : 'Ver condiciones ⌄'}</Text>
            </Pressable>
            {expanded ? indications(o) : null}
          </>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver condiciones de ${o.title}`} onPress={() => setSheetOffer(o)} style={styles.toggle}>
            <Text style={styles.toggleText}>Ver condiciones ›</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          Ofertas
        </Text>
        {isOwner ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/offers', params: { entityId } })} hitSlop={8}>
            <Text style={styles.link}>Gestionar</Text>
          </Pressable>
        ) : null}
      </View>

      {mode === 'single' ? (
        card(shown[0], 'single')
      ) : mode === 'stack' ? (
        <View style={styles.stack}>{shown.map((o) => card(o, 'inline'))}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + spacing.md}
          decelerationRate="fast"
          contentContainerStyle={styles.carousel}
          style={styles.carouselScroll}
          accessibilityLabel="Ofertas, desliza para ver más"
        >
          {shown.map((o) => card(o, 'sheet'))}
          {offersHasAll(list.length) ? (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/public-offers/[id]', params: { id: entityId } })} style={styles.allCard}>
              <Text style={styles.allText}>Ver todas las ofertas ›</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={sheetOffer !== null} transparent animationType="slide" onRequestClose={() => setSheetOffer(null)}>
        <Pressable style={styles.scrim} onPress={() => setSheetOffer(null)} accessibilityLabel="Cerrar" accessibilityRole="button" />
        <View style={[styles.sheet, { maxWidth: Math.max(width, 320) }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Condiciones</Text>
          {sheetOffer ? (
            <>
              <Text style={styles.sheetOffer}>{sheetOffer.title}</Text>
              {indications(sheetOffer)}
            </>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => setSheetOffer(null)} style={styles.sheetBtn}>
            <Text style={styles.sheetBtnText}>Entendido</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  link: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  stack: { gap: spacing.md },
  carouselScroll: { flexGrow: 0, marginHorizontal: -spacing.md },
  carousel: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.md },
  allCard: { width: 150, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  allText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark, textAlign: 'center' },
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
  scrim: { flex: 1, backgroundColor: 'rgba(10,20,40,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg + 2, borderTopRightRadius: radius.lg + 2, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.xs },
  sheetTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  sheetOffer: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  sheetBtn: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  sheetBtnText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
