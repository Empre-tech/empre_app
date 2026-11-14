// Énfasis de los resultados de búsqueda según qué tan cerca están (F11). Sin React para poder
// probarlo con Node. Los números salen del mockup `docs/mockups/busqueda_cercania.html`.

/** Dentro de este radio un resultado puede destacar; más lejos solo sale tenue si la persona lo pide. */
export const NEAR_RESULT_M = 5000;
/**
 * Cuántos resultados van con pin grande (nombre y distancia). Desde 2026-11-14, ninguno: los pines grandes con nombre
 * aparecían de golpe y tapaban el mapa; todos van del mismo tamaño con su número, y el nombre está en la lista.
 */
export const BIG_COUNT = 0;
/** Cuántos van con pin mediano después de los grandes. */
export const MID_COUNT = 10;
/** Cuántos de los más cercanos encuadra la cámara. */
export const CAMERA_COUNT = 5;
/** La cámara solo encuadra resultados a menos de esto; más lejos no alejan el mapa. */
export const CAMERA_REACH_M = 1500;

export type EmphasisTier = 'big' | 'mid' | 'dot' | 'far';

export interface Emphasized<T> {
  item: T;
  /** Posición por cercanía (0 = el más cercano). */
  rank: number;
  /** Distancia en metros; null si no se sabe dónde está la persona. */
  distanceM: number | null;
  tier: EmphasisTier;
}

/** Nivel de un resultado por su posición (por cercanía) y su distancia en metros. */
export function emphasisTier(rank: number, distanceM: number | null): EmphasisTier {
  // Sin distancia (no se sabe dónde está la persona) no hay nada que destacar.
  if (distanceM === null) return 'dot';
  if (distanceM > NEAR_RESULT_M) return 'far';
  if (rank < BIG_COUNT) return 'big';
  if (rank < BIG_COUNT + MID_COUNT) return 'mid';
  return 'dot';
}

/**
 * Ordena por cercanía y asigna el nivel de cada resultado. El orden de empate es el recibido
 * (el del servidor); los que no tienen distancia van al final.
 */
export function emphasize<T extends { distanceKm: number | null }>(items: T[]): Emphasized<T>[] {
  return items
    .map((item, order) => ({ item, order }))
    .sort((a, b) => {
      const da = a.item.distanceKm;
      const db = b.item.distanceKm;
      if (da === null && db === null) return a.order - b.order;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db || a.order - b.order;
    })
    .map(({ item }, rank) => {
      const distanceM = item.distanceKm === null ? null : item.distanceKm * 1000;
      return { item, rank, distanceM, tier: emphasisTier(rank, distanceM) };
    });
}

/**
 * Los resultados que encuadra la cámara: los más cercanos a menos de 1,5 km, máximo 5. Un
 * resultado lejano no debe alejar el mapa: si ninguno cabe cerca devuelve vacío y quien llama
 * deja el mapa en la zona de la persona.
 */
export function cameraTargets<T>(plan: Emphasized<T>[], count = CAMERA_COUNT, reachM = CAMERA_REACH_M): T[] {
  return plan
    .filter((p) => p.distanceM !== null && p.distanceM <= reachM)
    .slice(0, count)
    .map((p) => p.item);
}

type LatLng = { latitude: number; longitude: number };

/** Nunca más cerca que esto (≈ un barrio): con un solo resultado el mapa no se va hasta las casas. */
export const FRAME_MIN_SPAN = 0.03;
/** Lo que está a más de esto de ti (otra ciudad) no entra en el encuadre. */
export const FRAME_REACH_M = 20000;

function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = (b.latitude - a.latitude) * 111320;
  const dLng = (b.longitude - a.longitude) * 111320 * Math.cos(((a.latitude + b.latitude) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

/**
 * Lo que encuadra la cámara al buscar (2026-11-14): TODOS los resultados de tu ciudad (y tú), no solo el más cercano.
 * Si quedan muy juntos (o es uno solo), se agregan dos esquinas para que el encuadre sea de al menos un barrio.
 */
export function searchFrame(points: LatLng[], you: LatLng | null, minSpan = FRAME_MIN_SPAN, reachM = FRAME_REACH_M): LatLng[] {
  const near = you ? points.filter((p) => metersBetween(you, p) <= reachM) : points;
  const all = you ? [...near, you] : near;
  if (near.length === 0) return [];
  const lats = all.map((p) => p.latitude);
  const lngs = all.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const out = [...all];
  if (maxLat - minLat < minSpan || maxLng - minLng < minSpan) {
    const cLat = (minLat + maxLat) / 2;
    const cLng = (minLng + maxLng) / 2;
    const hLat = Math.max(maxLat - minLat, minSpan) / 2;
    const hLng = Math.max(maxLng - minLng, minSpan) / 2;
    out.push({ latitude: cLat - hLat, longitude: cLng - hLng }, { latitude: cLat + hLat, longitude: cLng + hLng });
  }
  return out;
}

/** Resultados más lejos que el radio de búsqueda cercana, cuando además hay alguno cerca. */
export function isFarResult(distanceM: number | null, hasNear: boolean): boolean {
  return hasNear && distanceM !== null && distanceM > NEAR_RESULT_M;
}
