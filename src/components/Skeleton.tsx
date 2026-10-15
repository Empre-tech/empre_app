import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, radius, spacing } from '@/theme';

interface BlockProps {
  width?: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Bloque gris que respira mientras carga el contenido real. Con «Reducir
 * movimiento» se queda quieto: sigue ocupando el mismo espacio, así que no hay
 * saltos de layout al llegar los datos.
 */
export function SkeletonBlock({ width = '100%', height, borderRadius = radius.sm, style }: BlockProps) {
  const reduce = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduce) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);

  return <Animated.View accessible={false} style={[{ width, height, borderRadius, backgroundColor: colors.line, opacity: pulse }, style]} />;
}

/** Fila de lista (avatar + dos líneas), para Novedades, Reclamos y similares. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Cargando" style={styles.rows}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBlock width={44} height={44} borderRadius={22} />
          <View style={styles.lines}>
            <SkeletonBlock width="55%" height={12} />
            <SkeletonBlock width="85%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Perfil de negocio mientras carga: portada, avatar, nombre y chips en su sitio final. */
export function SkeletonProfile() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Cargando negocio" style={styles.profile}>
      <SkeletonBlock height={160} borderRadius={0} />
      <View style={styles.profileBody}>
        <SkeletonBlock width={88} height={88} borderRadius={44} style={styles.profileAvatar} />
        <SkeletonBlock width="60%" height={22} />
        <View style={styles.chips}>
          <SkeletonBlock width={96} height={26} borderRadius={13} />
          <SkeletonBlock width={120} height={26} borderRadius={13} />
        </View>
        <SkeletonBlock height={14} />
        <SkeletonBlock width="80%" height={14} />
        <SkeletonBlock height={120} borderRadius={radius.lg} style={styles.profileCard} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lines: { flex: 1, gap: spacing.sm },
  profile: { flex: 1, backgroundColor: colors.bg },
  profileBody: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  profileAvatar: { marginTop: -44 },
  chips: { flexDirection: 'row', gap: spacing.xs },
  profileCard: { marginTop: spacing.md },
});
