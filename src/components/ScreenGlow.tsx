import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * El fondo de las pantallas principales (2026-11-14): arena clara arriba que se aclara hasta blanco abajo. Va detrás de
 * todo, quieto (no se mueve con el scroll) y no se toca. Se pone como primer hijo de la vista raíz de la pantalla.
 */
export function ScreenGlow() {
  return (
    <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="screenGlow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.glowTop} />
          <Stop offset="0.38" stopColor={colors.bg} />
          <Stop offset="1" stopColor={colors.bgEnd} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#screenGlow)" />
    </Svg>
  );
}
