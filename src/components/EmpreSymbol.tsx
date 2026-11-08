import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius } from '@/theme';

// El pin de Empre tal como está en el lienzo: anillo en tres colores (rojo, teal y naranja).
const RING: readonly (readonly [string, string])[] = [
  ['M32.0 60.0 L30.4 58.4 L28.7 56.6 L27.0 54.8 L25.4 52.9 L24.0 51.2 L22.5 49.3 L21.0 47.3 L19.5 45.2 L18.1 43.0 L16.7 40.7 L15.5 38.4 L14.4 36.1 L13.6 34.1', '#F03232'],
  ['M13.6 34.1 L12.9 31.8 L12.3 29.4 L12.0 27.1 L12.0 24.7 L12.3 22.4 L12.9 20.1 L13.7 17.9 L14.8 15.8 L16.1 13.8 L17.7 12.0 L19.4 10.5 L21.3 9.1 L23.4 7.9 L25.6 7.1 L27.8 6.4 L30.2 6.1 L32.5 6.0 L34.9 6.2', '#14B8B0'],
  ['M34.9 6.2 L37.2 6.7 L39.4 7.4 L41.5 8.4 L43.5 9.7 L45.4 11.1 L47.0 12.8 L48.5 14.7 L49.7 16.7 L50.7 18.8 L51.4 21.1 L51.8 23.4 L52.0 25.7 L51.9 28.3 L51.4 30.6 L50.8 32.9 L49.9 35.3 L48.9 37.6 L47.7 40.0 L46.4 42.2 L45.0 44.4 L43.5 46.6 L42.0 48.6 L40.5 50.6 L39.0 52.4 L37.4 54.3 L35.9 55.9 L34.2 57.7 L32.7 59.4 L32.0 60.0', '#FF8A1F'],
];

const AWNING: readonly (readonly [string, string])[] = [
  ['M21 15 H26.5 V22 A2.75 2.75 0 0 1 21 22 Z', '#F03232'],
  ['M26.5 15 H32 V22 A2.75 2.75 0 0 1 26.5 22 Z', '#14B8B0'],
  ['M32 15 H37.5 V22 A2.75 2.75 0 0 1 32 22 Z', '#FFB21A'],
  ['M37.5 15 H43 V22 A2.75 2.75 0 0 1 37.5 22 Z', '#FF8A1F'],
];

const INSIDE = {
  master: 'M23 26 H41 V36 H23 Z M29 29 H35 V36 H29 Z',
  finder: 'M23 26 H41 V36 H23 Z M29 29 H35 V36 H29 Z',
  offers: 'M20 18 H33 L44 27 L33 36 H20 Z M25 25 A2.2 2.2 0 1 0 25 29.4 A2.2 2.2 0 1 0 25 25 Z',
  finance: 'M21 28.5 A1.5 1.5 0 0 1 22.5 27 H25 A1.5 1.5 0 0 1 26.5 28.5 V36 H21 Z M29.2 22.5 A1.5 1.5 0 0 1 30.7 21 H33.2 A1.5 1.5 0 0 1 34.7 22.5 V36 H29.2 Z M37.4 17.5 A1.5 1.5 0 0 1 38.9 16 H41.4 A1.5 1.5 0 0 1 42.9 17.5 V36 H37.4 Z',
  ai: 'M32 14 L34.8 23.2 L44 26 L34.8 28.8 L32 38 L29.2 28.8 L20 26 L29.2 23.2 Z',
  agent: 'M20 16 H44 A3 3 0 0 1 47 19 V32 A3 3 0 0 1 44 35 H29 L23 40 V35 H20 A3 3 0 0 1 17 32 V19 A3 3 0 0 1 20 16 Z M32 19.5 L33.6 24 L38 25.5 L33.6 27 L32 31.5 L30.4 27 L26 25.5 L30.4 24 Z',
  agenda: 'M20 19 H44 V37 H20 Z M25 14.5 H28 V19 H25 Z M36 14.5 H39 V19 H36 Z',
  check: 'M22 27.5 L28.5 34 L42 20.5 L39.2 17.7 L28.5 28.4 L24.8 24.7 Z',
} as const;

export type EmpreProduct = keyof typeof INSIDE;

/** Imágenes oficiales en alta resolución generadas para cada sub-marca del ecosistema Empre. */
const LOGO_ASSETS: Record<EmpreProduct, number> = {
  master: require('../../assets/logos/empre_master.png'),
  finder: require('../../assets/logos/empre_finder.png'),
  offers: require('../../assets/logos/empre_offers.png'),
  finance: require('../../assets/logos/empre_finance.png'),
  ai: require('../../assets/logos/empre_ai.png'),
  agent: require('../../assets/logos/empre_agent.png'),
  agenda: require('../../assets/logos/empre_agent.png'),
  check: require('../../assets/logos/empre_offers.png'),
};

export const PRODUCT_META: Record<EmpreProduct, { name: string; tagline: string }> = {
  master: { name: 'Empre', tagline: 'Todo tu barrio en un solo lugar' },
  finder: { name: 'Empre Finder', tagline: 'Descubre tiendas y servicios a pasos de ti' },
  offers: { name: 'Empre Offers', tagline: 'Ofertas reales y boletos en tu barrio' },
  finance: { name: 'Empre Finance', tagline: 'Caja rápida, ventas y gastos al día' },
  ai: { name: 'Empre AI', tagline: 'Dictado inteligente y lectura de negocio' },
  agent: { name: 'Empre Agent', tagline: 'Asistente conversacional del negocio' },
  agenda: { name: 'Empre Agenda', tagline: 'Citas y turnos organizados al instante' },
  check: { name: 'Empre Canje', tagline: 'Boleto verificado' },
};

/**
 * Símbolo y logo oficial de Empre y sus módulos (`offers`, `finance`, `ai`, `agent`, `finder`, `master`).
 * Con `useImage` (activo por defecto) muestra la insignia diseñada de alta resolución y ejecuta una
 * micro-animación de resorte al entrar para dar paso a los componentes de la pantalla.
 */
export function EmpreSymbol({
  product = 'finder',
  size = 30,
  useImage = true,
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
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
            {
              rotate: anim.interpolate({
                inputRange: [0, 1],
                outputRange: ['-8deg', '0deg'],
              }),
            },
          ],
        };

  if (useImage && product !== 'check') {
    return (
      <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
        <Image
          accessible={false}
          source={LOGO_ASSETS[product]}
          style={{ width: size, height: size }}
          contentFit="contain"
          transition={120}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={animatedStyle}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {RING.map(([d, stroke]) => (
          <Path key={stroke} d={d} fill="none" stroke={stroke} strokeWidth={5} />
        ))}
        {product === 'finder' || product === 'master' ? AWNING.map(([d, fill]) => <Path key={fill} d={d} fill={fill} />) : null}
        <Path d={INSIDE[product]} fill={product === 'agent' || product === 'ai' ? '#0E2346' : '#F03232'} fillRule="evenodd" />
      </Svg>
    </Animated.View>
  );
}

/**
 * Cápsula animada de presentación de módulo (`Empre Offers`, `Empre Finance`, `Empre AI`, `Empre Agent`, `Empre Finder`):
 * entra con resorte mostrando el logo diseñado y el nombre del módulo para dar paso a los componentes siguientes.
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
      <EmpreSymbol product={product} size={32} useImage animated />
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
    fontSize: 13.5,
    fontFamily: fonts.display.bold,
    color: colors.ink,
  },
  moduleTagline: {
    fontSize: 11.5,
    fontFamily: fonts.ui.semibold,
    color: colors.muted,
  },
});
