import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RedeemResult } from '@/api/types';
import { Button } from '@/components/Button';
import { RedeemResultView } from '@/components/RedeemResultView';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { colors, fonts, radius, spacing } from '@/theme';

const OK: RedeemResult = { valid: true, offer_title: 'Corte + arreglo de barba', offer_price: '25000', client_name: 'Cliente de práctica' };
const USED: RedeemResult = { valid: false, reason_code: 'ALREADY_REDEEMED', offer_title: 'Corte + arreglo de barba', redeemed_at: new Date(Date.now() - 10 * 60_000).toISOString() };

/**
 * Canje en modo práctica: el mismo resultado que verás con un cliente, con un código de práctica. Nada sale del
 * teléfono: no se registra ninguna venta ni se toca el inventario.
 */
export default function PracticeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const scan = (r: RedeemResult) => {
    setChecking(true);
    timer.current = setTimeout(() => {
      setChecking(false);
      setResult(r);
    }, 900);
  };

  if (done) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Canjear ofertas" />
        <View style={styles.center}>
          <View style={styles.okIcon}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Ya sabes canjear
          </Text>
          <Text style={styles.body}>Cuando llegue un cliente real, es exactamente igual.</Text>
          <View style={styles.actions}>
            <Button title="Listo" onPress={() => router.back()} />
            <Button
              title="Practicar otra vez"
              variant="ghost"
              onPress={() => {
                setDone(false);
                setResult(null);
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Canjear ofertas" />
      <View style={styles.banner}>
        <Ionicons name="school-outline" size={16} color={colors.ink} />
        <Text style={styles.bannerText}>PRÁCTICA · NO CUENTA COMO VENTA</Text>
      </View>
      <View style={[styles.body2, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.camera}>
          {checking ? (
            <View style={styles.checking} accessibilityLiveRegion="polite">
              <ActivityIndicator color="#fff" />
              <Text style={styles.cameraText}>Validando con Empre</Text>
            </View>
          ) : (
            <>
              <Ionicons name="scan-outline" size={72} color="#fff" />
              <Text style={styles.cameraText}>Aquí apuntas al QR del cliente. Lo validamos antes de mostrar nada.</Text>
            </>
          )}
        </View>
        <Button title="Escanear el QR de práctica" disabled={checking} onPress={() => scan(OK)} />
        <Button title="Practicar un código ya usado" variant="secondary" disabled={checking} onPress={() => scan(USED)} />
      </View>
      <RedeemResultView
        result={result}
        offline={false}
        practice
        onNext={() => {
          if (result?.valid) setDone(true);
          else setResult(null);
        }}
        onRetry={() => setResult(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 36, backgroundColor: colors.selectedSoft },
  bannerText: { fontSize: 12, letterSpacing: 0.6, fontFamily: fonts.ui.extrabold, color: colors.ink },
  body2: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  camera: { flex: 1, minHeight: 240, marginBottom: spacing.sm, padding: spacing.xl, gap: spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.ink },
  checking: { alignItems: 'center', gap: spacing.md },
  cameraText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.semibold, color: '#fff', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  okIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.verified, marginBottom: spacing.sm },
  title: { fontSize: 24, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
});
