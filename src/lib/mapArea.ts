// Área de consulta del mapa y pines acumulados. Sin React para poder probarla con Node.
//
// Idea: se pide un área más grande que la pantalla y solo se vuelve a pedir al
// salir de ella (o al acercarse mucho); los negocios que llegan se SUMAN a los
// que ya estaban, así una consulta nunca quita un pin que el usuario ve.

export interface Box {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

/** Cuánto más grande que la pantalla se pide (2 = el doble de ancho y de alto). */
export const FETCH_FACTOR = 2;
/** Si lo visible es menos que esta fracción del área pedida, conviene pedir con más detalle. */
export const ZOOM_IN_RATIO = 1 / 9;

const r = (n: number) => +n.toFixed(5);

/** Agranda un rectángulo desde su centro. */
export function padBox(box: Box, factor: number): Box {
  const cLat = (box.min_lat + box.max_lat) / 2;
  const cLng = (box.min_lng + box.max_lng) / 2;
  const hLat = ((box.max_lat - box.min_lat) / 2) * factor;
  const hLng = ((box.max_lng - box.min_lng) / 2) * factor;
  return { min_lat: r(cLat - hLat), max_lat: r(cLat + hLat), min_lng: r(cLng - hLng), max_lng: r(cLng + hLng) };
}

export function containsBox(outer: Box, inner: Box): boolean {
  return inner.min_lat >= outer.min_lat && inner.max_lat <= outer.max_lat && inner.min_lng >= outer.min_lng && inner.max_lng <= outer.max_lng;
}

export function containsPoint(box: Box, p: { latitude: number; longitude: number }): boolean {
  return p.latitude >= box.min_lat && p.latitude <= box.max_lat && p.longitude >= box.min_lng && p.longitude <= box.max_lng;
}

function area(box: Box): number {
  return Math.max(0, box.max_lat - box.min_lat) * Math.max(0, box.max_lng - box.min_lng);
}

/** ¿Hace falta otra consulta? Sí si lo visible se sale del área pedida o si se acercó mucho. */
export function needsRefetch(fetched: Box | null, visible: Box): boolean {
  if (!fetched) return true;
  if (!containsBox(fetched, visible)) return true;
  const a = area(fetched);
  return a > 0 && area(visible) / a < ZOOM_IN_RATIO;
}

/**
 * Suma los negocios recién llegados a los que ya estaban (los nuevos actualizan
 * a los viejos por id) y quita solo los que quedaron fuera de `keep`, un área
 * mucho más grande que la pantalla. Devuelve un mapa nuevo; no toca el anterior.
 */
export function mergePins<T extends { id: string; latitude: number; longitude: number }>(store: Map<string, T>, incoming: T[], keep: Box): Map<string, T> {
  const next = new Map<string, T>();
  for (const [id, item] of store) if (containsPoint(keep, item)) next.set(id, item);
  for (const item of incoming) next.set(item.id, item);
  return next;
}

/**
 * Lista de la zona visible a partir de lo acumulado: primero en el orden del
 * servidor (la última respuesta), después los que solo estaban guardados.
 */
export function visibleInOrder<T extends { id: string; latitude: number; longitude: number }>(store: Map<string, T>, latest: T[], visible: Box): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of latest) {
    const current = store.get(item.id) ?? item;
    if (containsPoint(visible, current) && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(current);
    }
  }
  for (const [id, item] of store) {
    if (!seen.has(id) && containsPoint(visible, item)) out.push(item);
  }
  return out;
}
