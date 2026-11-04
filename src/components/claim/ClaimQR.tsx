import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { ClaimStatus, EntityDetail as Entity, OfferClaim } from '@/api/types';
import { Button } from '@/components/Button';
import { ClaimTicket } from '@/components/claim/ClaimTicket';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { colors, fonts } from '@/theme';

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
  entity?: Entity | null;
  onDirections?: () => void;
  onCancel: () => void;
  onClaimAgain: () => void;
  onSeeOthers: () => void;
}

/** h:mm:ss o mm:ss del tiempo que queda. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** El ticket con su QR, la cuenta regresiva, el código para dictar y el talón. También su versión sellada (vencido o cancelado). */
export function ClaimQR({ claim, status, now, saved, message, busy, entity, onDirections, onCancel, onClaimAgain, onSeeOthers }: Props) {
  const active = status === 'RECLAMADO';
  const msLeft = new Date(claim.expires_at).getTime() - now;
  const hot = msLeft < 60_000;

  return (
    <>
      <ClaimTicket
        claim={claim}
        entity={entity}
        dim={!active}
        stub={
          active ? (
            <View style={styles.stubRow}>
              <View style={styles.stubText}>
                <Text style={styles.stubTitle}>Muéstralo en la caja</Text>
                <View style={styles.waitRow}>
                  <View style={styles.waitDot} />
                  <Text style={styles.waitText}>Esperando al negocio</Text>
                </View>
              </View>
              <EmpreSymbol product="offers" size={34} />
            </View>
          ) : (
            <View style={styles.stubRow}>
              <View style={styles.stamp}>
                <Text style={styles.stampText}>{status === 'CANCELADO' ? 'CANCELADO' : 'VENCIDO'}</Text>
              </View>
            </View>
          )
        }
      >
        <View style={[styles.qr, !active && styles.qrOff]}>
          {/* El QR lleva el id del reclamo; el escáner del negocio lo valida en el servidor. */}
          <QRCode value={claim.id} size={168} color={colors.ink} backgroundColor="#ffffff" />
        </View>
        {active ? (
          <View style={styles.codeRow}>
            <Text style={styles.code} accessibilityLabel={`Código ${claim.short_code.split('').join(' ')}`}>
              {claim.short_code}
            </Text>
            <View style={[styles.left, hot && styles.leftHot]} accessibilityLiveRegion={hot ? 'polite' : 'none'}>
              <Text style={[styles.leftText, hot && styles.leftTextHot]}>{hot ? `¡${countdown(msLeft)}! Ve a caja` : `Vence en ${countdown(msLeft)}`}</Text>
            </View>
          </View>
        ) : null}
      </ClaimTicket>

      {active ? (
        <Text style={styles.how}>
          El negocio escanea tu código. Cuando lo valide, el talón se desprende y queda tu sello de Empre.
          {saved ? ' Ya está guardado en tu teléfono, también sirve sin señal.' : ''}
        </Text>
      ) : (
        <Text style={styles.how}>{status === 'CANCELADO' ? 'Lo cancelaste y liberamos tu cupo. Si la oferta sigue vigente, puedes reclamarla otra vez.' : 'El código venció. No se cobró nada. Si la oferta sigue activa y quedan cupos, puedes reclamarla otra vez.'}</Text>
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {active ? (
        <>
          {onDirections ? <Button title="Cómo llegar" variant="secondary" onPress={onDirections} /> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={[styles.cancelBtn, busy && { opacity: 0.55 }]}>
            <Text style={styles.cancel}>Cancelar reclamo y liberar mi cupo</Text>
          </Pressable>
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

const styles = StyleSheet.create({
  qr: { padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, backgroundColor: '#fff' },
  qrOff: { opacity: 0.3 },
  codeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  code: { fontSize: 15, letterSpacing: 2.1, fontFamily: fonts.ui.extrabold, color: colors.ink },
  left: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.accentSoft },
  leftHot: { backgroundColor: colors.accent },
  leftText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  leftTextHot: { color: colors.ink },
  stubRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 16 },
  stubText: { gap: 3 },
  stubTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.verified },
  waitText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.verified },
  stamp: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, borderWidth: 2.5, borderColor: colors.faint },
  stampText: { fontSize: 14, letterSpacing: 2.2, fontFamily: fonts.ui.extrabold, color: colors.faint },
  how: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.faint, textAlign: 'center' },
  message: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger, textAlign: 'center' },
  cancelBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancel: { textAlign: 'center', fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.danger },
});
