import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Chispa, type ChispaMood } from '@/components/ai/Chispa';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors } from '@/theme';

/**
 * La Chispa como orbe de voz (3.65). Detrás, un halo que crece con el volumen real del micrófono (`level`, de 0 a 1,
 * animado fuera para no volver a dibujar la hoja en cada evento): se mueve porque hablas, no por un bucle inventado.
 * Con «Reducir movimiento» o sin escuchar, el halo no aparece.
 */
export function VoiceOrb({ size, mood, level, listening }: { size: number; mood: ChispaMood; level: Animated.Value; listening: boolean }) {
  const reduce = useReduceMotion();
  const live = listening && !reduce;
  const halo = Math.round(size * 1.6);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible={false} importantForAccessibility="no-hide-descendants">
      {live ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              width: halo,
              height: halo,
              left: (size - halo) / 2,
              top: (size - halo) / 2,
              opacity: level.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1], extrapolate: 'clamp' }),
              transform: [{ scale: level.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.25], extrapolate: 'clamp' }) }],
            },
          ]}
        >
          <Svg width={halo} height={halo}>
            <Defs>
              <RadialGradient id="voz" cx="50%" cy="50%" r="50%">
                <Stop offset="0.45" stopColor="#14B8B0" stopOpacity={0.32} />
                <Stop offset="0.75" stopColor={colors.accent} stopOpacity={0.14} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={halo / 2} cy={halo / 2} r={halo / 2} fill="url(#voz)" />
          </Svg>
        </Animated.View>
      ) : null}
      <Chispa size={size} mood={mood} />
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: 'absolute' },
});
