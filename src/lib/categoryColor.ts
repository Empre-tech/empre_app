import { colors } from '@/theme';

// Paleta de pares (fondo suave, color de ícono) tomada de los tonos de marca
// ya definidos en el theme, para que cada categoría tenga un color
// consistente sin necesitar un campo de color en el backend.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: colors.primarySoft, fg: colors.primary },
  { bg: colors.verifiedSoft, fg: colors.verified },
  { bg: colors.accentSoft, fg: colors.accent },
];

/** Hash simple y estable de un string a un índice de la paleta. */
function hashToIndex(id: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

/** Color consistente por categoría (mismo id siempre da el mismo color), usado
 * para teñir el ícono/pin de un negocio según su categoría en vez de un solo
 * color genérico para todos. */
export function categoryColor(categoryId: string | null | undefined): { bg: string; fg: string } {
  if (!categoryId) return PALETTE[0];
  return PALETTE[hashToIndex(categoryId, PALETTE.length)];
}
