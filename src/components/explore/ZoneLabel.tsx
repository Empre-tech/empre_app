import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  /** Texto de contexto, p. ej. "12 negocios en esta zona". Sin texto no se dibuja. */
  text: string | null;
  /** Se oculta mientras el usuario arrastra el mapa, para no tapar pines. */
  visible: boolean;
}

/**
 * Etiqueta flotante sobre el mapa con cuántos negocios hay en la zona visible.
 * Reemplaza al saludo, al título y al contador que ocupaban la cabecera.
 */
export function ZoneLabel({ text, visible }: Props) {
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));

  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [visible, opacity]);

  if (!text) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity }]}
      accessible
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    maxWidth: '82%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  text: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
});
