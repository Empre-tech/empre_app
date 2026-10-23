import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { OfferClaim } from '@/api/types';
import { Button } from '@/components/Button';
import { ReviewAfterClaim } from '@/components/claim/ReviewAfterClaim';
import { formatClock, formatCurrency } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  claim: OfferClaim;
  busy: boolean;
  message: string | null;
  onConfirm: () => void;
}

/**
 * El negocio ya canjeó la oferta: comprobante y una pregunta que verifica el
 * canje («¿Te atendieron?»). Solo los canjes confirmados cuentan para el
 * ranking, así que este botón es la señal antifraude.
 */
export function ClaimRedeemed({ claim, busy, message, onConfirm }: Props) {
  const offer = claim.offer;
  const price = formatCurrency(offer?.price);
  const normal = formatCurrency(offer?.normal_price);
  const verified = Boolean(claim.verified_by_client);

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.check}>
          <Ionicons name="checkmark" size={38} color={colors.white} />
        </View>
        <Text style={styles.heroTitle}>¡Listo, disfruta!</Text>
        {claim.entity_name ? <Text style={styles.heroText}>{claim.entity_name} validó tu oferta.</Text> : null}
      </View>

      <View style={styles.receipt}>
        <Row label="Oferta" value={offer?.title ?? '—'} />
        {price ? <Row label="Precio" value={normal ? `${price}  (antes ${normal})` : price} /> : null}
        <Row label="Canjeado" value={claim.redeemed_at ? `Hoy, ${formatClock(claim.redeemed_at)}` : 'Hoy'} />
        {claim.entity_name ? <Row label="Atendió" value={claim.entity_name} /> : null}
      </View>

      {verified ? (
        <View style={styles.thanks}>
          <Ionicons name="shield-checkmark" size={18} color={colors.verifiedInk} />
          <Text style={styles.thanksText}>Gracias por confirmar: tu canje quedó verificado.</Text>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.md },
  // 94 con el borde de 9 incluido: el círculo verde mide 76.
  check: { width: 94, height: 94, borderRadius: 47, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', borderWidth: 9, borderColor: colors.successSoft },
  heroTitle: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.sm },
  heroText: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted },
  receipt: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowLabel: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  rowValue: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'right' },
  callout: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md },
  calloutText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.ink },
  bold: { fontFamily: fonts.ui.extrabold },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.verifiedSoft, borderRadius: radius.md, padding: spacing.md },
  thanksText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.bold, color: colors.verifiedInk },
  message: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger, textAlign: 'center' },
});
