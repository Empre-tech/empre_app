import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { EntityDetail as Entity, OfferClaim } from '@/api/types';
import { ClaimTicket } from '@/components/claim/ClaimTicket';
import { ReviewAfterClaim } from '@/components/claim/ReviewAfterClaim';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { formatPesos } from '@/lib/ledger';
import { colors, fonts, softShadow } from '@/theme';
import { planHour } from '@/lib/plans';

interface Props {
  claim: OfferClaim;
  entity?: Entity | null;
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
export function ClaimRedeemed({ claim, entity, busy, message, onConfirm, animate = false }: Props) {
  const router = useRouter();
  const offer = claim.offer;
  const verified = Boolean(claim.verified_by_client);
  const saving = offer?.reference_price && offer?.special_price && offer.reference_price > offer.special_price ? offer.reference_price - offer.special_price : 0;
  const when = claim.redeemed_at ? new Date(claim.redeemed_at) : null;
  const whenText = when ? `${when.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · ${planHour(when.getTime())}` : '';

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
      <ClaimTicket claim={claim} entity={entity}>
        <View style={styles.qrBox} accessible accessibilityLabel="Código canjeado, con el sello de Empre">
          <View style={styles.qrFaded}>
            <QRCode value={claim.id} size={168} color={colors.ink} backgroundColor="#ffffff" />
          </View>
          <Animated.View style={[styles.disc, { opacity: stamp, transform: [{ scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.7, 1] }) }] }]}>
            <EmpreSymbol product="offers" size={56} />
          </Animated.View>
        </View>
        <Animated.View style={[styles.stamp, { opacity: stamp, transform: [{ rotate: '-4deg' }] }]}>
          <Text style={styles.stampText}>CANJEADO</Text>
        </Animated.View>
        {animate ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.stub, { opacity: stub.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: stub.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) }, { rotate: stub.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '6deg'] }) }] }]}
          >
            <Text style={styles.stubText}>Muéstralo en la caja</Text>
          </Animated.View>
        ) : null}
      </ClaimTicket>

      <View style={styles.saved} accessibilityLiveRegion="polite">
        <View style={styles.savedText}>
          <Text style={styles.savedTitle}>{saving > 0 ? `Ahorraste ${formatPesos(saving)}` : '¡Listo, disfruta!'}</Text>
          <Text style={styles.savedSub}>{[claim.entity_name, whenText].filter(Boolean).join(' · ')}</Text>
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.push('/salidas')} style={styles.link}>
          <Text style={styles.linkText}>En Mis salidas ›</Text>
        </Pressable>
      </View>

      {verified ? (
        <Text style={styles.thanks}>Gracias. Tu reseña contará como canje verificado.</Text>
      ) : (
        <>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={onConfirm} style={[styles.confirm, busy && { opacity: 0.6 }]}>
            <Text style={styles.confirmText}>Sí, me atendieron</Text>
          </Pressable>
        </>
      )}

      {verified && offer?.entity_id ? <ReviewAfterClaim entityId={offer.entity_id} claimId={claim.id} entityName={claim.entity_name} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  qrBox: { alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline },
  qrFaded: { opacity: 0.18 },
  disc: { position: 'absolute', width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  stamp: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 8, borderWidth: 2.5, borderColor: colors.verified },
  stampText: { fontSize: 16, letterSpacing: 2.6, fontFamily: fonts.ui.extrabold, color: colors.verified },
  stub: { position: 'absolute', left: 0, right: 0, bottom: -6, alignItems: 'center', paddingVertical: 6, borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: colors.line, backgroundColor: colors.surface },
  stubText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  savedText: { flex: 1, minWidth: 0, gap: 2 },
  savedTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  savedSub: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.faint },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  confirm: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary },
  confirmText: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: '#fff' },
  thanks: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.verifiedSoft, fontSize: 14.5, fontFamily: fonts.ui.bold, color: colors.verified, textAlign: 'center' },
  message: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger, textAlign: 'center' },
});
