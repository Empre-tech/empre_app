import { memo } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

/**
 * Ilustraciones de categoría (tablero «Categorías con imagen»): ni negro ni blanco. Cada categoría tiene un tono medio
 * con la misma luz y fuerza; los rayos y el círculo claro convergen al centro, donde está el objeto en el tono
 * profundo de su mismo color. Solo para categorías: los productos siempre llevan su foto real.
 */
export type ArtKey = 'comida' | 'belleza' | 'barberia' | 'ropa' | 'calzado' | 'tecnologia' | 'talleres' | 'unas' | 'papeleria' | 'mascotas' | 'hogar' | 'salud' | 'tienda';

const TONES: Record<ArtKey, { m: string; d: string; l: string }> = {
  comida: { m: '#E9A07E', d: '#7A3418', l: '#FBE3D6' },
  belleza: { m: '#E6A3B8', d: '#7A2E48', l: '#FBE4EC' },
  barberia: { m: '#9DB3D9', d: '#2E4374', l: '#E3EBF8' },
  ropa: { m: '#B9A6E0', d: '#4A3482', l: '#EEE8FA' },
  calzado: { m: '#EBC277', d: '#7A5310', l: '#FBF0D6' },
  tecnologia: { m: '#8FCBDD', d: '#135A6E', l: '#DDF2F8' },
  talleres: { m: '#B9C98A', d: '#4A5A18', l: '#EEF3DC' },
  unas: { m: '#E5A0D4', d: '#6E2560', l: '#F8E3F3' },
  papeleria: { m: '#8FD3B8', d: '#155C47', l: '#DDF4EA' },
  mascotas: { m: '#D9B48F', d: '#6A4420', l: '#F6E9DA' },
  hogar: { m: '#94C2C0', d: '#24575A', l: '#DFF0EF' },
  salud: { m: '#D8D77E', d: '#5C5A10', l: '#F5F4D6' },
  tienda: { m: '#C9CEEE', d: '#2F3A7A', l: '#ECEEF9' },
};

const WORDS: [ArtKey, RegExp][] = [
  ['barberia', /barber|pelu|corte|cabello/i],
  ['unas', /uña|unas|manicur|pedicur|nail/i],
  ['belleza', /belle|estétic|estetic|spa|maquill|cosmét|cosmet/i],
  ['comida', /comid|restaur|almuerz|café|cafe|panader|pizza|food|bebid|jugo|postre|asader|rapida|rápida|fast/i],
  ['calzado', /calzad|zapat|tenis|shoe/i],
  ['ropa', /ropa|moda|vestu|boutique|shirt/i],
  ['tecnologia', /tecno|celular|comput|electr|phone|móvil|movil/i],
  ['talleres', /taller|mecán|mecan|moto|carro|auto|llanta|car|construction|build/i],
  ['papeleria', /papeler|librer|útiles|utiles|copia|school|book/i],
  ['mascotas', /mascot|veterin|pet|paw/i],
  ['salud', /salud|farmac|droguer|médic|medic|clínic|clinic|odonto|dental|health|medkit/i],
  ['hogar', /hogar|ferreter|casa|mueble|home|limpieza/i],
];

/** De la categoría (nombre o ícono) a su ilustración; lo que no reconoce va a «tienda». */
export function artKeyFor(name?: string | null, icon?: string | null): ArtKey {
  const text = `${name ?? ''} ${icon ?? ''}`;
  for (const [key, re] of WORDS) if (re.test(text)) return key;
  return 'tienda';
}

