import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RedeemResult } from '@/api/types';
import { claimsApi } from '@/api/offers';
import { Button } from '@/components/Button';
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
  const [error, setError] = useState<string | null>(null);
  const scanningRef = useRef(false);

  const applyResult = (res: RedeemResult) => {
    setResult(res);
    setError(null);
  };

  const onRedeemId = async (claimId: string) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await claimsApi.redeem(claimId);
      applyResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos validar el código');
    } finally {
      setLoading(false);
      // Pequeña pausa para no volver a escanear el mismo código al instante.
      setTimeout(() => (scanningRef.current = false), 1500);
    }
  };

  const onRedeemCode = async () => {
    const normalized = code.trim().toUpperCase();
    if (normalized.length < 4) {
      setError('Ingresa el código completo');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await claimsApi.redeemCode(normalized);
      applyResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos validar el código');
    } finally {
      setLoading(false);
    }
  };

  const clearResult = () => setResult(null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Escanear canje</Text>
        <View style={styles.modeToggle}>
          <Pressable onPress={() => setMode('scan')} style={[styles.modeBtn, mode === 'scan' && styles.modeBtnActive]}>
            <Text style={[styles.modeText, mode === 'scan' && styles.modeTextActive]}>Escáner</Text>
          </Pressable>
          <Pressable onPress={() => setMode('manual')} style={[styles.modeBtn, mode === 'manual' && styles.modeBtnActive]}>
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
                    if (data) onRedeemId(data);
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

        {result ? (
          <View style={[styles.result, result.valid ? styles.resultOk : styles.resultBad]}>
            <Ionicons
              name={result.valid ? 'checkmark-circle' : 'close-circle'}
              size={40}
              color={result.valid ? colors.success : colors.danger}
            />
            <Text style={styles.resultTitle}>{result.valid ? 'Válido' : 'No válido'}</Text>
            {result.valid ? (
              <>
                <Text style={styles.resultLine}>{result.offer_title}</Text>
                <Text style={styles.resultMuted}>Cliente: {result.client_name}</Text>
                <Text style={styles.resultMuted}>Negocio: {result.entity_name}</Text>
              </>
            ) : (
              <Text style={styles.resultMuted}>{result.reason}</Text>
            )}
            <Button title="Escanear otro" variant="secondary" onPress={clearResult} style={styles.again} />
          </View>
        ) : null}
      </ScrollView>
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
  result: { marginTop: spacing.md, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.xs, borderWidth: 1 },
  resultOk: { backgroundColor: colors.verifiedSoft, borderColor: colors.verified },
  resultBad: { backgroundColor: colors.bg, borderColor: colors.line },
  resultTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  resultLine: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink, textAlign: 'center' },
  resultMuted: { fontSize: 14, fontFamily: fonts.ui.regular, color: colors.muted, textAlign: 'center' },
  again: { marginTop: spacing.sm },
});
