// Niveles del mapa según el zoom (F10). Sin React para poder probarlo con Node. Los números salen
// del mockup `docs/mockups/pines_por_niveles.html` (cinco niveles, holgura contra el parpadeo,
// tope de 60 elementos), llevados a `latitudeDelta`, que es lo que el mapa de la app reporta.

/** 1 zonas con nombre y conteo · 2 barrios con conteo · 3 puntos · 4 iconos · 5 cerca, con foto. */
export type MapLevel = 1 | 2 | 3 | 4 | 5;

/**
 * latitudeDelta donde empieza cada nivel (de lejos a cerca): el nivel 1 desde 0,30; el 2 desde
 * 0,10; el 3 desde 0,05; el 4 desde 0,012; por debajo, el 5. Los tres últimos coinciden con los
 * niveles de zoom que ya usan los pines (`far`, `mid`, `near`).
 */
export const LEVEL_EDGES = [0.3, 0.1, 0.05, 0.012] as const;
/** Holgura: cerca de un límite el nivel no cambia hasta pasarlo en ~7 % (≈ 0,02 del zoom del mockup). */
export const LEVEL_HYSTERESIS = 1.07;
/** Nunca se dibujan más de tantos elementos a la vez. */
export const MAX_DRAWN = 60;

/** Nivel de un zoom, sin holgura. Un delta no válido cuenta como lo más cercano. */
export function rawLevel(latDelta: number): MapLevel {
  if (!(latDelta > 0)) return 5;
  if (latDelta >= LEVEL_EDGES[0]) return 1;
  if (latDelta >= LEVEL_EDGES[1]) return 2;
  if (latDelta >= LEVEL_EDGES[2]) return 3;
  if (latDelta >= LEVEL_EDGES[3]) return 4;
  return 5;
}

const lowerBound = (level: MapLevel): number => (level === 5 ? 0 : LEVEL_EDGES[level - 1]);
const upperBound = (level: MapLevel): number => (level === 1 ? Infinity : LEVEL_EDGES[level - 2]);

/**
 * Nivel con holgura: si el zoom sigue a menos de ~7 % de los límites del nivel actual, no cambia.
 * Así, oscilar el zoom justo en un límite no hace saltar entre dos niveles.
 */
export function levelOf(latDelta: number, prev: MapLevel | null): MapLevel {
  const raw = rawLevel(latDelta);
  if (prev === null || raw === prev || !(latDelta > 0)) return raw;
  const stays = latDelta >= lowerBound(prev) / LEVEL_HYSTERESIS && latDelta < upperBound(prev) * LEVEL_HYSTERESIS;
  return stays ? prev : raw;
}

/** Los niveles 1 y 2 dibujan burbujas con conteo en vez de negocios. */
export const isBubbleLevel = (level: MapLevel): boolean => level <= 2;

/** Diámetro (pt) de una burbuja: crece con el conteo, entre 34 y 64. */
export function bubbleSize(count: number): number {
  const n = Math.max(1, count);
  return Math.round(Math.min(64, 34 + Math.log10(n) * 12));
}

/** Texto del conteo: «999+» para no desbordar la burbuja. */
export function bubbleText(count: number): string {
  return count > 999 ? '999+' : String(count);
}
