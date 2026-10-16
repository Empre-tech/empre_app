import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadow } from '@/theme';

/**
 * «Cargando negocios…» sobre el mapa mientras todavía no hay ningún pin y se está pidiendo la
 * zona. No bloquea nada: el mapa se puede mover y, apenas llegan los negocios, el aviso se va.
 */
export function LoadingChip() {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando negocios"
      accessibilityLiveRegion="polite"
      style={styles.chip}
    >
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.text}>Cargando negocios…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...shadow,
  },
  text: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
