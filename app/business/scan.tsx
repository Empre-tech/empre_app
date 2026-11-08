import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RedeemResult } from '@/api/types';
import { ApiError } from '@/api/client';
import { entitiesApi } from '@/api/endpoints';
import { claimsApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { RedeemResultView } from '@/components/RedeemResultView';
import { TextField } from '@/components/TextField';
import { colors, fonts, spacing } from '@/theme';

type Mode = 'scan' | 'manual';

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'EM';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/**
 * Escáner del negocio: cámara para leer el QR del cliente (cuyo contenido es
 * el id del reclamo) o entrada manual del código corto. La validación siempre
 * ocurre en el servidor.
 */
export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('scan');

  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBizId, setSelectedBizId] = useState<string | null>(null);
  const [bizPickerOpen, setBizPickerOpen] = useState(false);
  const [redeemedToday, setRedeemedToday] = useState<Record<string, number>>({});
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ data: string; at: number } | null>(null);
  const lastAttemptRef = useRef<(() => Promise<RedeemResult>) | null>(null);

  const mineQuery = useQuery({ queryKey: ['entities', 'mine'], queryFn: entitiesApi.mine, staleTime: 60_000 });
  const businesses = mineQuery.data ?? [];
  const activeBiz = businesses.find((b) => b.id === selectedBizId) ?? businesses[0] ?? null;

  // Línea de escaneo animada dentro del marco de enfoque
  const scanAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanAnim]);

  // Un rechazo es un resultado normal (HTTP 200, valid=false) y se muestra
  // igual que un canje. Solo "sin conexión" y los fallos reales son otra cosa.
  const run = async (attempt: () => Promise<RedeemResult>) => {
    lastAttemptRef.current = attempt;
    setLoading(true);
    setError(null);
    setResult(null);
    setOffline(false);
    try {
      const res = await attempt();
      setResult(res);
      if (res.valid) {
        const key = res.entity_id ?? activeBiz?.id ?? 'default';
        setRedeemedToday((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setOffline(true);
      else setError(e instanceof Error ? e.message : 'No pudimos validar el código');
    } finally {
      setLoading(false);
    }
  };

  const onScan = (claimId: string) => {
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

  const todayCount = activeBiz ? (redeemedToday[activeBiz.id] ?? 0) : (redeemedToday.default ?? 0);

  const scanning = mode === 'scan' && Boolean(permission?.granted);

  return (
    <View style={styles.screen}>
      {scanning ? <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => data && onScan(data)} /> : null}

      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <EmpreSymbol product="offers" size={32} />
        <View style={styles.headText}>
          <Text style={styles.title} accessibilityRole="header">
            Canjear ofertas
          </Text>
          {activeBiz ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Negocio activo: ${activeBiz.name}${businesses.length > 1 ? '. Toca para cambiar' : ''}`}
              disabled={businesses.length <= 1}
              onPress={() => setBizPickerOpen(true)}
              style={styles.bizLine}
            >
              <Text style={styles.bizName} numberOfLines={1}>
                {activeBiz.name} · <Text style={styles.bizMeta}>{todayCount === 1 ? '1 canje hoy' : `${todayCount} canjes hoy`}</Text>
              </Text>
              {businesses.length > 1 ? <Ionicons name="chevron-down" size={14} color="#D5DEEA" /> : null}
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {mode === 'scan' ? (
          permission?.granted ? (
            <>
              <Animated.View
                style={[
                  styles.frame,
                  {
                    transform: [
                      {
                        scale: loading
                          ? 0.94
                          : scanAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.035, 1] }),
                      },
                    ],
                  },
                ]}
                pointerEvents="none"
              >
                <View style={[styles.corner, styles.cornerTL, loading && { borderColor: '#2FD3C9' }]} />
                <View style={[styles.corner, styles.cornerTR, loading && { borderColor: '#2FD3C9' }]} />
                <View style={[styles.corner, styles.cornerBL, loading && { borderColor: '#2FD3C9' }]} />
                <View style={[styles.corner, styles.cornerBR, loading && { borderColor: '#2FD3C9' }]} />
                <Animated.View style={[styles.scanLine, loading && { backgroundColor: '#2FD3C9' }, { transform: [{ translateY: scanAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 232] }) }] }]} />
              </Animated.View>
              <View style={styles.camText}>
                <Text style={styles.camTitle}>{loading ? 'Revisando el código' : 'Escanea el código'}</Text>
                <Text style={styles.camSub}>{loading ? 'Validando con Empre' : 'Apunta al QR del cliente. Lo validamos antes de mostrar nada.'}</Text>
              </View>
            </>
          ) : (
            <View style={styles.camText}>
              <Text style={styles.camTitle}>Necesitamos la cámara</Text>
              <Text style={styles.camSub}>Con ella lees el QR del cliente. También puedes escribir su código.</Text>
              <Button title="Permitir cámara" onPress={() => void requestPermission()} />
            </View>
          )
        ) : (
          <View style={styles.manualCard}>
            <TextField label="Código corto del cliente" placeholder="ABC123" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={6} style={styles.codeInput} />
            <Text style={styles.manualHint}>Pídele al cliente los 6 caracteres que aparecen debajo de su código QR.</Text>
            {error ? <Text style={styles.errorLight}>{error}</Text> : null}
            <Button title="Canjear" onPress={onRedeemCode} loading={loading} />
          </View>
        )}
        {error && mode === 'scan' ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.foot, { paddingBottom: insets.bottom + 22 }]}>
        <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'scan' ? 'manual' : 'scan')} style={styles.switch}>
          <Ionicons name={mode === 'scan' ? 'keypad-outline' : 'scan-outline'} size={18} color="#fff" />
          <Text style={styles.switchText}>{mode === 'scan' ? 'Escribir el código' : 'Usar la cámara'}</Text>
        </Pressable>
      </View>

      <RedeemResultView
        result={result}
        offline={offline}
        onNext={onNext}
        onRetry={onRetry}
        onFinance={(entityId) => router.push({ pathname: '/business/ledger/[id]', params: { id: entityId } })}
      />

      <Modal visible={bizPickerOpen} transparent animationType="slide" onRequestClose={() => setBizPickerOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setBizPickerOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            ¿En qué negocio estás cobrando?
          </Text>
          {businesses.map((b) => {
            const on = b.id === activeBiz?.id;
            return (
              <Pressable
                key={b.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  setSelectedBizId(b.id);
                  setBizPickerOpen(false);
                }}
                style={[styles.bizOption, on && styles.bizOptionOn]}
              >
                <View style={styles.bizOptionIni}>
                  <Text style={styles.bizOptionIniText}>{initialsOf(b.name)}</Text>
                </View>
                <Text style={[styles.bizOptionName, on && { fontFamily: fonts.ui.extrabold }]} numberOfLines={1}>
                  {b.name}
                </Text>
                {on ? <Ionicons name="checkmark-circle" size={20} color={colors.verified} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const FOCUS_SIZE = 252;
const CORNER_SIZE = 30;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1A36' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: '#fff' },
  bizLine: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 4 },
  bizName: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: '#D5DEEA' },
  bizMeta: { fontFamily: fonts.ui.extrabold, color: '#2FD3C9' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 26, paddingHorizontal: 20, paddingVertical: 16 },
  frame: { width: FOCUS_SIZE, height: FOCUS_SIZE, borderRadius: 24 },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: '#fff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 20 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 20 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 20 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 20 },
  scanLine: { position: 'absolute', left: 14, right: 14, height: 2.5, borderRadius: 2, backgroundColor: '#2FD3C9' },
  camText: { alignSelf: 'stretch', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  camTitle: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display.bold, color: '#fff', textAlign: 'center' },
  camSub: { fontSize: 14.5, lineHeight: 21, fontFamily: fonts.ui.medium, color: '#D5DEEA', textAlign: 'center' },
  manualCard: { alignSelf: 'stretch', gap: 12, padding: 18, borderRadius: 20, backgroundColor: colors.surface },
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8 },
  manualHint: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: '#FFB4AE', textAlign: 'center' },
  errorLight: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger, textAlign: 'center' },
  foot: { paddingHorizontal: 20, paddingTop: 8 },
  switch: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)' },
  switchText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  veil: { flex: 1, backgroundColor: 'rgba(14,35,70,0.38)' },
  sheet: { gap: 8, paddingTop: 16, paddingHorizontal: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  sheetTitle: { fontSize: 20, lineHeight: 25, fontFamily: fonts.display.bold, color: colors.ink },
  bizOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  bizOptionOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  bizOptionIni: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  bizOptionIniText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#fff' },
  bizOptionName: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.bold, color: colors.ink },
});
