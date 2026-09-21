export interface Coords {
  latitude: number;
  longitude: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distancia en km entre dos puntos (fórmula de Haversine). */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** El backend guarda 0,0 cuando un negocio no tiene ubicación (p. ej. a domicilio sin zona). */
export function hasLocation(c: Coords): boolean {
  return !(c.latitude === 0 && c.longitude === 0);
}
