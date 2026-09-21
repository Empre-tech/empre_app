import type { Coords } from './geo';

export interface Cluster<T extends Coords> {
  key: string;
  latitude: number;
  longitude: number;
  items: T[];
}

interface RegionLike {
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Agrupa pines por celdas de una cuadrícula que depende del zoom actual.
 * Suficiente para el MVP (cientos de negocios); si crece, migrar a supercluster.
 */
export function clusterItems<T extends Coords & { id: string }>(
  items: T[],
  region: RegionLike,
  cells = 7,
): Cluster<T>[] {
  // Muy cerca: mostramos cada negocio por separado.
  if (region.latitudeDelta < 0.004 || region.longitudeDelta < 0.004) {
    return items.map((item) => ({
      key: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
      items: [item],
    }));
  }

  const cellLat = region.latitudeDelta / cells;
  const cellLng = region.longitudeDelta / cells;
  const buckets = new Map<string, T[]>();

  for (const item of items) {
    const key = `${Math.floor(item.latitude / cellLat)}:${Math.floor(item.longitude / cellLng)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const clusters: Cluster<T>[] = [];
  buckets.forEach((list, key) => {
    const first = list[0];
    if (!first) return;
    if (list.length === 1) {
      clusters.push({ key: first.id, latitude: first.latitude, longitude: first.longitude, items: list });
      return;
    }
    const latitude = list.reduce((sum, i) => sum + i.latitude, 0) / list.length;
    const longitude = list.reduce((sum, i) => sum + i.longitude, 0) / list.length;
    clusters.push({ key: `cluster-${key}-${list.length}`, latitude, longitude, items: list });
  });
  return clusters;
}
