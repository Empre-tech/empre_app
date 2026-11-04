import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { OfferClaim } from '@/api/types';
import { Button } from '@/components/Button';
import { ReviewAfterClaim } from '@/components/claim/ReviewAfterClaim';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { formatPesos } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  claim: OfferClaim;
  busy: boolean;
  message: string | null;
  onConfirm: () => void;
  /** Acaba de pasar frente a ti: el talón se desprende y cae el sello. Al volver después, ya está. */
  animate?: boolean;
}

/**
 * El negocio ya canjeó la oferta: el ticket sellado, lo que ahorraste y una pregunta que verifica el canje. Solo los
 * canjes confirmados cuentan para el ranking, así que este botón es la señal antifraude.
 */
export function ClaimRedeemed({ claim, busy, message, onConfirm, animate = false }: Props) {
  const router = useRouter();
  const offer = claim.offer;
  const verified = Boolean(claim.verified_by_client);
  const saving = offer?.reference_price && offer?.special_price && offer.reference_price > offer.special_price ? offer.reference_price - offer.special_price : 0;
  const when = claim.redeemed_at ? new Date(claim.redeemed_at) : null;
  const whenText = when ? `${when.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · ${when.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}` : '';

  const [stub] = useState(() => new Animated.Value(animate ? 0 : 1));
  const [stamp] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (!animate) return;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => true)
      .then((reduce) => {
        if (!live) return;
        if (reduce) {
          stub.setValue(1);
          stamp.setValue(1);
          return;
        }
        Animated.sequence([
          Animated.timing(stub, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.spring(stamp, { toValue: 1, friction: 6, useNativeDriver: true }),
        ]).start();
      });
    return () => {
      live = false;
    };
  }, [animate, stub, stamp]);

  return (
    <>
      <View style={styles.ticket}>
        {claim.entity_name ? <Text style={styles.biz}>{claim.entity_name}</Text> : null}
        <Text style={styles.offerName}>{offer?.title ?? 'Tu oferta'}</Text>
        <View style={styles.qrBox} accessible accessibilityLabel="Código canjeado, con el sello de Empre">
          <View style={styles.qrFaded}>
            <QRCode value={claim.id} size={150} color={colors.ink} backgroundColor="#ffffff" />
          </View>
          <Animated.View style={[styles.stamp, { opacity: stamp, transform: [{ scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.7, 1] }) }, { rotate: '-8deg' }] }]}>
            <EmpreSymbol product="offers" size={46} />
            <Text style={styles.stampText}>CANJEADO</Text>
          </Animated.View>
        </View>
        {animate ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.stub, { opacity: stub.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: stub.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) }, { rotate: stub.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '6deg'] }) }] }]}
          >
            <Text style={styles.stubText}>{claim.short_code}</Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.hero} accessibilityLiveRegion="polite">
        <Text style={styles.heroTitle}>{saving > 0 ? `Ahorraste ${formatPesos(saving)}` : '¡Listo, disfruta!'}</Text>
        <Text style={styles.heroText}>{[claim.entity_name, whenText].filter(Boolean).join(' · ')}</Text>
        <Pressable accessibilityRole="link" onPress={() => router.push('/salidas')} style={styles.link}>
          <Text style={styles.linkText}>En Mis salidas</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.ink} />
        </Pressable>
      </View>

      {verified ? (
        <View style={styles.thanks}>
          <Ionicons name="shield-checkmark" size={18} color="#075E62" />
          <Text style={styles.thanksText}>Gracias. Tu reseña contará como canje verificado.</Text>
        </View>
      ) : (
        <>
          <View style={styles.callout}>
            <Ionicons name="heart-outline" size={18} color={colors.accentInk} />
            <Text style={styles.calloutText}>
              <Text style={styles.bold}>¿Todo salió bien?</Text> Confirmar ayuda a que las ofertas reales suban en Destacados.
            </Text>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <Button title="Sí, me atendieron" onPress={onConfirm} loading={busy} />
        </>
      )}

      {verified && offer?.entity_id ? <ReviewAfterClaim entityId={offer.entity_id} claimId={claim.id} entityName={claim.entity_name} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  ticket: { alignItems: 'center', gap: 4, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  biz: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  offerName: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  qrBox: { marginTop: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  qrFaded: { opacity: 0.18 },
  stamp: { position: 'absolute', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 3, borderColor: colors.verified, backgroundColor: 'rgba(255,255,255,0.92)' },
  stampText: { fontSize: 14, letterSpacing: 1.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  stub: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 0, alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1.5, borderStyle: 'dashed', borderTopColor: colors.line },
  stubText: { fontSize: 16, letterSpacing: 2, fontFamily: fonts.ui.extrabold, color: colors.ink },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  hero: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.md },
  // 94 con el borde de 9 incluido: el círculo verde mide 76.
  heroTitle: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.sm },
  heroText: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted },
  callout: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md },
  calloutText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.ink },
  bold: { fontFamily: fonts.ui.extrabold },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.verifiedSoft, borderRadius: radius.md, padding: spacing.md },
  thanksText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.bold, color: '#0A6E6A' },
  message: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger, textAlign: 'center' },
});
