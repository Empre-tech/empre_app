import { distanceKm, type Coords } from './geo';

export interface Cluster<T extends Coords> {
  key: string;
  latitude: number;
  longitude: number;
  /** Miembros en el orden recibido (el primero es el mejor rankeado). */
  items: T[];
}

interface RegionLike {
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Tamaño del mapa en puntos de pantalla (lo que reporta onLayout). */
export interface MapSize {
  width: number;
  height: number;
}

/**
 * Distancia mínima en pantalla entre los puntos de dos marcadores, por nivel, para que nunca se toquen (auditoría del
 * 22 oct). Todos se anclan en el centro de su círculo principal, pero la pila en diagonal no es simétrica: desde ese
 * centro se extiende 41 pt a la izquierda, 17 a la derecha, 23 hacia arriba (rayo) y 39 hacia abajo. Pila contra pila:
 * 41 + 17 + aire = 64 de lado, y una pila bajo un pin de 34 con rayo (31 hacia arriba): 39 + 31 + 2 = 72. Cerca el pin
 * mide 46 con el rayo (37 hacia arriba): 39 + 37 = 76. Ya no hay puntos de lejos: lejos usa lo mismo que medio.
 */
export const CLUSTER_PX = { far: 72, mid: 72, near: 76 } as const;

function single<T extends Coords & { id: string }>(item: T): Cluster<T> {
  return { key: item.id, latitude: item.latitude, longitude: item.longitude, items: [item] };
}

/**
 * Agrupa negocios que quedarían a menos de `thresholdPx` en pantalla.
 *
 * - Cada grupo lo lidera el primer negocio de la lista (el mejor rankeado, pues
 *   el servidor ya ordena) y un negocio entra al grupo si está cerca de ese
 *   líder, no de cualquier miembro: así los grupos no se encadenan.
 * - Al acercar el zoom, los negocios se alejan en pantalla y el grupo se abre
 *   solo, sin saltos entre celdas como pasaba con la cuadrícula anterior.
 * - Un grupo se dibuja exactamente en el punto de su líder, nunca en el promedio: así la pila no se mueve cuando entra
 *   o sale un negocio, siempre está sobre un negocio real y, como dos líderes nunca quedan a menos del umbral, dos
 *   marcadores nunca se pisan (auditoría del 22 oct).
 * - Sin tamaño de mapa medido todavía, devuelve cada negocio por separado.
 */
export function clusterByScreenDistance<T extends Coords & { id: string }>(
  items: T[],
  region: RegionLike,
  size: MapSize,
  thresholdPx: number,
): Cluster<T>[] {
  if (size.width <= 0 || size.height <= 0 || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) {
    return items.map(single);
  }
  const pxPerLat = size.height / region.latitudeDelta;
  const pxPerLng = size.width / region.longitudeDelta;
  const limit = thresholdPx * thresholdPx;

  const groups: T[][] = [];
  for (const item of items) {
    const group = groups.find((members) => {
      const leader = members[0];
      if (!leader) return false;
      const dx = (item.longitude - leader.longitude) * pxPerLng;
      const dy = (item.latitude - leader.latitude) * pxPerLat;
      return dx * dx + dy * dy <= limit;
    });
    if (group) group.push(item);
    else groups.push([item]);
  }

  return groups.map((members) => {
    const [leader, second] = members;
    if (!leader) return null;
    if (members.length === 1 || !second) return single(leader);
    return {
      // La clave cambia si cambia la composición, para que el marcador se vuelva a dibujar.
      key: `stack-${leader.id}-${members.length}-${second.id.slice(0, 6)}`,
      latitude: leader.latitude,
      longitude: leader.longitude,
      items: members,
    };
  }).filter((c): c is Cluster<T> => c !== null);
}

/**
 * ¿Todos están a `meters` o menos del primero? Es el caso de un centro
 * comercial o una esquina: el zoom nunca los separa, así que se abren en una
 * lista («En este lugar») en vez de seguir acercando.
 */
export function allWithinMeters(items: Coords[], meters: number): boolean {
  const [first, ...rest] = items;
  if (!first) return false;
  return rest.every((other) => distanceKm(first, other) * 1000 <= meters);
}
