import { useEffect, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { canBlur, useBlurTarget } from '@/finance/blur';
import { fin } from '@/finance/tokens';

// Superficie de Empre Finance (3.46 F3). Vidrio de verdad, igual en iPhone y en Android 12+: `BlurView` desenfoca la
// app que hay detrás (en Android, a través del `BlurTargetView` de FinanceHost) y un tinte blanco encima asegura la
// lectura. Si el teléfono no puede desenfocar (Android 11 o menos, una app compilada sin expo-blur) o el sistema pide
// «Reducir transparencia», es una superficie sólida, como las demás hojas de la app: nunca deja ver la pantalla de
// atrás sin desenfocar. `dark` es la tarjeta de la voz, que va sobre fondo sólido.

type BlurProps = {
  intensity?: number;
  tint?: string;
  blurMethod?: string;
  blurTarget?: RefObject<View | null>;
  style?: StyleProp<ViewStyle>;
};
let BlurView: ComponentType<BlurProps> | null = null;
if (canBlur) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga opcional de un módulo nativo
    BlurView = (require('expo-blur') as { BlurView: ComponentType<BlurProps> }).BlurView;
  } catch {
    BlurView = null;
  }
}

function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((v) => {
        if (!cancelled) setOn(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOn);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return on;
}

/** ¿El vidrio desenfoca de verdad aquí? (si no, la superficie es sólida y el velo es el de siempre). */
export function useGlass(): boolean {
  const reduce = useReduceTransparency();
  return Boolean(BlurView) && !reduce;
}

export function Glass({ style, children, dark = false }: { style?: StyleProp<ViewStyle>; children?: ReactNode; dark?: boolean }) {
  const glass = useGlass();
  const target = useBlurTarget();
  const Blur = BlurView;
  if (dark) return <View style={[styles.base, styles.dark, style]}>{children}</View>;
  if (!glass || !Blur) return <View style={[styles.base, styles.light, style]}>{children}</View>;
  return (
    <View style={[styles.base, styles.edge, style]}>
      <Blur intensity={fin.blur.intensity} tint={fin.blur.tint} blurMethod={fin.blur.android} blurTarget={target ?? undefined} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  light: { backgroundColor: fin.color.surface },
  edge: { borderWidth: 1, borderColor: fin.color.glassEdge },
  tint: { backgroundColor: fin.color.glass },
  dark: { backgroundColor: fin.color.voice.card, borderWidth: 1, borderColor: fin.color.voice.cardEdge },
});
