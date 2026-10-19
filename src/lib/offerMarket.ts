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

export interface MarketResponse {
  has_location: boolean;
  near: MarketItem[];
  searched: { terms: { term: string; label: string }[]; term: string; items: MarketItem[] };
  trending: MarketItem[];
  for_you: { top_rated: boolean; items: MarketItem[] };
  all: MarketItem[];
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
