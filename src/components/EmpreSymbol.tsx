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
 * Logo oficial de Empre («El Puente Estructural» · Regla de los 3 Colores):
 * - Arco estructural superior (el comercio local) y arco inferior (el vecino/cliente) alineados en el eje izquierdo
 *   para formar una «E» sólida y arquitectónica (sin confundirse con una «S»).
 * - En el centro, el puente en el 3.er color (`colors.brand`) con el nodo de automatización que los conecta.
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
            <Circle cx="48" cy="18" r="5" fill={colors.brand} />
          </>
        ) : (
          <>
            {/* Arco superior estructurado (Comercio Local) */}
            <Path
              d="M15 25V18C15 14.686 17.686 12 21 12H47"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={6.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Arco inferior estructurado con gancho de encuentro (Cliente) */}
            <Path
              d="M15 39V46C15 49.314 17.686 52 21 52H43C46.314 52 49 49.314 49 46V42"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={6.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Puente central de Empre + Nodo de Automatización en el 3.er color */}
            <Rect x="15" y="28.5" width="25" height="7" rx="3.5" fill={colors.brand} />
            <Circle cx="47.5" cy="32" r="4" fill={colors.brand} />
          </>
        )}
      </Svg>
    </Animated.View>
  );
}

/**
 * Cápsula animada de presentación de módulo (`Empre Vitrina`, `Empre Finance`, `Empre AI`, `Empre Agent`, `Empre Finder`):
 * entra con resorte mostrando el logo monolítico y el nombre del módulo.
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
