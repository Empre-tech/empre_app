import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isOffline, OFFLINE_NOTICE_DELAY_MS, subscribeConnection } from '@/lib/connection';
import { colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';

/**
 * Aviso «Sin conexión» (plan de experiencia, fase 0): una franja discreta arriba cuando las peticiones no logran salir.
 * Aparece si el corte dura más de un segundo, dice que lo que se ve es lo último que cargó y ofrece reintentar. Se va
 * sola con la primera respuesta del servidor. No tapa la pantalla ni bloquea nada.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [offline, setOffline] = useState(isOffline());
  const [shown, setShown] = useState(false);

  useEffect(() => subscribeConnection(setOffline), []);
  useEffect(() => {
    if (!offline) {
      const t = setTimeout(() => setShown(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setShown(true);
      AccessibilityInfo.announceForAccessibility('Sin conexión. Mostramos lo último que cargó.');
    }, OFFLINE_NOTICE_DELAY_MS);
    return () => clearTimeout(t);
  }, [offline]);

  if (!shown) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.xs }]}>
      <View style={styles.bar} accessibilityRole="alert">
        <Ionicons name="cloud-offline-outline" size={18} color="#fff" />
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.text} numberOfLines={2}>
          Sin conexión. Mostramos lo último que cargó.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reintentar la conexión"
          onPress={() => void queryClient.refetchQueries({ type: 'active' })}
          hitSlop={8}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.retryText}>
            Reintentar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 1000, elevation: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.xs, minHeight: 48, borderRadius: radius.md, backgroundColor: colors.ink },
  text: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: '#fff' },
  retry: { minHeight: 40, minWidth: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
  pressed: { opacity: 0.8 },
});
