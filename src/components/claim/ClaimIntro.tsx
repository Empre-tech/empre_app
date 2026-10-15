import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { Offer } from '@/api/types';
import { Button } from '@/components/Button';
import { OfferTicket } from '@/components/offer/OfferTicket';
import { formatWindow } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  offer: Offer;
  /** Hay sesión iniciada; sin ella se pide entrar antes de reclamar. */
  signedIn: boolean;
  claiming: boolean;
  /** Mensaje de un intento anterior (error del servidor, reclamo cancelado…). */
  message: string | null;
  onClaim: () => void;
  onSignIn: () => void;
}

/** Contenido de la pantalla antes de reclamar: la oferta, cómo funciona y las reglas. */
export function ClaimIntro({ offer, signedIn, claiming, message, onClaim, onSignIn }: Props) {
  const window = offer.claim_window_minutes ? formatWindow(offer.claim_window_minutes) : null;
  const daily = offer.repeat_policy === 'daily';

  return (
    <>
      <OfferTicket offer={offer} />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cómo funciona</Text>
        <Step n={1}>
          <Text style={styles.bold}>Reclamas</Text> y te reservamos un cupo.
        </Step>
        <Step n={2}>
          <Text style={styles.bold}>Vas al negocio</Text> antes de que venza.
        </Step>
        <Step n={3}>
          <Text style={styles.bold}>Muestras tu QR</Text> a quien te atiende. Ellos lo escanean, tú no.
        </Step>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Antes de reclamar</Text>
        <Rule icon="time-outline">
          {window ? (
            <>
              Tendrás <Text style={styles.bold}>{window}</Text> para canjear desde que reclames.
            </>
          ) : (
            'Tendrás un tiempo limitado para canjear desde que reclames.'
          )}
        </Rule>
        <Rule icon="person-outline">
          <Text style={styles.bold}>{daily ? 'Una por persona al día.' : 'Una por persona.'}</Text>
        </Rule>
        {offer.conditions ? (
          <Rule icon="warning-outline" warn>
            Condición del negocio: <Text style={styles.bold}>{offer.conditions}</Text>
          </Rule>
        ) : null}
        {offer.radius_meters > 0 ? (
          <Rule icon="location-outline">
            Debes estar a <Text style={styles.bold}>menos de {offer.radius_meters} m</Text> del negocio.
          </Rule>
        ) : null}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.cta}>
        {signedIn ? (
          <>
            <Button title="Reclamar mi cupo" onPress={onClaim} loading={claiming} disabled={offer.slots_left <= 0} />
            <Text style={styles.ctaHint}>
              {offer.slots_left <= 0
                ? 'Esta oferta ya no tiene cupos.'
                : `Reservas 1 de los ${offer.slots_left} cupos${window ? ` por ${window}` : ''}`}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.ctaHint}>Inicia sesión para reclamar esta oferta.</Text>
            <Button title="Iniciar sesión" onPress={onSignIn} />
          </>
        )}
      </View>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{n}</Text>
      </View>
      <Text style={styles.rowText}>{children}</Text>
    </View>
  );
}

function Rule({ icon, warn = false, children }: { icon: keyof typeof Ionicons.glyphMap; warn?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={17} color={warn ? colors.accentInk : colors.primary} style={styles.ruleIcon} />
      <Text style={styles.rowText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.ink },
  bold: { fontFamily: fonts.ui.extrabold },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 12.5, fontFamily: fonts.display.bold, color: colors.primaryDark },
  ruleIcon: { marginTop: 1, width: 24, textAlign: 'center' },
  message: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger, textAlign: 'center' },
  cta: { gap: spacing.sm, paddingTop: spacing.xs },
  ctaHint: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center' },
});
