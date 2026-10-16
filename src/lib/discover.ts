// Lógica pura del panel de explorar: Descubre, encabezado, recomendaciones y la
// tarjeta del dueño. Sin React para poder probarla con Node.

import { containsPoint, type Box } from './mapArea';

export const MINUTE = 60_000;

/** "20:00" → "8:00 pm"; "24h" → "las 24 horas". */
export function formatClockLabel(hhmm?: string | null): string {
  if (!hhmm) return '';
  if (hhmm === '24h') return 'las 24 horas';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** «Abierto · hasta las 8:00 pm», «Abierto las 24 horas» o «Abierto». */
export function openLine(closesAt?: string | null): string {
  if (closesAt === '24h') return 'Abierto las 24 horas';
  const clock = formatClockLabel(closesAt);
  return clock ? `Abierto · hasta las ${clock}` : 'Abierto';
}

/** Tiempo corto para pastillas: «25 min», «2 h», «3 d». */
export function shortLeft(ms: number): string {
  const m = Math.max(1, Math.round(ms / MINUTE));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/** «hace 5 min», «hace 2 h», «hace 3 d». */
export function agoLabel(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / MINUTE));
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
}

export interface Pill {
  kind: 'offer' | 'new';
  text: string;
}

/** La única pastilla de una tarjeta de Descubre, según su razón. Nunca una cantidad. */
export function reasonPill(reason: { kind: string; ends_at?: string; posted_at?: string }, now: number): Pill | null {
  if (reason.kind === 'offer' && reason.ends_at) {
    const ms = Date.parse(reason.ends_at) - now;
    return ms > 0 ? { kind: 'offer', text: shortLeft(ms) } : null;
  }
  if (reason.kind === 'new' && reason.posted_at) return { kind: 'new', text: `Nuevo · ${agoLabel(reason.posted_at, now)}` };
  return null;
}

/** Radio de una búsqueda nueva alrededor de la persona: se busca en su zona, no en todo el país. */
export const SEARCH_NEAR_KM = 5;

export type SearchScope = 'near' | 'zone' | 'all';

/** Rectángulo de `km` de radio alrededor de un punto (para discovery). */
export function boxAround(center: { latitude: number; longitude: number }, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.1));
  const r = (n: number) => +n.toFixed(5);
  return { min_lat: r(center.latitude - dLat), max_lat: r(center.latitude + dLat), min_lng: r(center.longitude - dLng), max_lng: r(center.longitude + dLng) };
}

/** Cómo se nombra el alcance de la búsqueda en el panel. */
export function scopeText(scope: SearchScope): string {
  return scope === 'near' ? 'cerca de ti' : scope === 'zone' ? 'en esta zona' : 'en todas las zonas';
}

export interface HeaderInput {
  searching: boolean;
  query: string;
  status: 'loading' | 'error' | 'ok';
  results: number;
  scope: SearchScope;
  zoneCount: number;
  categoryName?: string | null;
  /** Pestaña sin búsqueda: Descubre (los destacados de tu zona) o Todos (destacados + adicionales). */
  view?: 'discover' | 'results';
  /** Negocios cerca pero fuera de tu zona (los «adicionales» de Todos). */
  extraCount?: number;
}

/** Título y subtítulo del panel: Descubre sin búsqueda, la consulta con búsqueda. */
export function sheetHeader(h: HeaderInput): { title: string; subtitle: string } {
  if (!h.searching) {
    // Los destacados son los negocios directamente en tu zona; Todos suma los adicionales cerca.
    if (h.view === 'results') {
      const extra = h.extraCount ?? 0;
      return {
        title: `Todos cerca de ti${h.categoryName ? ` en ${h.categoryName}` : ''}`,
        subtitle: `${h.zoneCount} en tu zona${extra > 0 ? ` · ${extra} ${extra === 1 ? 'adicional' : 'adicionales'}` : ''}`,
      };
    }
    return {
      title: `Descubre cerca de ti${h.categoryName ? ` en ${h.categoryName}` : ''}`,
      subtitle: `${h.zoneCount} ${h.zoneCount === 1 ? 'destacado' : 'destacados'} en tu zona`,
    };
  }
  const subtitle =
    h.status === 'loading'
      ? 'Buscando…'
      : h.status === 'error'
        ? 'No se pudo cargar'
        : h.results === 0
          ? 'Sin resultados'
          : `${h.results} ${h.results === 1 ? 'resultado' : 'resultados'}`;
  return { title: `«${h.query}»`, subtitle };
}

