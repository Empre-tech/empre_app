import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { ClaimStatus, OfferClaim } from '@/api/types';
import { Button } from '@/components/Button';
import { formatClock, formatCurrency } from '@/lib/offer';
import { alpha, colors, fonts, radius, spacing } from '@/theme';

interface Props {
  claim: OfferClaim;
  /** Estado efectivo: RECLAMADO (activo), EXPIRADO o CANCELADO. */
  status: ClaimStatus;
  now: number;
  /** El QR quedó guardado en el teléfono (se puede mostrar sin conexión). */
  saved: boolean;
  /** Mensaje de una acción anterior (error al cancelar, etc.). */
  message: string | null;
  busy: boolean;
  onDirections?: () => void;
  onCancel: () => void;
  onClaimAgain: () => void;
  onSeeOthers: () => void;
}

/** mm:ss del tiempo que queda. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** QR del reclamo, con su cuenta regresiva, el código para dictar y qué hacer. También su versión apagada (vencido o cancelado). */
export function ClaimQR({ claim, status, now, saved, message, busy, onDirections, onCancel, onClaimAgain, onSeeOthers }: Props) {
  const active = status === 'RECLAMADO';
  const msLeft = new Date(claim.expires_at).getTime() - now;
  const offer = claim.offer;
  const price = formatCurrency(offer?.price);

  // El cronómetro cambia con el tiempo: calma, aviso (< 5 min) y último minuto.
  const pill = !active ? styles.pillOff : msLeft < 60_000 ? styles.pillHot : msLeft < 5 * 60_000 ? styles.pillWarn : styles.pillCalm;
  const pillText = !active ? styles.pillTextOff : msLeft < 60_000 ? styles.pillTextHot : msLeft < 5 * 60_000 ? styles.pillTextWarn : styles.pillTextCalm;

  const banner = active
    ? { text: 'Cupo reservado a tu nombre', icon: 'checkmark' as const, style: styles.bannerOk, color: colors.successInk }
    : status === 'CANCELADO'
      ? { text: 'Cancelaste este reclamo', icon: 'close' as const, style: styles.bannerOff, color: colors.inkSoft }
      : { text: `Venció a las ${formatClock(claim.expires_at)}`, icon: 'time-outline' as const, style: styles.bannerOff, color: colors.inkSoft };

  return (
    <>
      <View style={[styles.banner, banner.style]}>
        <Ionicons name={banner.icon} size={16} color={banner.color} />
        <Text style={[styles.bannerText, { color: banner.color }]}>{banner.text}</Text>
      </View>

      <View style={styles.card}>
        <Text style={[styles.offerTitle, !active && styles.dim]} numberOfLines={2}>
          {offer?.title ?? 'Tu oferta'}
          {price ? ` · ${price}` : ''}
        </Text>
        {claim.entity_name ? <Text style={styles.business}>{claim.entity_name}</Text> : null}

        <View style={styles.qrFrame}>
          <View style={[styles.qrBox, !active && styles.qrBoxOff]}>
            {/* El QR lleva el id del reclamo; el escáner del negocio lo valida en el servidor. */}
            <QRCode value={claim.id} size={176} color={colors.ink} backgroundColor={colors.white} />
            {!active ? (
              <View style={styles.qrOverlay}>
                <Text style={styles.qrOverlayText}>{status === 'CANCELADO' ? 'Cancelado' : 'Venció'}</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.corner, styles.cornerTL, !active && styles.cornerOff]} />
          <View style={[styles.corner, styles.cornerTR, !active && styles.cornerOff]} />
          <View style={[styles.corner, styles.cornerBL, !active && styles.cornerOff]} />
          <View style={[styles.corner, styles.cornerBR, !active && styles.cornerOff]} />
        </View>

        <View style={styles.pillRow}>
          <View style={[styles.pill, pill]}>
            <Text style={[styles.pillText, pillText]}>
              {active ? (msLeft < 60_000 ? `¡${countdown(msLeft)}! Ve a caja` : `Vence en ${countdown(msLeft)}`) : 'No se puede usar'}
            </Text>
          </View>
          {active ? <Text style={styles.until}>hasta las {formatClock(claim.expires_at)}</Text> : null}
        </View>

        {active ? (
          <View style={styles.shortWrap}>
            <Text style={styles.shortLabel}>¿NO ESCANEA? DICTA EL CÓDIGO</Text>
            <Text style={styles.shortCode} accessibilityLabel={`Código ${claim.short_code.split('').join(' ')}`}>
              {claim.short_code}
            </Text>
          </View>
        ) : null}

        {active && saved ? (
          <View style={styles.savedChip}>
            <Ionicons name="checkmark" size={12} color={colors.verifiedInk} />
            <Text style={styles.savedChipText}>Guardado en tu teléfono</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.callout, !active && styles.calloutWarn]}>
        <Ionicons name="information-circle-outline" size={18} color={active ? colors.primary : colors.accentInk} />
        <Text style={styles.calloutText}>
          {active ? (
            <>
              <Text style={styles.bold}>Muéstralo en caja.</Text> Quien te atiende lo escanea. Se usa{' '}
              <Text style={styles.bold}>una sola vez</Text>: si alguien lo escanea antes, deja de valer.
            </>
          ) : (
            <>
              <Text style={styles.bold}>Liberamos tu cupo</Text> para otra persona. Si la oferta sigue activa y quedan cupos, puedes reclamar de nuevo.
            </>
          )}
        </Text>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {active ? (
        <>
          {onDirections ? <Button title="Cómo llegar" variant="secondary" onPress={onDirections} /> : null}
          <Text
            accessibilityRole="button"
            onPress={busy ? undefined : onCancel}
            style={[styles.cancel, busy && styles.dim]}
          >
            Cancelar reclamo y liberar mi cupo
          </Text>
        </>
      ) : (
        <>
          <Button title="Reclamar de nuevo" onPress={onClaimAgain} loading={busy} />
          <Button title="Ver otras ofertas cerca" variant="secondary" onPress={onSeeOthers} />
        </>
      )}
    </>
  );
}

