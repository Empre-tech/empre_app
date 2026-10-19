// Vitrina de ofertas (3.38, mockup ofertas_marketplace.html): lo que muestra cada tarjeta y qué secciones se ven.
// Las secciones las arma el servidor (sin repetir ofertas); aquí solo se decide cómo se dibujan. Sin React para
// probarlo con Node.

export interface MarketItem {
  id: string;
  entity_id: string;
  title: string;
  type: string;
  ends_at: string;
  price?: string;
  normal_price?: string;
  special_price?: number;
  reference_price?: number;
  entity_name: string;
  category_name: string;
  category_color?: string;
  category_icon?: string;
  photo?: string;
  /** null sin ubicación: nunca una distancia inventada. */
  distance_meters: number | null;
  reason?: string;
  trending?: boolean;
}

/** Tarjeta de «Por zona» (3.39): sin conteos; `looks` son hasta 3 categorías para el mosaico. */
export interface MarketZone {
  id: string;
  name: string;
  distance_meters: number | null;
  here: boolean;
  looks: { color?: string; icon?: string }[];
}

export interface MarketResponse {
  has_location: boolean;
  /** Ciudad de la vitrina (de la ubicación o, sin ella, la última conocida). Vacía = todas. */
  city: string;
  /** Zona donde está la persona; vacía si no está en ninguna. */
  zone: string;
  zones: MarketZone[];
  /** «Mayor ahorro de hoy» (3.40): por regla a la vista, nunca pagada; null si ninguna termina hoy con ahorro. */
  featured: MarketItem | null;
  near: MarketItem[];
  searched: { terms: { term: string; label: string }[]; term: string; items: MarketItem[] };
  trending: MarketItem[];
  for_you: { top_rated: boolean; items: MarketItem[] };
}

/** Una tanda de «Todas las ofertas de la ciudad»; `next_cursor` vacío = no hay más. */
export interface MarketPage {
  city: string;
  items: MarketItem[];
  next_cursor: string;
}

export type MarketSort = 'near' | 'ends' | 'save';

const digits = (s?: string) => {
  const d = (s ?? '').replace(/[^\d]/g, '');
  return d ? Number(d) : null;
};

/** «$25.000». */
export function pesos(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');
}

/** Precio de la tarjeta: el especial (o el de la oferta), el habitual tachado y el ahorro, solo si es real. */
export function priceView(o: Pick<MarketItem, 'price' | 'normal_price' | 'special_price' | 'reference_price'>): { now: string | null; was: string | null; save: string | null } {
  const now = o.special_price ?? digits(o.price);
  const was = o.special_price !== undefined && o.special_price !== null ? o.reference_price ?? null : digits(o.normal_price);
  const valid = now !== null && was !== null && was > now && now >= 0;
  return {
    now: now !== null && now > 0 ? pesos(now) : now === 0 ? 'Gratis' : null,
    was: valid ? pesos(was as number) : null,
    save: valid ? `-${Math.round((1 - (now as number) / (was as number)) * 100)} %` : null,
  };
}

