import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius } from '@/theme';

export type EmpreProduct = 'master' | 'finder' | 'offers' | 'finance' | 'ai' | 'agent' | 'agenda' | 'check';

export const PRODUCT_META: Record<EmpreProduct, { name: string; tagline: string }> = {
  master: { name: 'Empre', tagline: 'Todo tu barrio en un solo lugar' },
  finder: { name: 'Empre Finder', tagline: 'Descubre tiendas y servicios a pasos de ti' },
  offers: { name: 'Empre Vitrina', tagline: 'Catálogo y ofertas reales en tu barrio' },
  finance: { name: 'Empre Finance', tagline: 'Caja rápida, ventas y gastos al día' },
  ai: { name: 'Empre AI', tagline: 'Dictado inteligente y lectura de negocio' },
  agent: { name: 'Empre Agent', tagline: 'Asistente conversacional del negocio' },
  agenda: { name: 'Empre Agenda', tagline: 'Citas y turnos organizados al instante' },
  check: { name: 'Empre Canje', tagline: 'Boleto verificado' },
};

/**
 * Logo oficial de Empre (Fusión Identidad de Euler `e•` + El Toldo del Emprendedor bajo la Regla de los 3 Colores):
 * - El cuerpo exterior traza la «e» continua de Euler (crecimiento exponencial y unión Negocio ↔ Cliente).
 * - El travesaño interior de la «e» forma las 3 ondas del toldo de un negocio local (y sus 3 motores: Finanzas, Citas, Ofertas),
 *   de modo que el arco superior parece la carpa de la tienda y el arco inferior su mostrador abierto.
 * - El exponente elevado (`•`) en el 3.er color (`colors.brand`, `#0D7A5F`) simboliza la potencia tecnológica de Empre.
 */
export function EmpreSymbol({
  product = 'finder',
  size = 30,
  useImage: _useImage = true,
  animated = true,
}: {
  product?: EmpreProduct;
  size?: number;
  useImage?: boolean;
  animated?: boolean;
}) {
  const reduce = useReduceMotion();
  const [anim] = useState(() => new Animated.Value(reduce || !animated ? 1 : 0));

  useEffect(() => {
    if (reduce || !animated) {
      anim.setValue(1);
      return;
    }
    anim.setValue(0);
    const spring = Animated.spring(anim, {
      toValue: 1,
      friction: 6,
      tension: 85,
      useNativeDriver: true,
    });
    spring.start();
    return () => spring.stop();
  }, [product, reduce, animated, anim]);

  const animatedStyle =
    reduce || !animated
      ? undefined
      : {
          opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1, 1] }),
          transform: [
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.76, 1] }) },
            {
              rotate: anim.interpolate({
                inputRange: [0, 1],
                outputRange: ['-6deg', '0deg'],
              }),
            },
          ],
        };

  return (
    <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect x="2" y="2" width="60" height="60" rx="18" fill={colors.ink} />
        {product === 'check' ? (
          <>
            <Path
              d="M20 33.5 L28 41.5 L45 23.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle cx="49" cy="16" r="5.5" fill={colors.brand} />
          </>
        ) : (
          <>
            {/* Silueta continua de la «e» de Euler (techo del negocio arriba + mostrador abierto abajo) */}
            <Path
              d="M41.5 31C41.5 21.8 35.6 16 27.5 16C19.2 16 14 23.2 14 33C14 42.8 19.8 49.5 29 49.5C35.2 49.5 39.8 46.8 42.5 43"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={5.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* El travesaño de la «e» dibujado como las 3 ondas del toldo emprendedor (Finanzas, Citas, Ofertas) */}
            <Path
              d="M15.5 30.5 C18 35, 22.5 35, 24.5 30.5 C26.5 35, 31 35, 33 30.5 C35 35, 39.5 35, 41.5 30.5"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={5.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Exponente de Euler en el 3.er color (la potencia que impulsa al negocio) */}
            <Circle cx="49" cy="16" r="5.5" fill={colors.brand} />
          </>
        )}
      </Svg>
    </Animated.View>
  );
}

/**
 * Cápsula animada de presentación de módulo (`Empre Vitrina`, `Empre Finance`, `Empre AI`, `Empre Agent`, `Empre Finder`):
 * entra con resorte mostrando el logo de Empre y el nombre del módulo.
 */
export function EmpreModuleBadge({ product, subtitle }: { product: EmpreProduct; subtitle?: string }) {
  const reduce = useReduceMotion();
  const [enter] = useState(() => new Animated.Value(reduce ? 1 : 0));
  const meta = PRODUCT_META[product];

  useEffect(() => {
    if (reduce) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    const timing = Animated.timing(enter, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    timing.start();
    return () => timing.stop();
  }, [product, reduce, enter]);

  return (
    <Animated.View
      style={[
        styles.moduleBadge,
        !reduce && {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
        },
      ]}
    >
      <EmpreSymbol product={product} size={32} animated />
      <View style={styles.moduleTexts}>
        <Text style={styles.moduleName} numberOfLines={1}>
          {meta.name}
        </Text>
        <Text style={styles.moduleTagline} numberOfLines={1}>
          {subtitle ?? meta.tagline}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  moduleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  moduleTexts: {
    flex: 1,
    minWidth: 0,
  },
  moduleName: {
    fontSize: 14,
    fontFamily: fonts.display.bold,
    color: colors.ink,
  },
  moduleTagline: {
    fontSize: 12,
    fontFamily: fonts.ui.semibold,
    color: colors.muted,
  },
});
