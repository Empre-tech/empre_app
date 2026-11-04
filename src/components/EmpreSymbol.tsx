import Svg, { Path } from 'react-native-svg';

// El pin de Empre tal como está en el lienzo: anillo en tres colores (rojo, teal y naranja). Son los mismos tramos del
// trazo original, ya calculados, porque el móvil no entiende pathLength.
const RING: readonly (readonly [string, string])[] = [
  ['M32.0 60.0 L30.4 58.4 L28.7 56.6 L27.0 54.8 L25.4 52.9 L24.0 51.2 L22.5 49.3 L21.0 47.3 L19.5 45.2 L18.1 43.0 L16.7 40.7 L15.5 38.4 L14.4 36.1 L13.6 34.1', '#F03232'],
  ['M13.6 34.1 L12.9 31.8 L12.3 29.4 L12.0 27.1 L12.0 24.7 L12.3 22.4 L12.9 20.1 L13.7 17.9 L14.8 15.8 L16.1 13.8 L17.7 12.0 L19.4 10.5 L21.3 9.1 L23.4 7.9 L25.6 7.1 L27.8 6.4 L30.2 6.1 L32.5 6.0 L34.9 6.2', '#14B8B0'],
  ['M34.9 6.2 L37.2 6.7 L39.4 7.4 L41.5 8.4 L43.5 9.7 L45.4 11.1 L47.0 12.8 L48.5 14.7 L49.7 16.7 L50.7 18.8 L51.4 21.1 L51.8 23.4 L52.0 25.7 L51.9 28.3 L51.4 30.6 L50.8 32.9 L49.9 35.3 L48.9 37.6 L47.7 40.0 L46.4 42.2 L45.0 44.4 L43.5 46.6 L42.0 48.6 L40.5 50.6 L39.0 52.4 L37.4 54.3 L35.9 55.9 L34.2 57.7 L32.7 59.4 L32.0 60.0', '#FF8A1F'],
];

/** La tienda de colores, solo en Finder; en los demás productos el toldo no va y cambia lo de adentro. */
const AWNING: readonly (readonly [string, string])[] = [
  ['M21 15 H26.5 V22 A2.75 2.75 0 0 1 21 22 Z', '#F03232'],
  ['M26.5 15 H32 V22 A2.75 2.75 0 0 1 26.5 22 Z', '#14B8B0'],
  ['M32 15 H37.5 V22 A2.75 2.75 0 0 1 32 22 Z', '#FFB21A'],
  ['M37.5 15 H43 V22 A2.75 2.75 0 0 1 37.5 22 Z', '#FF8A1F'],
];

const INSIDE = {
  finder: 'M23 26 H41 V36 H23 Z M29 29 H35 V36 H29 Z',
  offers: 'M20 18 H33 L44 27 L33 36 H20 Z M25 25 A2.2 2.2 0 1 0 25 29.4 A2.2 2.2 0 1 0 25 25 Z',
  finance: 'M21 28.5 A1.5 1.5 0 0 1 22.5 27 H25 A1.5 1.5 0 0 1 26.5 28.5 V36 H21 Z M29.2 22.5 A1.5 1.5 0 0 1 30.7 21 H33.2 A1.5 1.5 0 0 1 34.7 22.5 V36 H29.2 Z M37.4 17.5 A1.5 1.5 0 0 1 38.9 16 H41.4 A1.5 1.5 0 0 1 42.9 17.5 V36 H37.4 Z',
  agenda: 'M20 19 H44 V37 H20 Z M25 14.5 H28 V19 H25 Z M36 14.5 H39 V19 H36 Z',
  check: 'M22 25 L29 32 L42 18 L46 22 L29 40 L18 29 Z',
  agent: 'M20 16 H44 A3 3 0 0 1 47 19 V32 A3 3 0 0 1 44 35 H29 L23 40 V35 H20 A3 3 0 0 1 17 32 V19 A3 3 0 0 1 20 16 Z M32 19.5 L33.6 24 L38 25.5 L33.6 27 L32 31.5 L30.4 27 L26 25.5 L30.4 24 Z',
} as const;

export type EmpreProduct = keyof typeof INSIDE;

export function EmpreSymbol({ product = 'finder', size = 28 }: { product?: EmpreProduct; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {RING.map(([d, stroke]) => (
        <Path key={stroke} d={d} fill="none" stroke={stroke} strokeWidth={5} />
      ))}
      {product === 'finder' ? AWNING.map(([d, fill]) => <Path key={fill} d={d} fill={fill} />) : null}
      <Path d={INSIDE[product]} fill={product === 'agent' ? '#0E2346' : product === 'check' ? '#0A6E6A' : '#F03232'} fillRule="evenodd" />
    </Svg>
  );
}