interface WithSubs {
  id: string;
  category_id: string;
  subcategory_ids?: string[];
}

/**
 * «También podría interesarte»: negocios de la misma categoría que los
 * resultados pero de otras subcategorías, que no estén ya en los resultados.
 * Conserva el orden del servidor y trae hasta `max`.
 */
export function relatedFrom<T extends WithSubs>(results: WithSubs[], candidates: T[], max = 4): T[] {
  if (results.length === 0) return [];
  const ids = new Set(results.map((r) => r.id));
  const cats = new Set(results.map((r) => r.category_id));
  const subs = new Set(results.flatMap((r) => r.subcategory_ids ?? []));
  return candidates
    .filter((c) => !ids.has(c.id) && cats.has(c.category_id))
    .filter((c) => (c.subcategory_ids ?? []).length > 0 && !(c.subcategory_ids ?? []).some((s) => subs.has(s)))
    .slice(0, max);
}

export interface OwnerChecklist {
  percent: number;
  todo: { key: 'cover' | 'tagline' | 'offer'; title: string; why: string }[];
}

/** Qué tan completa está la tarjeta del dueño en Descubre y qué le falta. */
export function ownerChecklist(input: { hasCover: boolean; hasTagline: boolean; hasOffer: boolean }): OwnerChecklist {
  const items = [
    { key: 'cover' as const, done: input.hasCover, weight: 50, title: 'Sube una foto de portada', why: 'las tarjetas con foto se ven completas en Descubre; sin ella sale el círculo con el icono.' },
    { key: 'tagline' as const, done: input.hasTagline, weight: 25, title: 'Escribe una frase corta', why: 'es la línea que ven los clientes bajo tu nombre.' },
    { key: 'offer' as const, done: input.hasOffer, weight: 25, title: 'Publica una oferta relámpago', why: 'aparece en «Ofertas que terminan pronto» con su franja naranja.' },
  ];
  return {
    percent: items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0),
    todo: items.filter((i) => !i.done).map(({ key, title, why }) => ({ key, title, why })),
  };
}

/** Indicaciones de una oferta para la ficha del perfil. */
export function offerIndications(o: { conditions?: string; ends_at: string; radius_meters: number; claim_window_minutes?: number; repeat_policy?: string }): { label: string; value: string }[] {
  const end = new Date(o.ends_at);
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const hh = end.getHours(), mm = end.getMinutes();
  const clock = `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'pm' : 'am'}`;
  const win = o.claim_window_minutes ?? 0;
  const winText = win >= 60 ? `${win / 60} h` : `${win} min`;
  const rows = [
    o.conditions?.trim() ? { label: 'Condiciones', value: o.conditions.trim() } : null,
    { label: 'Vigencia', value: `Hasta el ${days[end.getDay()]} a las ${clock}` },
    { label: 'Dónde', value: `Válida a ${o.radius_meters} m del negocio` },
    { label: 'Por persona', value: o.repeat_policy === 'daily' ? '1 reclamo al día' : '1 reclamo' },
    win > 0 ? { label: 'Al reclamar', value: `Tienes ${winText} para usarla; el QR sirve una sola vez` } : null,
  ];
  return rows.filter((r): r is { label: string; value: string } => r !== null);
}

// ---------------------------------------------------------------------------
// «En esta zona»: destacados (tu zona) y adicionales (cerca, otra zona)
// ---------------------------------------------------------------------------

/** Fichas que se muestran en Descubre; si hay más, «Ver los N» lleva a Todos. */
export const ZONE_FICHA_MAX = 6;
/** Desde este número de fichas se agrupan en «Con oferta ahora», «Abiertos»… */
export const GROUP_FROM = 4;
/** Cuántos adicionales se ofrecen. */
export const EXTRAS_MAX = 6;