function Obj({ k, d, l }: { k: ArtKey; d: string; l: string }) {
  switch (k) {
    case 'comida':
      return (
        <G>
          <Path d="M32 58h56a28 28 0 0 1-56 0z" fill={d} />
          <Rect x={28} y={53} width={64} height={8} rx={4} fill={d} />
          <Path d="M48 46c-4-5 4-8 0-14M60 46c-4-5 4-8 0-14M72 46c-4-5 4-8 0-14" stroke={d} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'belleza':
      return (
        <G>
          <Path d="M52 46V32l16-6v20z" fill={d} />
          <Rect x={49} y={45} width={22} height={13} rx={2} fill={l} />
          <Rect x={46} y={57} width={28} height={34} rx={6} fill={d} />
        </G>
      );
    case 'barberia':
      return (
        <G>
          <Path d="M50 70 74 28M70 70 46 28" stroke={d} strokeWidth={6} strokeLinecap="round" />
          <Circle cx={44} cy={78} r={9} stroke={d} strokeWidth={5} fill={l} />
          <Circle cx={76} cy={78} r={9} stroke={d} strokeWidth={5} fill={l} />
        </G>
      );
    case 'ropa':
      return <Path d="M46 30 28 40l7 14 9-4v38h32V50l9 4 7-14-18-10c-2 6-7 9-14 9s-12-3-14-9z" fill={d} stroke={d} strokeWidth={2} strokeLinejoin="round" />;
    case 'calzado':
      return (
        <G>
          <Path d="M24 76c0-8 3-18 7-24 6 2 11 3 15 1l4-4c8 10 20 16 34 18 7 1 12 5 12 10v3H24z" fill={d} />
          <Rect x={24} y={78} width={72} height={9} rx={4.5} fill={d} />
        </G>
      );
    case 'tecnologia':
      return (
        <G>
          <Rect x={42} y={26} width={36} height={68} rx={8} fill={d} />
          <Rect x={46} y={33} width={28} height={48} rx={3} fill={l} />
        </G>
      );
    case 'talleres':
      return <Path d="M78 28a16 16 0 0 0-18 20L32 76a7 7 0 0 0 10 10l28-28a16 16 0 0 0 20-18l-9 9-9-2-2-9z" fill={d} />;
    case 'unas':
      return (
        <G>
          <Rect x={51} y={30} width={18} height={28} rx={3} fill={d} />
          <Rect x={47} y={55} width={26} height={6} rx={2} fill={l} />
          <Rect x={40} y={60} width={40} height={31} rx={10} fill={d} />
        </G>
      );
    case 'papeleria':
      return (
        <G rotation={-40} origin="60, 60">
          <Rect x={52} y={22} width={16} height={56} rx={2} fill={d} />
          <Rect x={52} y={22} width={16} height={9} fill={l} />
          <Path d="M52 78h16l-8 16z" fill={l} />
        </G>
      );
    case 'mascotas':
      return (
        <G>
          <Ellipse cx={60} cy={73} rx={16} ry={13} fill={d} />
          <Circle cx={40} cy={57} r={7} fill={d} />
          <Circle cx={52} cy={44} r={7} fill={d} />
          <Circle cx={68} cy={44} r={7} fill={d} />
          <Circle cx={80} cy={57} r={7} fill={d} />
        </G>
      );
    case 'hogar':
      return (
        <G>
          <Path d="M38 56v32h44V56L60 38z" fill={d} />
          <Path d="M30 60 60 34l30 26" stroke={d} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Rect x={53} y={68} width={14} height={20} rx={2} fill={l} />
        </G>
      );
    case 'salud':
      return (
        <G>
          <G rotation={-35} origin="60, 64">
            <Rect x={34} y={52} width={52} height={24} rx={12} fill={l} stroke={d} strokeWidth={4} />
            <Path d="M60 52h14a12 12 0 0 1 0 24H60z" fill={d} />
          </G>
          <Path d="M80 28v12M74 34h12" stroke={d} strokeWidth={4} strokeLinecap="round" />
        </G>
      );
    default:
      return (
        <G>
          <Path d="M32 50l5-16h46l5 16" fill={d} />
          <Rect x={34} y={50} width={52} height={38} rx={3} fill={d} />
          <Rect x={52} y={64} width={16} height={24} fill={l} />
        </G>
      );
  }
}

const RAYS = Array.from({ length: 10 }, (_, i) => {
  const a = (i * 2 * Math.PI) / 10;
  const b = ((i * 2 + 1) * Math.PI) / 10;
  const p = (x: number) => (60 + 95 * x).toFixed(1);
  return `M60 60L${p(Math.cos(a))} ${p(Math.sin(a))}L${p(Math.cos(b))} ${p(Math.sin(b))}Z`;
}).join(' ');

export const CategoryArt = memo(function CategoryArt({ k, size = 64 }: { k: ArtKey; size?: number }) {
  const t = TONES[k];
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessible={false}>
      <Rect width={120} height={120} fill={t.m} />
      <Path d={RAYS} fill={t.l} fillOpacity={0.2} />
      <Circle cx={60} cy={60} r={40} fill={t.l} fillOpacity={0.45} />
      <Circle cx={60} cy={60} r={27} fill={t.l} fillOpacity={0.5} />
      <Obj k={k} d={t.d} l={t.l} />
    </Svg>
  );
});
