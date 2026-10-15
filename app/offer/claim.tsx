import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { claimsApi } from '@/api/offers';
import type { OfferClaim } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { formatCurrency } from '@/lib/offer';
import { colors, fonts, radius, spacing } from '@/theme';

function countdownLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expirado';
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Pantalla de reclamo de una oferta. El usuario llega desde el perfil/portal
 * con `offerId`; al reclamar, el backend reserva un cupo y devuelve su QR
 * (token opaco) + código corto. Aquí mostramos el código corto como vía
 * principal de canje (el QR visual requiere la lib de QR, pendiente).
 */
export default function ClaimScreen() {
  const params = useLocalSearchParams<{ offerId: string; title?: string }>();
  const offerId = params.offerId ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();

  const [loading, setLoading] = useState(false);
  const [claim, setClaim] = useState<OfferClaim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expired = claim ? new Date(claim.expires_at).getTime() <= now : false;

  const remaining = useMemo(() => (claim ? countdownLabel(claim.expires_at) : ''), [claim, now]);

  // Nombre y ubicación del negocio para el contexto y "Cómo llegar".
  const entity = useQuery({
    queryKey: ['entity', claim?.offer?.entity_id],
    queryFn: () => entitiesApi.get(claim!.offer!.entity_id),
    enabled: Boolean(claim?.offer?.entity_id),
  });

  const onDirections = () => {
    const e = entity.data;
    if (!e) return;
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${e.latitude},${e.longitude}`);
  };

  const onClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await claimsApi.claim(offerId);
      setClaim(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos reclamar la oferta');
    } finally {
      setLoading(false);
    }
  };

  const onCancel = async () => {
    if (!claim) return;
    setLoading(true);
    try {
      await claimsApi.cancel(claim.id);
      setClaim(null);
      setError('Reclamo cancelado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cancelar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Button title="" variant="ghost" onPress={() => router.back()} style={styles.back} />
          <Ionicons name="arrow-back" size={22} color={colors.ink} style={styles.backIcon} />
          <Text style={styles.title}>{claim ? 'Tu oferta' : 'Reclamar oferta'}</Text>
        </View>

        {!claim ? (
          <>
            <Text style={styles.offerTitle}>{params.title ?? 'Oferta'}</Text>
            <Text style={styles.hint}>
              Al reclamar reservas un cupo por tiempo limitado. Presenta el código al negocio para canjearlo.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {status === 'signedIn' ? (
              <Button title="Reclamar oferta" onPress={onClaim} loading={loading} style={styles.cta} />
            ) : (
              <>
                <Text style={styles.hint}>Inicia sesión para reclamar esta oferta.</Text>
                <Button title="Iniciar sesión" onPress={() => router.push('/(auth)/login')} style={styles.cta} />
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.offerTitle}>{claim.offer?.title ?? ''}</Text>
            {claim.offer?.price ? <Text style={styles.price}>{formatCurrency(claim.offer.price)}</Text> : null}
            {claim.offer?.conditions ? <Text style={styles.note}>{claim.offer.conditions}</Text> : null}

            <View style={styles.codeCard}>
              <QRCode value={claim.id} size={180} color={colors.ink} backgroundColor="#ffffff" />
              <Text style={styles.codeLabel}>O CÓDIGO CORTO</Text>
              <Text style={styles.code}>{claim.short_code}</Text>
              <View style={styles.countdownRow}>
                <Ionicons name="time-outline" size={16} color={expired ? colors.danger : colors.accent} />
                <Text style={styles.countdown}>{expired ? 'Expirado' : `Vence en ${remaining}`}</Text>
              </View>
            </View>

            <Text style={styles.note}>Muestra este código en {entity.data?.name ?? 'el negocio'}.</Text>

            {entity.data ? (
              <Button title="Cómo llegar" variant="secondary" onPress={onDirections} />
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              title="Cancelar reclamo"
              variant="secondary"
              onPress={onCancel}
              loading={loading}
              disabled={expired}
              style={styles.cta}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, position: 'relative' },
  back: { position: 'absolute', left: 0, width: 44, minHeight: 44, paddingHorizontal: 0 },
  backIcon: { position: 'absolute', left: 10, zIndex: 1 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  offerTitle: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  price: { fontSize: 16, fontFamily: fonts.ui.semibold, color: colors.accent, textAlign: 'center' },
  hint: { fontSize: 14, fontFamily: fonts.ui.regular, color: colors.muted, textAlign: 'center' },
  error: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.danger, textAlign: 'center' },
  cta: { marginTop: spacing.sm },
  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  codeLabel: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.muted, letterSpacing: 1.5 },
  code: { fontSize: 40, fontFamily: fonts.display.bold, color: colors.ink, letterSpacing: 6 },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdown: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.accent },
  note: { fontSize: 13, fontFamily: fonts.ui.regular, color: colors.muted, textAlign: 'center' },
});
