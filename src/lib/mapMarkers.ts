// Qué pines dibuja el mapa y en qué orden aparecen (3.29, mockup `mapa_fluido.html`). Sin React para probarlo con Node.
//
// Antes se dibujaba todo lo guardado alrededor (hasta 4 pantallas a cada lado): en una simulación, 150 marcadores de
// media para 42 visibles. Cada marcador es una vista que el mapa copia como imagen, así que arrastrar y rotar pesaba.

import type { Coords } from './geo';

/** Tope de marcadores de negocios en el mapa (el mismo que el de las burbujas). */
export const MAX_PINS = 60;
/** Margen alrededor de lo visible (10 % por lado): un arrastre corto no deja huecos en el borde. */
export const VIEW_MARGIN = 0.1;
/** Los pines nuevos entran en tandas de 8 cada 40 ms, del centro hacia afuera. */
export const REVEAL_BATCH = 8;
export const REVEAL_MS = 40;

export interface RegionLike {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Lo que está dentro de la región con un margen (fracción del alto y del ancho por lado). */
export function inView<T extends Coords>(items: T[], r: RegionLike, margin: number = VIEW_MARGIN): T[] {
  const halfLat = (r.latitudeDelta / 2) * (1 + margin * 2);
  const halfLng = (r.longitudeDelta / 2) * (1 + margin * 2);
  return items.filter((it) => Math.abs(it.latitude - r.latitude) <= halfLat && Math.abs(it.longitude - r.longitude) <= halfLng);
}

interface PinLike extends Coords {
  id: string;
  has_active_offer?: boolean;
  has_hours?: boolean;
  is_open_now?: boolean;
}

/**
 * Si hay más de `max`, se quedan primero el elegido, luego los que tienen oferta, luego los abiertos y luego el resto,
 * respetando el orden del servidor dentro de cada grupo (el cliente no reordena el ranking).
 */
export function capPins<T extends PinLike>(items: T[], selectedId: string | null, max: number = MAX_PINS): T[] {
  if (items.length <= max) return items;
  const rank = (it: T) => (it.id === selectedId ? 0 : it.has_active_offer ? 1 : it.has_hours && it.is_open_now ? 2 : 3);
  return items
    .map((it, i) => ({ it, i, r: rank(it) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.it);
}

/** Qué falta por mostrar, del centro hacia afuera (la ola de aparición). */
export function revealOrder<T extends { key: string } & Coords>(items: T[], shown: ReadonlySet<string>, center: Coords): T[] {
  const d = (p: Coords) => (p.latitude - center.latitude) ** 2 + (p.longitude - center.longitude) ** 2;
  return items.filter((it) => !shown.has(it.key)).sort((a, b) => d(a) - d(b));
}

/** La siguiente tanda: con «Reducir movimiento», todo de una vez (sin ola). */
export function nextReveal<T extends { key: string }>(pending: T[], reduce: boolean, batch: number = REVEAL_BATCH): T[] {
  return reduce ? pending : pending.slice(0, batch);
}

/** Anillo alrededor de lo visible que también se dibuja (3.30): media pantalla por lado, así al arrastrar el borde que
 * entra ya tiene sus pines. Solo se llena con lo que sobra del tope después de lo visible. */
export const RING_MARGIN = 0.5;

/**
 * Qué pines dibujar (3.30, `mapa_sin_huecos.html`): primero lo visible (+10 %) con su prioridad de `capPins` y, si
 * sobra tope, el anillo de media pantalla alrededor, con la misma prioridad. Lo que está en pantalla nunca se pierde por
 * un pin del anillo.
 */
export function pickPins<T extends PinLike>(items: T[], r: RegionLike, selectedId: string | null, max: number = MAX_PINS): T[] {
  const core = capPins(inView(items, r, VIEW_MARGIN), selectedId, max);
  if (core.length >= max) return core;
  const ids = new Set(core.map((it) => it.id));
  const ring = inView(items, r, RING_MARGIN).filter((it) => !ids.has(it.id));
  return [...core, ...capPins(ring, selectedId, max - core.length)];
}

/** Cada cuánto se rehace la lista durante el gesto: un cuarto de pantalla de recorrido o un 25 % de zoom. */
export const LIVE_STEP = 0.25;

/** ¿Hay que rehacer la lista de pines durante el gesto? Solo cuando el mapa avanzó lo bastante (pocos cálculos). */
export function shouldMoveList(list: RegionLike, next: RegionLike, step: number = LIVE_STEP): boolean {
  if (next.latitudeDelta <= 0 || list.latitudeDelta <= 0) return false;
  const zoom = next.latitudeDelta / list.latitudeDelta;
  if (zoom >= 1 + step || zoom <= 1 / (1 + step)) return true;
  return Math.abs(next.latitude - list.latitude) >= next.latitudeDelta * step || Math.abs(next.longitude - list.longitude) >= next.longitudeDelta * step;
}

/**
 * Quién es el marcador, sin su aspecto (3.32): la llave lleva el nivel de zoom y el estado, así que cambia al acercar o
 * al elegir. Si la ola de aparición usara la llave, un cambio de nivel vaciaría el mapa un momento y lo volvería a llenar
 * en tandas. Con la identidad, solo entran en tandas los negocios que de verdad son nuevos en pantalla.
 */
export function identityOf(
  m: { kind: 'business'; entity: { id: string } } | { kind: 'stack'; cluster: { key: string } } | { kind: 'bubble'; key: string },
): string {
  if (m.kind === 'business') return `b:${m.entity.id}`;
  if (m.kind === 'stack') return `s:${m.cluster.key}`;
  return m.key;
}
