import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { coverTheme, type CoverMotif } from '@/lib/coverTheme';
import { resolveImageUrl } from '@/lib/image';
import { useReduceMotion } from '@/lib/useReduceMotion';

type IconName = keyof typeof Ionicons.glyphMap;
const INK = 'rgba(255,255,255,';

/** Un valor que va de 0 a 1 sin parar, con el motor nativo: mover la portada no pasa por el hilo de la app. */
function useLoop(ms: number, active: boolean, delay = 0, bounce = false) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      v.setValue(0);
      return;
    }
    const run = Animated.timing(v, { toValue: 1, duration: ms, delay, easing: bounce ? Easing.inOut(Easing.quad) : Easing.linear, useNativeDriver: true });
    const anim = bounce ? Animated.loop(Animated.sequence([run, Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true })])) : Animated.loop(run);
    anim.start();
    return () => anim.stop();
  }, [v, ms, active, delay, bounce]);
  return v;
}

function Stripes({ active }: { active: boolean }) {
  const v = useLoop(3000, active);
  const lines = Array.from({ length: 26 }, (_, i) => i * 40 - 200);
  return (
    <Animated.View style={[styles.layer, { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) }] }]}>
      <Svg width={800} height={400}>
        {lines.map((x) => (
          <Line key={x} x1={x} y1={400} x2={x + 400} y2={0} stroke={`${INK}0.11)`} strokeWidth={14} />
        ))}
      </Svg>
    </Animated.View>
  );
}

function Weave({ active }: { active: boolean }) {
  const v = useLoop(7000, active, 0, true);
  const n = Array.from({ length: 50 }, (_, i) => i * 14);
  return (
    <Animated.View style={[styles.layer, { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) }] }]}>
      <Svg width={800} height={400}>
        {n.map((p) => (
          <Line key={`v${p}`} x1={p} y1={0} x2={p} y2={400} stroke={`${INK}0.09)`} strokeWidth={2} />
        ))}
        {n.slice(0, 30).map((p) => (
          <Line key={`h${p}`} x1={0} y1={p} x2={800} y2={p} stroke={`${INK}0.09)`} strokeWidth={2} />
        ))}
      </Svg>
    </Animated.View>
  );
}

function Dots({ active }: { active: boolean }) {
  const v = useLoop(6000, active);
  const cols = Array.from({ length: 22 }, (_, i) => i * 22);
  const rows = Array.from({ length: 12 }, (_, i) => i * 22);
  return (
    <Animated.View style={[styles.layer, { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }) }] }]}>
      <Svg width={484} height={264}>
        {cols.flatMap((x) => rows.map((y) => <Circle key={`${x}-${y}`} cx={x + 6} cy={y + 6} r={2} fill={`${INK}0.2)`} />))}
      </Svg>
    </Animated.View>
  );
}

function SteamLine({ left, delay, active }: { left: string; delay: number; active: boolean }) {
  const v = useLoop(4500, active, delay);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 0,
        left: left as `${number}%`,
        opacity: active ? v.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 1, 0] }) : 0.7,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [22, -26] }) }],
      }}
    >
      <Svg width={40} height={110}>
        <Path d="M20 108 C4 84 36 68 20 44 C8 28 30 18 20 4" fill="none" stroke={`${INK}0.3)`} strokeWidth={5} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function Steam({ active }: { active: boolean }) {
  return (
    <>
      <SteamLine left="10%" delay={0} active={active} />
      <SteamLine left="38%" delay={1500} active={active} />
      <SteamLine left="66%" delay={3000} active={active} />
    </>
  );
}

const WAVE = 'M0 50 Q50 20 100 50 T200 50 T300 50 T400 50 T500 50 T600 50 T700 50 T800 50 V110 H0 Z';

function Waves({ active }: { active: boolean }) {
  const a = useLoop(8000, active);
  const b = useLoop(13000, active);
  return (
    <View style={styles.waves}>
      <Animated.View style={[styles.wave, { transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, -200] }) }] }]}>
        <Svg width={800} height={110}>
          <Path d={WAVE} fill={`${INK}0.1)`} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.wave, { top: 18, transform: [{ translateX: b.interpolate({ inputRange: [0, 1], outputRange: [-200, 0] }) }] }]}>
        <Svg width={800} height={110}>
          <Path d={WAVE} fill={`${INK}0.1)`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

function Bubble({ left, size, delay, active }: { left: string; size: number; delay: number; active: boolean }) {
  const v = useLoop(5000, active, delay);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: -24,
        left: left as `${number}%`,
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: `${INK}0.32)`,
        opacity: active ? v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }) : 0,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -240] }) }],
      }}
    />
  );
}

function Bubbles({ active }: { active: boolean }) {
  return (
    <>
      <Bubble left="12%" size={10} delay={0} active={active} />
      <Bubble left="28%" size={16} delay={1400} active={active} />
      <Bubble left="46%" size={8} delay={700} active={active} />
      <Bubble left="61%" size={14} delay={2600} active={active} />
      <Bubble left="76%" size={10} delay={1900} active={active} />
    </>
  );
}

function Motif({ motif, active }: { motif: CoverMotif; active: boolean }) {
  switch (motif) {
    case 'stripes':
      return <Stripes active={active} />;
    case 'weave':
      return <Weave active={active} />;
    case 'dots':
      return <Dots active={active} />;
    case 'waves':
      return <Waves active={active} />;
    case 'bubbles':
      return <Bubbles active={active} />;
    default:
      return <Steam active={active} />;
  }
}

/**
 * La portada de un negocio: su foto si la tiene; si no, el color y el movimiento de lo que el negocio es. Con «Reducir
 * movimiento» o `paused` queda quieta.
 */
export function Cover({ photo, category, icon, iconName, iconSize = 64, paused, style, children }: { photo?: string | null; category?: string | null; icon?: string | null; iconName?: IconName; iconSize?: number; paused?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const reduce = useReduceMotion();
  const uri = photo ? resolveImageUrl(photo) : null;
  const theme = coverTheme(category, icon);
  return (
    <View style={[styles.cover, { backgroundColor: theme.color }, style]}>
      {uri ? (
        <Image accessible={false} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} transition={180} />
      ) : (
        <>
          <Motif motif={theme.motif} active={!reduce && !paused} />
          {iconName ? (
            <View style={styles.icon}>
              <Ionicons name={iconName} size={iconSize} color="#fff" />
            </View>
          ) : null}
        </>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden' },
  layer: { position: 'absolute', left: -60, top: -60 },
  waves: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  wave: { position: 'absolute', left: 0, top: 0 },
  icon: { position: 'absolute', right: 12, bottom: 8, opacity: 0.38 },
});
