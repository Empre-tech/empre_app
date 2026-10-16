// Lógica pura del panel de explorar: Descubre, encabezado, recomendaciones y la
// tarjeta del dueño. Sin React para poder probarla con Node.

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
}

/** Título y subtítulo del panel: Descubre sin búsqueda, la consulta con búsqueda. */
export function sheetHeader(h: HeaderInput): { title: string; subtitle: string } {
  if (!h.searching) {
    return {
      title: `Descubre cerca de ti${h.categoryName ? ` en ${h.categoryName}` : ''}`,
      subtitle: `${h.zoneCount} ${h.zoneCount === 1 ? 'negocio' : 'negocios'} en esta zona`,
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