/** «350 m» / «2,1 km»; null sin ubicación. */
export function distanceLabel(m: number | null | undefined): string | null {
  if (m === null || m === undefined || m < 0) return null;
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Cuánto queda, corto para la etiqueta de la foto; `urgent` a menos de 1 h. */
export function timeBadge(endsAt: string, now: number): { text: string; urgent: boolean } {
  const ms = Date.parse(endsAt) - now;
  if (!(ms > 0)) return { text: 'Terminó', urgent: false };
  const min = Math.ceil(ms / 60000);
  if (min < 60) return { text: `Termina en ${min} min`, urgent: true };
  const h = Math.floor(min / 60);
  if (h < 24) return { text: `${h} h`, urgent: false };
  const d = Math.floor(h / 24);
  return { text: d === 1 ? '1 día' : `${d} días`, urgent: false };
}

/** Lo que lee el lector de pantalla en una tarjeta. */
export function tileA11y(o: MarketItem, now: number): string {
  const p = priceView(o);
  return [o.title, o.entity_name, distanceLabel(o.distance_meters) ? `a ${distanceLabel(o.distance_meters)}` : null, p.now, p.save ? `ahorras ${p.save.replace('-', '')}` : null, timeBadge(o.ends_at, now).text, o.trending ? 'en tendencia' : null, o.reason ?? null]
    .filter(Boolean)
    .join(', ');
}

/** Qué secciones de lado se dibujan, en el orden pedido. Vacías no se muestran (el servidor ya esconde las pobres). */
export function visibleSections(r: MarketResponse | undefined): ('near' | 'searched' | 'trending' | 'for_you')[] {
  if (!r) return [];
  const out: ('near' | 'searched' | 'trending' | 'for_you')[] = [];
  if (r.near.length) out.push('near');
  if (r.searched.terms.length) out.push('searched');
  if (r.trending.length) out.push('trending');
  if (r.for_you.items.length) out.push('for_you');
  return out;
}

/** Órdenes de «Todas»: sin ubicación no se ofrece «Más cerca». */
export function sortOptions(hasLocation: boolean): { key: MarketSort; label: string }[] {
  const all: { key: MarketSort; label: string }[] = [
    { key: 'near', label: 'Más cerca' },
    { key: 'ends', label: 'Terminan pronto' },
    { key: 'save', label: 'Mayor ahorro' },
  ];
  return hasLocation ? all : all.filter((s) => s.key !== 'near');
}

/** El orden efectivo: si pidieron «cerca» sin ubicación, «terminan pronto». */
export function effectiveSort(sort: MarketSort, hasLocation: boolean): MarketSort {
  return sort === 'near' && !hasLocation ? 'ends' : sort;
}

/** Encabezado (3.39): «Ofertas en {ciudad}»; sin ciudad, solo «Ofertas». La ciudad la pone la ubicación, no un menú. */
export function heroTitle(city: string | undefined): { lead: string; city: string } {
  const c = (city ?? '').trim();
  return c ? { lead: 'Ofertas en ', city: c } : { lead: 'Ofertas', city: '' };
}

/** Línea bajo el título: dónde estás, o de dónde sale la ciudad sin ubicación. null = no hay nada cierto que decir. */
export function placeLine(r: Pick<MarketResponse, 'city' | 'zone'> | undefined, hasLocation: boolean): string | null {
  if (!r) return null;
  if (hasLocation) return r.zone ? `En ${r.zone}` : null;
  return r.city ? 'Según tu última ubicación' : null;
}

/** «Por zona» se muestra con 2 zonas o más (con una sola no hay a dónde ir). */
export function showZones(r: Pick<MarketResponse, 'zones'> | undefined): boolean {
  return Boolean(r && r.zones.length >= 2);
}

/** Lo que dice la tarjeta de una zona bajo su nombre. */
export function zoneSubtitle(z: MarketZone): string {
  if (z.here) return 'Donde estás';
  const d = distanceLabel(z.distance_meters);
  return d ? `A ${d}` : 'Ver sus ofertas';
}

/** Zonas para el filtro de la lista, en orden alfabético (las tarjetas van por cercanía). */
export function zoneFilterOrder(zones: MarketZone[]): MarketZone[] {
  return [...zones].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Título de la lista completa y el mensaje del final (sin decir cuántas son). */
export function listTitle(city: string, zoneName?: string): string {
  const where = zoneName || city;
  return where ? `Todas las ofertas de ${where}` : 'Todas las ofertas';
}
export function endText(city: string, zoneName?: string): string {
  const where = zoneName || city;
  return where ? `Ya viste todas las ofertas vigentes de ${where}.` : 'Ya viste todas las ofertas vigentes.';
}

/** Junta las tandas sin repetir (si una oferta cambia de lugar entre tandas, se queda la primera). */
export function flattenPages(pages: MarketPage[] | undefined): MarketItem[] {
  const seen = new Set<string>();
  const out: MarketItem[] = [];
  for (const p of pages ?? []) {
    for (const o of p.items) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push(o);
    }
  }
  return out;
}

/** Hay que pedir otra tanda cuando quedan menos de `margin` px por recorrer. */
export function nearEnd(e: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } }, margin = 600): boolean {
  return e.contentSize.height - (e.contentOffset.y + e.layoutMeasurement.height) < margin;
}

// ---------------------------------------------------------------------------
// 3.40 · Vitrina viva (mockup vitrina_viva.html)
// ---------------------------------------------------------------------------

/** Inicial del negocio para la tarjeta sin foto, sin el artículo («La Sazón» → «S»). */
export function initialOf(name: string): string {
  const clean = name.trim().replace(/^(la|el|los|las)\s+/i, '');
  const ch = Array.from(clean)[0] ?? '';
  return ch.toLocaleUpperCase('es');
}

const SHORT: Record<string, string> = {
  restaurantes: 'Comida',
  'cafeterias y postres': 'Café',
  'bares y vida nocturna': 'Bares',
  'tiendas y comercio': 'Tiendas',
  'belleza y peluqueria': 'Belleza',
  'salud y bienestar': 'Salud',
  'servicios del hogar': 'Hogar',
  'turismo y hospedaje': 'Turismo',
  automotriz: 'Autos',
  'eventos y fiestas': 'Eventos',
  'fotografia y diseno': 'Fotos',
  'deporte y recreacion': 'Deporte',
};
const fold = (s: string) => s.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '').trim();

/** Nombre corto de la categoría para la fila con iconos (una sola línea bajo el icono). */
export function shortCategory(name: string): string {
  const known = SHORT[fold(name)];
  if (known) return known;
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.length <= 10 ? first : `${first.slice(0, 9)}…`;
}

/** Etiqueta de tiempo de la tarjeta: bajo una hora, solo los minutos con reloj («38 min»); si no, como siempre. */
export function tileClock(endsAt: string, now: number): { text: string; urgent: boolean } {
  const t = timeBadge(endsAt, now);
  return t.urgent ? { text: t.text.replace(/^Termina en /, ''), urgent: true } : t;
}

/** Reloj de la destacada: «Termina en 38 min» o «Quedan 2 h». */
export function featuredClock(endsAt: string, now: number): { text: string; urgent: boolean } {
  const t = timeBadge(endsAt, now);
  if (t.urgent || t.text === 'Terminó') return t;
  return { text: `Quedan ${t.text}`, urgent: false };
}

/** Lo que lee el lector de pantalla en la destacada: la regla primero, para que nadie la tome por publicidad. */
export function featuredA11y(o: MarketItem, now: number): string {
  return `Mayor ahorro de hoy: ${tileA11y(o, now)}`;
}
