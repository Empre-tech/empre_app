import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius } from '@/theme';

const MARK = require('../../assets/brand/empre-mark.png');
/** El rojo de la marca (el del ícono de la app y el botón Empre). */
const EMPRE_RED = '#FF1D25';

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
 * Logo de Empre (2026-11-20): el mismo del ícono de la app y del botón Empre, la «e» con techo en blanco sobre el rojo
 * de referencia (#FF1D25). Reemplaza al logo viejo dibujado en SVG (cuadro oscuro con la «e» de ondas y el punto verde).
 * `product` solo cambia el símbolo en «check» (el canje verificado); el nombre del módulo lo pone quien lo usa.
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
      <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: EMPRE_RED, alignItems: 'center', justifyContent: 'center' }}>
        {product === 'check' ? (
          <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 64 64">
            <Path d="M14 33.5 L26 45.5 L50 19.5" fill="none" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : (
          <Image source={MARK} style={{ width: size * 0.7, height: size * 0.7 }} contentFit="contain" tintColor="#FFFFFF" accessible={false} />
        )}
      </View>
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
