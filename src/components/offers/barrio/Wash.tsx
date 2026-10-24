import { useId, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { deepen } from '@/lib/categoryColor';
import { colors } from '@/theme';

// Fondos con degradado de Ofertas del barrio (3.48). Con react-native-svg para que se vean igual en Android y en
// iPhone (como la aurora de Finance). Van detrás del contenido, sin recibir toques; el padre recorta las esquinas.
// Cada fondo mide su caja y dibuja el SVG con esa medida: con «100 %», en Android el SVG se quedaba con el tamaño del
// primer dibujo (una pieza que entra animada, la franja antes de que lleguen los vecinos) y no crecía.

const svgId = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, '');

function Measured({ fallback, children }: { fallback: string; children: (w: number, h: number) => ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
    >
      {size.w && size.h ? children(size.w, size.h) : null}
    </View>
  );
}

/** Color de la categoría hacia su tono oscuro, con un brillo arriba a la derecha (piezas del mosaico, rutas). */
export function CategoryWash({ color }: { color: string }) {
  const id = svgId(useId());
  return (
    <Measured fallback={color}>
      {(w, h) => (
        <Svg width={w} height={h}>
          <Defs>
            <LinearGradient id={`l${id}`} x1="0" y1="0" x2="0.6" y2="1">
              <Stop offset="0" stopColor={color} />
              <Stop offset="1" stopColor={deepen(color, 0.32)} />
            </LinearGradient>
            <RadialGradient id={`r${id}`} cx="100%" cy="0%" r="75%">
              <Stop offset="0" stopColor={colors.white} stopOpacity={0.32} />
              <Stop offset="1" stopColor={colors.white} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={w} height={h} fill={`url(#l${id})`} />
          <Rect width={w} height={h} fill={`url(#r${id})`} />
        </Svg>
      )}
    </Measured>
  );
}

/** La franja del barrio: el azul de Empre con dos brillos suaves, naranja arriba y turquesa abajo. */
export function BandWash() {
  const id = svgId(useId());
  return (
    <Measured fallback={colors.primary}>
      {(w, h) => (
        <Svg width={w} height={h}>
          <Defs>
            <LinearGradient id={`b${id}`} x1="0" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor={deepen(colors.primaryDark, 0.25)} />
              <Stop offset="1" stopColor={colors.primary} />
            </LinearGradient>
            <RadialGradient id={`a${id}`} cx="100%" cy="0%" r="60%">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.45} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`v${id}`} cx="0%" cy="100%" r="55%">
              <Stop offset="0" stopColor={colors.verified} stopOpacity={0.5} />
              <Stop offset="1" stopColor={colors.verified} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={w} height={h} fill={`url(#b${id})`} />
          <Rect width={w} height={h} fill={`url(#a${id})`} />
          <Rect width={w} height={h} fill={`url(#v${id})`} />
        </Svg>
      )}
    </Measured>
  );
}
