import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RedeemResult } from '@/api/types';
import { ApiError } from '@/api/client';
import { claimsApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { RedeemResultView } from '@/components/RedeemResultView';
import { TextField } from '@/components/TextField';
import { colors, fonts, radius, spacing } from '@/theme';

type Mode = 'scan' | 'manual';

/**
 * Escáner del negocio: cámara para leer el QR del cliente (cuyo contenido es
 * el id del reclamo) o entrada manual del código corto. La validación siempre
 * ocurre en el servidor.
 */
export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('scan');

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ data: string; at: number } | null>(null);
  const lastAttemptRef = useRef<(() => Promise<RedeemResult>) | null>(null);

  // Un rechazo es un resultado normal (HTTP 200, valid=false) y se muestra
  // igual que un canje. Solo "sin conexión" y los fallos reales son otra cosa.
  const run = async (attempt: () => Promise<RedeemResult>) => {
    lastAttemptRef.current = attempt;
    setLoading(true);
    setError(null);
    setResult(null);
    setOffline(false);
    try {
      setResult(await attempt());
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setOffline(true);
      else setError(e instanceof Error ? e.message : 'No pudimos validar el código');
    } finally {
      setLoading(false);
    }
  };

  const onScan = (claimId: string) => {
    // Con un resultado en pantalla la cámara sigue activa debajo: sin esta
    // guarda volvería a leer el mismo QR y taparía el canje con "ya canjeado".
    if (busyRef.current || result || offline) return;
    const last = lastScanRef.current;
    if (last && last.data === claimId && Date.now() - last.at < 4000) return;
    lastScanRef.current = { data: claimId, at: Date.now() };
    busyRef.current = true;
    void run(() => claimsApi.redeem(claimId)).finally(() => {
      busyRef.current = false;
    });
  };

  const onRedeemCode = () => {
    const normalized = code.trim().toUpperCase();
    if (normalized.length < 4) {
      setError('Ingresa el código completo');
      return;
    }
    void run(() => claimsApi.redeemCode(normalized));
  };

  const onRetry = () => {
    const attempt = lastAttemptRef.current;
    if (attempt) void run(attempt);
  };

  const onNext = () => {
    setResult(null);
    setOffline(false);
    setError(null);
    setCode('');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Escanear canje</Text>
        <View style={styles.modeToggle} accessibilityRole="tablist">
          <Pressable accessibilityRole="tab" accessibilityLabel="Usar escáner" accessibilityState={{ selected: mode === 'scan' }} hitSlop={{ top: 8, bottom: 8 }} onPress={() => setMode('scan')} style={[styles.modeBtn, mode === 'scan' && styles.modeBtnActive]}>
            <Text style={[styles.modeText, mode === 'scan' && styles.modeTextActive]}>Escáner</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityLabel="Escribir código a mano" accessibilityState={{ selected: mode === 'manual' }} hitSlop={{ top: 8, bottom: 8 }} onPress={() => setMode('manual')} style={[styles.modeBtn, mode === 'manual' && styles.modeBtnActive]}>
            <Text style={[styles.modeText, mode === 'manual' && styles.modeTextActive]}>Manual</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {mode === 'scan' ? (
          <View style={styles.cameraWrap}>
            {permission?.granted ? (
              <>
                <CameraView
                  style={styles.camera}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => {
                    if (data) onScan(data);
                  }}
                />
                <View style={styles.overlay}>
                  <Ionicons name="scan-outline" size={64} color="#fff" />
                </View>
              </>
            ) : (
              <View style={styles.permissionBox}>
                <Text style={styles.permissionText}>Necesitamos acceso a la cámara para escanear el QR del cliente.</Text>
                <Button title="Permitir cámara" onPress={() => void requestPermission()} />
              </View>
            )}
          </View>
        ) : (
          <TextField
            label="Código corto"
            placeholder="ABC123"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={styles.codeInput}
          />
        )}

        {loading ? <Text style={styles.hint}>Validando…</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {mode === 'manual' ? <Button title="Canjear" onPress={onRedeemCode} loading={loading} /> : null}

      </ScrollView>

      <RedeemResultView result={result} offline={offline} onNext={onNext} onRetry={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink },
  modeToggle: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, padding: 2 },
  modeBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  modeBtnActive: { backgroundColor: colors.primary },
  modeText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  modeTextActive: { color: '#fff' },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  cameraWrap: { height: 360, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.ink },
  camera: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.12)' },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  permissionText: { fontSize: 14, fontFamily: fonts.ui.regular, color: '#fff', textAlign: 'center' },
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8 },
  hint: { fontSize: 14, fontFamily: fonts.ui.regular, color: colors.muted, textAlign: 'center' },
  error: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.danger, textAlign: 'center' },
});
