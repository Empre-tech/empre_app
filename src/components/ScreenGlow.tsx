import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * El degradado de arena de arriba (Inicio y Ofertas): arranca un poco más hondo y se funde con el fondo claro, para
 * que la pantalla tenga luz sin tarjetas oscuras. Va detrás de todo y no se toca.
 */
export function ScreenGlow({ height = 360 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.glowTop} stopOpacity={0.9} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { position: 'absolute', top: 0, left: 0, right: 0 } });
