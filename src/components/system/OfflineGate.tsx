import { onlineManager } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@/components/Icon';
import { getConnectivity, offlineCopy, subscribeConnectivity, worksOffline } from '@/lib/connectivity';
import { checkConnectivityNow } from '@/api/connectivityRuntime';
import { colors, fonts, radius, spacing } from '@/theme';

/** Cada cuánto se vuelve a probar la conexión mientras no hay. */
const RETRY_MS = 4000;

/**
 * Sin conexión (2026-11-22): en vez de pantallas vacías, «Sin conexión a internet» de una vez. Tapa la pantalla
 * mientras no haya conexión y se quita sola cuando vuelve (las consultas se reanudan). En lo que sí sirve sin
 * conexión (la caja de Mi negocio, el QR de un canje) solo muestra una franja arriba.
 */
export function OfflineGate() {
  const state = useSyncExternalStore(subscribeConnectivity, getConnectivity, getConnectivity);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);

  // Las consultas se pausan sin conexión (no quedan en error) y se reanudan al volver.
  useEffect(() => {
    onlineManager.setOnline(state === 'online');
  }, [state]);

  // Mientras no haya conexión: probar cada pocos segundos y al volver la app al primer plano.
  useEffect(() => {
    if (state === 'online') return;
    const timer = setInterval(() => void checkConnectivityNow(), RETRY_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void checkConnectivityNow();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [state]);

  const copy = offlineCopy(state);
  if (!copy) return null;

  const retry = async () => {
    setChecking(true);
    try {
      await checkConnectivityNow();
    } finally {
      setChecking(false);
    }
  };

  if (worksOffline(pathname)) {
    return (
      <View pointerEvents="none" style={[styles.strip, { paddingTop: insets.top + 6 }]} accessibilityLiveRegion="polite">
        <Ionicons name="cloud-offline" size={16} color="#fff" />
        <Text style={styles.stripText}>{copy.title}. Lo que anotes se guarda y se envía después.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.cover, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal>
      <View style={styles.icon}>
        <Ionicons name={state === 'offline' ? 'cloud-offline' : 'wifi'} size={40} color={colors.primary} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {copy.title}
      </Text>
      <Text style={styles.body}>{copy.body}</Text>
      <Pressable accessibilityRole="button" onPress={() => void retry()} disabled={checking} style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}>
        {checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Reintentar</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  icon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', maxWidth: 320 },
  button: {
    marginTop: spacing.md,
    minWidth: 180,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  buttonText: { color: '#fff', fontSize: 16, fontFamily: fonts.ui.semibold },
  strip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.ink,
  },
  stripText: { color: '#fff', fontSize: 13, fontFamily: fonts.ui.semibold, flexShrink: 1 },
});
