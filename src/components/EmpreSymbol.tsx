import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';

const PIN = 'M32 61 C32 61 11 41 11 26 A21 21 0 0 1 53 26 C53 41 32 61 32 61 Z';

/** La familia de Empre: siempre el mismo pin; lo que cambia es lo que lleva adentro. */
const INSIDE = {
  finder: 'M21 15 H43 V22 A2.75 2.75 0 0 1 37.5 22 A2.75 2.75 0 0 1 32 22 A2.75 2.75 0 0 1 26.5 22 A2.75 2.75 0 0 1 21 22 Z M23 26 H41 V36 H23 Z',
  offers: 'M20 18 H33 L44 27 L33 36 H20 Z',
  finance: 'M21 28.5 A1.5 1.5 0 0 1 22.5 27 H25 A1.5 1.5 0 0 1 26.5 28.5 V36 H21 Z M29.2 22.5 A1.5 1.5 0 0 1 30.7 21 H33.2 A1.5 1.5 0 0 1 34.7 22.5 V36 H29.2 Z M37.4 17.5 A1.5 1.5 0 0 1 38.9 16 H41.4 A1.5 1.5 0 0 1 42.9 17.5 V36 H37.4 Z',
  agenda: 'M20 19 H44 V37 H20 Z M25 14.5 H28 V19 H25 Z M36 14.5 H39 V19 H36 Z',
} as const;

export type EmpreProduct = keyof typeof INSIDE;

export function EmpreSymbol({ product, size = 28 }: { product: EmpreProduct; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d={`${PIN} ${INSIDE[product]}`} fill={colors.brand} fillRule="evenodd" />
    </Svg>
  );
}