const CORNER = 24;

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9 },
  bannerOk: { backgroundColor: colors.successSoft },
  bannerOff: { backgroundColor: colors.surfaceAlt },
  bannerText: { fontSize: 13, fontFamily: fonts.ui.extrabold, flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg + 2, padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  offerTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  business: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: -4 },
  dim: { opacity: 0.55 },
  qrFrame: { marginVertical: spacing.sm, padding: 6 },
  qrBox: { backgroundColor: colors.white, padding: 10, borderRadius: radius.md },
  qrBoxOff: { opacity: 0.35 },
  qrOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  qrOverlayText: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.inkSoft, backgroundColor: alpha(colors.white, 0.9), paddingHorizontal: 14, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' },
  // Esquinas del marco: el QR se ve como algo que se apunta con la cámara.
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.primary },
  cornerOff: { borderColor: colors.mutedLight },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  pillRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  pillCalm: { backgroundColor: colors.primarySoft },
  pillWarn: { backgroundColor: colors.accentSoft },
  pillHot: { backgroundColor: colors.accent },
  pillOff: { backgroundColor: colors.surfaceAlt },
  pillText: { fontSize: 13, fontFamily: fonts.ui.extrabold },
  pillTextCalm: { color: colors.primaryDark },
  pillTextWarn: { color: colors.accentInk },
  pillTextHot: { color: colors.ink },
  pillTextOff: { color: colors.inkSoft },
  until: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  shortWrap: { alignSelf: 'stretch', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, borderStyle: 'dashed', paddingTop: spacing.sm, marginTop: spacing.xs },
  shortLabel: { fontSize: 10.5, fontFamily: fonts.ui.bold, letterSpacing: 0.9, color: colors.muted },
  shortCode: { fontSize: 30, fontFamily: fonts.display.bold, letterSpacing: 8, color: colors.ink },
  savedChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.verifiedSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  savedChipText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.verifiedInk },
  callout: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md },
  calloutWarn: { backgroundColor: colors.accentSoft },
  calloutText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.ink },
  bold: { fontFamily: fonts.ui.extrabold },
  message: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger, textAlign: 'center' },
  cancel: { textAlign: 'center', fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.dangerInk, paddingVertical: spacing.sm },
});
