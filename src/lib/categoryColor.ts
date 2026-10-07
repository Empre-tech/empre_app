import { colors } from '@/theme';

/**
 * Aclara un hex hacia el blanco para obtener el fondo suave del portal/glifo
 * (el par "fondo suave + color" de la identidad Empre). Si el color no es un
 * hex válido, cae al suave del azul principal.
 */
function tint(hex: string, amount = 0.86): string {
  const s = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return colors.primarySoft;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

/**
 * Color de marca de una categoría (el hex que manda el backend en
 * `category.color`), con su fondo suave derivado. Sin color, cae al azul
 * principal para no romper nada.
 */
export function categoryColor(color?: string | null): { bg: string; fg: string } {
  const fg = color && color.startsWith('#') ? color : colors.primary;
  return { bg: tint(fg), fg };
}