/** «★ 4,8 (31)» con coma y la cantidad siempre a la vista; sin reseñas, «Aún sin reseñas» (nunca 0,0). */
export function ratingText(avg: number | null | undefined, count: number | null | undefined): { text: string; hasReviews: boolean } {
  const n = count ?? 0;
  if (n > 0 && typeof avg === 'number' && avg > 0) return { text: `★ ${avg.toFixed(1).replace('.', ',')} (${n})`, hasReviews: true };
  return { text: 'Aún sin reseñas', hasReviews: false };
}

/** «Abierto» / «Cerrado»; null si el negocio no publicó horario (no se afirma nada). */
export function statusText(open: boolean | null | undefined): 'Abierto' | 'Cerrado' | null {
  if (open === true) return 'Abierto';
  if (open === false) return 'Cerrado';
  return null;
}

interface FichaLike {
  open: boolean | null;
  pill?: { kind: string } | null;
}

export interface FichaGroup<T> {
  id: 'all' | 'offer' | 'open' | 'closed' | 'unknown';
  /** Vacío cuando no se agrupa. */
  title: string;
  items: T[];
}

/**
 * Con 4 o más fichas se agrupan: con oferta (primero), abiertos, cerrados y, aparte, los que no
 * publicaron horario. Con menos, una sola lista. El orden dentro de cada grupo es el recibido.
 */
export function groupFeatured<T extends FichaLike>(items: T[]): FichaGroup<T>[] {
  if (items.length < GROUP_FROM) return [{ id: 'all', title: '', items }];
  const offer = items.filter((i) => i.pill?.kind === 'offer');
  const rest = items.filter((i) => i.pill?.kind !== 'offer');
  const groups: FichaGroup<T>[] = [
    { id: 'offer', title: 'Con oferta ahora', items: offer },
    { id: 'open', title: 'Abiertos', items: rest.filter((i) => i.open === true) },
    { id: 'closed', title: 'Cerrados ahora', items: rest.filter((i) => i.open === false) },
    { id: 'unknown', title: 'Sin horario publicado', items: rest.filter((i) => i.open === null) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Las primeras `max` fichas y cuántas quedaron fuera (para «Ver los N»). */
export function capFichas<T>(items: T[], max: number = ZONE_FICHA_MAX): { shown: T[]; hidden: number } {
  return { shown: items.slice(0, max), hidden: Math.max(0, items.length - max) };
}

interface Located {
  id: string;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
}

/**
 * Adicionales: negocios ya conocidos (los pines acumulados) que están cerca pero NO dentro de la
 * zona que se ve, por cercanía (los que no tienen distancia, al final), sin repetir y hasta `max`.
 */
export function pickExtras<T extends Located>(known: T[], visible: Box, max: number = EXTRAS_MAX): T[] {
  const seen = new Set<string>();
  return known
    .map((item, order) => ({ item, order }))
    .filter(({ item }) => !(item.latitude === 0 && item.longitude === 0) && !containsPoint(visible, item))
    .filter(({ item }) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .sort((a, b) => {
      const da = a.item.distanceKm;
      const db = b.item.distanceKm;
      if (da === null && db === null) return a.order - b.order;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db || a.order - b.order;
    })
    .slice(0, max)
    .map(({ item }) => item);
}

export type ZoneState = 'list' | 'extras-only' | 'none';

/** Qué muestra «En esta zona»: los destacados, solo los adicionales, o nada (con salidas). */
export function zoneState(destacados: number, extras: number): ZoneState {
  if (destacados > 0) return 'list';
  return extras > 0 ? 'extras-only' : 'none';
}

/** Aviso al final de Descubre: «4 negocios más cerca de ti». Null si no hay adicionales. */
export function extrasTeaser(extras: number): string | null {
  if (extras <= 0) return null;
  return `${extras} ${extras === 1 ? 'negocio más' : 'negocios más'} cerca de ti`;
}
