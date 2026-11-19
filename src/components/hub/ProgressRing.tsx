import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

/**
 * Un anillo que se llena (Mi negocio, lienzo v115): lo hecho va en el rojo de referencia, lo que falta en la línea.
 * Lo de adentro (el logo) va centrado.
 */
export function ProgressRing({ size, stroke = 4, pct, children }: { size: number; stroke?: number; pct: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const mid = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={mid} cy={mid} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={mid}
            cy={mid}
            r={r}
            stroke={colors.brandRef}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(c * p) / 100} ${c}`}
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
