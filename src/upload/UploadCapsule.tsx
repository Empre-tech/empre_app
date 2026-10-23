import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { announcement, capsule, type Capsule } from '@/lib/uploadQueue';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { alpha, colors, fonts, radius, shadow, spacing } from '@/theme';
import { retryAllFailed, useUploads } from './uploadStore';

/**
 * La cápsula de estado: flota arriba, sobre cualquier pantalla, mientras algo sube («Subiendo foto · 42 %», con una
 * barra fina que avanza), cuando algo falló («No se subió… · Reintentar», tocarla reintenta) y unos segundos después
 * de terminar («Foto publicada ✓», «Oferta publicada ✓»). Se puede seguir usando la app mientras tanto. El lector de
 * pantalla la anuncia al cambiar de estado y cada 25 %.
 */
export function UploadCapsule() {
  const { items, notice } = useUploads();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const cap = capsule(items, notice);
  const prev = useRef<Capsule | null>(null);
  const [enter] = useState(() => new Animated.Value(0));
  const [bar] = useState(() => new Animated.Value(0));

  // Entrada y salida: un deslizamiento corto desde arriba (sin movimiento con «Reducir movimiento»).
  const visible = cap !== null;
  useEffect(() => {
    const to = visible ? 1 : 0;
    if (reduce) enter.setValue(to);
    else Animated.spring(enter, { toValue: to, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [visible, reduce, enter]);

  // La barra sigue al progreso con suavidad.
  const progress = cap?.progress ?? (cap?.tone === 'done' ? 1 : 0);
  useEffect(() => {
    if (reduce) bar.setValue(progress);
    else Animated.timing(bar, { toValue: progress, duration: 220, useNativeDriver: false }).start();
  }, [progress, reduce, bar]);

  useEffect(() => {
    const say = announcement(prev.current, cap);
    if (say) AccessibilityInfo.announceForAccessibility(say);
    prev.current = cap;
  });

  if (!cap) return null;
  const failed = cap.tone === 'failed';
  const done = cap.tone === 'done';

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + spacing.sm }]}>
      <Animated.View
        style={{
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
        }}
      >
        <Pressable
          accessibilityRole={failed ? 'button' : 'text'}
          accessibilityLabel={cap.text}
          accessibilityHint={failed ? 'Toca para reintentar' : undefined}
          disabled={!failed}
          onPress={retryAllFailed}
          style={[styles.pill, failed && styles.pillFailed, done && styles.pillDone]}
        >
          {failed ? (
            <Ionicons name="refresh" size={16} color={colors.white} />
          ) : done ? (
            <Ionicons name="checkmark-circle" size={16} color={colors.white} />
          ) : (
            <ActivityIndicator size="small" color={colors.white} />
          )}
          <Text style={styles.text} numberOfLines={1}>
            {cap.text}
          </Text>
          {cap.tone === 'uploading' ? (
            <View style={styles.track}>
              <Animated.View style={[styles.fill, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  pill: { minHeight: 44, maxWidth: 360, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.ink, overflow: 'hidden', ...shadow },
  pillFailed: { backgroundColor: colors.dangerStrong },
  pillDone: { backgroundColor: colors.successInk },
  text: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.white },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: alpha(colors.white, 0.2) },
  fill: { height: 3, backgroundColor: colors.accent },
});
