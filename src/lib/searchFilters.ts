/**
 * Un solo buscador (3.66): los mismos filtros, con las mismas palabras y en el mismo orden, en la búsqueda de Inicio y
 * en Finder. Solo se ofrece lo que hay con qué filtrar (sin «se puede reservar» mientras no llegue ese dato). Sin React
 * para probarlo con Node.
 */
import type { GroupId } from './categoryGroups';

export type SortKey = 'near' | 'rating' | 'cheap';
export type WalkMin = 5 | 10 | 15;

export interface SearchFilters {
  open: boolean;
  /** Hasta cuántos minutos a pie; null = sin límite. */
  walk: WalkMin | null;
  offer: boolean;
  delivery: boolean;
  verified: boolean;
  group: GroupId | null;
  sort: SortKey;
}

export const NO_FILTERS: SearchFilters = { open: false, walk: null, offer: false, delivery: false, verified: false, group: null, sort: 'near' };

/** Lo que cada pantalla puede filtrar con los datos que tiene. */
export interface FilterCaps {
  /** Hay calificaciones (Finder sí; la búsqueda de Inicio todavía no). */
  rating: boolean;
  /** Hay precios para ordenar por lo más económico. */
  cheap: boolean;
  /** Se sabe dónde está la persona (sin ubicación no hay «a X min»). */
  distance: boolean;
}

/** 80 m por minuto a pie, lo mismo que usa Finder. */
export const walkMeters = (min: WalkMin) => min * 80;

export function activeCount(f: SearchFilters): number {
  return Number(f.open) + Number(f.walk !== null) + Number(f.offer) + Number(f.delivery) + Number(f.verified) + Number(f.group !== null) + Number(f.sort !== 'near');
}

export type QuickKey = 'open' | 'walk' | 'offer' | 'delivery' | 'group';

/** Los filtros rápidos al lado de «Filtros», siempre en este orden. «Tipo» abre la hoja; los demás se encienden. */
export function quickChips(f: SearchFilters, caps: FilterCaps, groupName?: string): { key: QuickKey; label: string; on: boolean }[] {
  const out: { key: QuickKey; label: string; on: boolean }[] = [{ key: 'open', label: 'Abierto ahora', on: f.open }];
  if (caps.distance) out.push({ key: 'walk', label: f.walk ? `A ${f.walk} min` : 'Cerca', on: f.walk !== null });
  out.push({ key: 'offer', label: 'Con oferta', on: f.offer }, { key: 'delivery', label: 'Domicilio', on: f.delivery });
  out.push({ key: 'group', label: f.group && groupName ? groupName : 'Tipo', on: f.group !== null });
  return out;
}

/** Tocar un filtro rápido: lo enciende o lo quita. «Cerca» enciende 10 min. */
export function toggleQuick(f: SearchFilters, key: Exclude<QuickKey, 'group'>): SearchFilters {
  if (key === 'walk') return { ...f, walk: f.walk ? null : 10 };
  return { ...f, [key]: !f[key] };
}

export interface FilterOption {
  id: string;
  label: string;
  on: boolean;
  apply: (f: SearchFilters) => SearchFilters;
}

export interface FilterSection {
  title: string;
  note?: string;
  options: FilterOption[];
}

