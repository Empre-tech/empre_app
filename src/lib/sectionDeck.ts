/** Secciones como mazo: cuándo se usan y qué dice cada una cerrada. Sin dependencias de pantalla. */

/** Con pocos productos todo va abierto; el mazo solo ayuda cuando la lista ya es larga y hay varias secciones. */
export const DECK_OVER = 20;

export function wantsSectionDeck(total: number, sections: number): boolean {
  return total > DECK_OVER && sections > 1;
}

/** «1 agotado · 3 poco», «2 se acabaron», «1 se acaba» o nada: lo urgente se ve sin abrir la sección. */
export function deckAlert(out: number, low: number): { text: string; tone: 'out' | 'low' } | null {
  if (out === 0 && low === 0) return null;
  if (out > 0 && low > 0) return { text: `${out} ${out === 1 ? 'agotado' : 'agotados'} · ${low} poco`, tone: 'out' };
  if (out > 0) return { text: out === 1 ? '1 se acabó' : `${out} se acabaron`, tone: 'out' };
  return { text: low === 1 ? '1 se acaba' : `${low} se acaban`, tone: 'low' };
}

/** «46 productos», «1 insumo». */
export function deckCountText(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Cuándo aparece cada fila al abrir: las primeras ocho, una tras otra; las demás junto con la octava, para que una
 * sección larga no tarde. Devuelve el tramo [inicio, fin] del avance de 0 a 1.
 */
export function rowWindow(index: number): [number, number] {
  const start = Math.min(index, 7) * 0.07;
  return [start, start + 0.42];
}
