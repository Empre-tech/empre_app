import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type TextStyle } from 'react-native';
import { formatPesos } from '@/lib/ledger';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { fin } from '@/finance/tokens';
import { DENSE_TEXT_SCALE } from '@/theme';

// Monto en pesos que rueda dígito por dígito al cambiar (adaptado de «Sliding Number» de ibelick en 21st.dev, sin la
// librería `motion`): cada dígito es una columna 0–9 que se desplaza con un resorte del controlador nativo. Al montar
// arranca en 0 y rueda hasta el valor. Con «Reducir movimiento» cambia sin animar. El lector lee el monto completo.
// La columna de diez solo existe mientras rueda (3.51): quieto, cada dígito es un solo texto. Una hoja con cuatro
// montos pasaba de unos 300 textos a unos 30.

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function Digit({ digit, height, textStyle, reduce }: { digit: number; height: number; textStyle: StyleProp<TextStyle>; reduce: boolean }) {
  const [y] = useState(() => new Animated.Value(0));
  // Rueda cuando el dígito cambia (se decide al dibujar, no en un efecto) y para cuando el resorte termina.
  const [roll, setRoll] = useState(() => ({ digit, on: digit !== 0 }));
  if (roll.digit !== digit) setRoll({ digit, on: true });
  const rolling = roll.on && !reduce;
  useEffect(() => {
    const to = -digit * height;
    if (reduce) {
      y.setValue(to);
      return;
    }
    // Al terminar queda el dígito solo, en el mismo lugar que la columna: el cambio no se ve.
    Animated.spring(y, { toValue: to, useNativeDriver: true, ...fin.motion.roll }).start(({ finished }) => {
      if (finished) setRoll((r) => (r.digit === digit ? { digit, on: false } : r));
    });
  }, [digit, height, reduce, y]);
  if (!rolling) {
    return (
      <Text style={[textStyle, { height, lineHeight: height }]} maxFontSizeMultiplier={DENSE_TEXT_SCALE}>
        {DIGITS[digit]}
      </Text>
    );
  }
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {DIGITS.map((d) => (
          <Text key={d} style={[textStyle, { height, lineHeight: height }]} maxFontSizeMultiplier={DENSE_TEXT_SCALE}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

export function RollingNumber({ value, style, prefix = '' }: { value: number; style: TextStyle; prefix?: string }) {
  const reduce = useReduceMotion();
  const text = formatPesos(Math.abs(value));
  const chars = `${prefix}${text}`.split('');
  // Crece con la letra grande del sistema hasta 1,3× (la columna de dígitos necesita un alto fijo).
  const { fontScale } = useWindowDimensions();
  const height = Math.round((style.fontSize ?? 16) * Math.min(fontScale, DENSE_TEXT_SCALE) * 1.18);
  const textStyle = [styles.text, style];
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={`${prefix}${text}`} style={styles.row}>
      {chars.map((ch, i) => {
        // La llave cuenta desde la derecha: al pasar de $9.000 a $10.000 las unidades siguen siendo la misma columna.
        const key = `p${chars.length - i}`;
        return /\d/.test(ch) ? (
          <Digit key={key} digit={Number(ch)} height={height} textStyle={textStyle} reduce={reduce} />
        ) : (
          <Text key={key} style={[textStyle, { height, lineHeight: height }]} maxFontSizeMultiplier={DENSE_TEXT_SCALE}>
            {ch}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  text: { fontVariant: ['tabular-nums', 'lining-nums'], includeFontPadding: false },
});