/** La hoja de Filtros: Ordenar, Qué tan cerca, Qué tipo de negocio y Lo que necesitas. */
export function sheetSections(f: SearchFilters, caps: FilterCaps, groups: { id: GroupId; name: string }[]): FilterSection[] {
  const sort: FilterOption[] = [{ id: 'near', label: caps.distance ? 'Más cerca' : 'Relevancia', on: f.sort === 'near', apply: (x) => ({ ...x, sort: 'near' }) }];
  if (caps.rating) sort.push({ id: 'rating', label: 'Mejor valorados', on: f.sort === 'rating', apply: (x) => ({ ...x, sort: 'rating' }) });
  if (caps.cheap) sort.push({ id: 'cheap', label: 'Más económico', on: f.sort === 'cheap', apply: (x) => ({ ...x, sort: 'cheap' }) });
  const out: FilterSection[] = [];
  if (sort.length > 1) out.push({ title: 'Ordenar', note: 'Nadie paga por salir primero.', options: sort });
  if (caps.distance) {
    out.push({
      title: 'Qué tan cerca',
      options: [
        ...([5, 10, 15] as WalkMin[]).map((m) => ({ id: `w${m}`, label: `${m} min a pie`, on: f.walk === m, apply: (x: SearchFilters) => ({ ...x, walk: x.walk === m ? null : m }) })),
        { id: 'wall', label: 'Sin límite', on: f.walk === null, apply: (x: SearchFilters) => ({ ...x, walk: null }) },
      ],
    });
  }
  if (groups.length) out.push({ title: 'Qué tipo de negocio', options: groups.map((g) => ({ id: g.id, label: g.name, on: f.group === g.id, apply: (x: SearchFilters) => ({ ...x, group: x.group === g.id ? null : g.id }) })) });
  out.push({
    title: 'Lo que necesitas',
    options: [
      { id: 'open', label: 'Abierto ahora', on: f.open, apply: (x) => ({ ...x, open: !x.open }) },
      { id: 'offer', label: 'Con oferta hoy', on: f.offer, apply: (x) => ({ ...x, offer: !x.offer }) },
      { id: 'delivery', label: 'Domicilio', on: f.delivery, apply: (x) => ({ ...x, delivery: !x.delivery }) },
      { id: 'verified', label: 'Verificado', on: f.verified, apply: (x) => ({ ...x, verified: !x.verified }) },
    ],
  });
  return out;
}

/** Lo que se necesita saber de un lugar para filtrarlo. `null` = no se sabe (y no se descarta por eso, salvo distancia). */
export interface Filterable {
  open: boolean | null;
  meters: number | null;
  offer: boolean;
  delivery: boolean;
  verified?: boolean;
  group?: GroupId | null;
  rating?: number | null;
  price?: number | null;
}

/**
 * Aplica los filtros y el orden. Sin datos de distancia, el filtro de distancia no deja pasar (no se puede afirmar que
 * está cerca); sin horario publicado, «abierto ahora» tampoco. El orden es estable: a igualdad, se respeta el que vino.
 */
export function applyFilters<T>(items: T[], f: SearchFilters, pick: (t: T) => Filterable): T[] {
  const max = f.walk ? walkMeters(f.walk) : null;
  const kept = items
    .map((t, i) => ({ t, x: pick(t), i }))
    .filter(({ x }) => (!f.open || x.open === true) && (max === null || (x.meters !== null && x.meters <= max)) && (!f.offer || x.offer) && (!f.delivery || x.delivery) && (!f.verified || x.verified === true) && (!f.group || x.group === f.group));
  if (f.sort === 'rating') kept.sort((a, b) => (b.x.rating ?? -1) - (a.x.rating ?? -1) || a.i - b.i);
  else if (f.sort === 'cheap') kept.sort((a, b) => (a.x.price ?? Infinity) - (b.x.price ?? Infinity) || a.i - b.i);
  return kept.map((k) => k.t);
}

/** «3 lugares · más cerca primero» */
export function resultsTitle(n: number, f: SearchFilters, caps: FilterCaps): string {
  const count = n === 0 ? 'Sin lugares' : n === 1 ? '1 lugar' : `${n} lugares`;
  const order = f.sort === 'rating' ? 'mejor valorados primero' : f.sort === 'cheap' ? 'más económicos primero' : caps.distance ? 'más cerca primero' : null;
  return n && order ? `${count} · ${order}` : count;
}

/** «Ver 3 lugares» para el botón de la hoja. */
export function seeLabel(n: number): string {
  return n === 0 ? 'Nada con estos filtros' : n === 1 ? 'Ver 1 lugar' : `Ver ${n} lugares`;
}

/** Los filtros que entiende el servidor de «Pregúntale» (abierto, oferta, domicilio y más barato). */
export function toAsk(f: SearchFilters): { open_now: boolean; with_offer: boolean; delivery: boolean; cheapest: boolean } {
  return { open_now: f.open, with_offer: f.offer, delivery: f.delivery, cheapest: f.sort === 'cheap' };
}

export function fromAsk(a: { open_now: boolean; with_offer: boolean; delivery: boolean; cheapest: boolean }, base: SearchFilters = NO_FILTERS): SearchFilters {
  return { ...base, open: a.open_now, offer: a.with_offer, delivery: a.delivery, sort: a.cheapest ? 'cheap' : base.sort === 'cheap' ? 'near' : base.sort };
}
