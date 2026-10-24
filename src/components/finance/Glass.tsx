import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, colors } from '@/theme';

// Superficie de Empre Finance. Sólida, como las demás hojas de la app (AskSheet, BookingSheet): el vidrio translúcido
// dejaba ver la pantalla de atrás en Android y no se parecía al resto de Empre. `dark` es la tarjeta de la voz.
export function Glass({ style, children, dark = false }: { style?: StyleProp<ViewStyle>; children?: ReactNode; dark?: boolean }) {
  return <View style={[styles.base, dark ? styles.dark : styles.light, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  light: { backgroundColor: colors.surface },
  dark: { backgroundColor: alpha(colors.white, 0.1), borderWidth: 1, borderColor: alpha(colors.white, 0.14) },
});
