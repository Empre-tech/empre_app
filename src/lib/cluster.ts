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
 * Distancia mínima en pantalla entre dos marcadores, por nivel (3.31): el diámetro del pin más ~14 pt de aire. Lejos el
 * punto mide 18; en medio, 34; cerca, 46.
 */
export const CLUSTER_PX = { far: 26, mid: 48, near: 60 } as const;

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
 * - Un grupo se dibuja en el promedio de sus miembros; un negocio solo, en su
 *   posición.
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

  // Un grupo se dibuja en el promedio de sus miembros, que puede quedar encima de otro marcador: se juntan los que
  // quedaron a menos del umbral hasta que no quede ninguno (3.31). Con 60 marcadores como mucho, es poco trabajo.
  const center = (ms: T[]) => ({
    latitude: ms.reduce((s, m) => s + m.latitude, 0) / ms.length,
    longitude: ms.reduce((s, m) => s + m.longitude, 0) / ms.length,
  });
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = center(groups[i]);
        const b = center(groups[j]);
        const dx = (a.longitude - b.longitude) * pxPerLng;
        const dy = (a.latitude - b.latitude) * pxPerLat;
        if (dx * dx + dy * dy < limit) {
          groups[i] = [...groups[i], ...groups[j]];
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  return groups.map((members) => {
    const [leader, second] = members;
    if (!leader) return null;
    if (members.length === 1 || !second) return single(leader);
    return {
      // La clave cambia si cambia la composición, para que el marcador se vuelva a dibujar.
      key: `stack-${leader.id}-${members.length}-${second.id.slice(0, 6)}`,
      latitude: members.reduce((sum, m) => sum + m.latitude, 0) / members.length,
      longitude: members.reduce((sum, m) => sum + m.longitude, 0) / members.length,
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
