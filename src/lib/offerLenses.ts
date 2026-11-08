/**
 * Ofertas por tendencias (3.61): las lentes con que se divide la vitrina, los filtros que se aplican encima y los
 * negocios que «dan la cara». Todo sale de lo que el servidor ya manda en `/api/offers/market`; nada se inventa y
 * nunca se cuentan ofertas.
 */
import type { MarketItem, MarketResponse, MarketSort } from './offerMarket';

export type LensKey = 'parati' | 'terminan' | 'buscado' | 'canjea' | 'valoradas';

export interface Lens {
  key: LensKey;
  label: string;
  title: string;
  why: string;
}

const LENSES: Record<LensKey, Omit<Lens, 'key'>> = {
  parati: { label: 'Para ti', title: 'Para ti', why: 'Por lo que sigues, buscas y reclamas' },
  terminan: { label: 'Terminan hoy', title: 'Terminan hoy', why: 'La que termina primero va arriba' },
  buscado: { label: 'Lo más buscado', title: 'Lo más buscado', why: 'Lo que la gente busca esta semana' },
  canjea: { label: 'Lo más reclamado', title: 'Lo más reclamado', why: 'Las que más se reclaman, últimas 48 h' },
  valoradas: { label: 'Mejor valoradas', title: 'Mejor valoradas', why: 'Según las reseñas de quienes fueron' },
};

const ORDER: LensKey[] = ['parati', 'terminan', 'buscado', 'canjea', 'valoradas'];

const isOffer = (o: MarketItem) => o.kind !== 'service';

function uniq(list: MarketItem[]): MarketItem[] {
  const seen = new Set<string>();
  return list.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}

/** ¿Termina hoy (en la hora del teléfono) y todavía no terminó? */
export function endsToday(endsAt: string | undefined, now: number): boolean {
  if (!endsAt) return false;
  const t = Date.parse(endsAt);
  if (!(t > now)) return false;
  const a = new Date(now);
  const b = new Date(t);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Las ofertas de una lente, sin servicios del catálogo (esos van en su propia fila). */
export function lensItems(key: LensKey, d: MarketResponse | undefined, now: number): MarketItem[] {
  if (!d) return [];
  const pool = uniq([...(d.featured ? [d.featured] : []), ...d.near, ...d.trending, ...d.for_you.items, ...d.searched.items]).filter(isOffer);
  switch (key) {
    case 'parati':
      return uniq((d.for_you.top_rated ? d.near : d.for_you.items).filter(isOffer));
    case 'terminan':
      return pool.filter((o) => endsToday(o.ends_at, now)).sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at));
    case 'buscado':
      return uniq(d.searched.items.filter(isOffer));
    case 'canjea':
      return uniq(d.trending.filter(isOffer));
    case 'valoradas':
      return d.for_you.top_rated ? uniq(d.for_you.items.filter(isOffer)) : [];
  }
}

/** Solo las lentes que tienen algo: con pocos datos hay menos pestañas, nunca una vacía. */
export function availableLenses(d: MarketResponse | undefined, now: number): Lens[] {
  return ORDER.filter((k) => lensItems(k, d, now).length > 0 || (k === 'buscado' && Boolean(d?.searched.terms.length))).map((k) => ({ key: k, ...LENSES[k] }));
}

const digits = (s?: string) => {
  const n = (s ?? '').replace(/[^\d]/g, '');
  return n ? Number(n) : null;
};

/** Cuánto se ahorra, en %, solo si es real (la misma regla de `priceView`). */
export function savePct(o: Pick<MarketItem, 'price' | 'normal_price' | 'special_price' | 'reference_price'>): number {
  const now = o.special_price ?? digits(o.price);
  const was = o.special_price !== undefined && o.special_price !== null ? o.reference_price ?? null : digits(o.normal_price);
  if (now === null || was === null || !(was > now) || now < 0) return 0;
  return Math.round((1 - now / was) * 100);
}

export interface LensFilters {
  openOnly: boolean;
  sort: MarketSort;
}

/** Los filtros de la hoja, encima de la lente. «Más cerca» deja el orden propio de la lente si no hay distancias. */
export function applyFilters(items: MarketItem[], f: LensFilters): MarketItem[] {
  const list = f.openOnly ? items.filter((o) => o.open_now !== false) : [...items];
  if (f.sort === 'ends') return list.sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at));
  if (f.sort === 'save') return list.sort((a, b) => savePct(b) - savePct(a));
  return list;
}

export interface BizFace {
  id: string;
  name: string;
  photo?: string | null;
  icon?: string | null;
  category?: string;
  hasOffer: boolean;
  distance: number | null;
}

/**
 * «Negocios ofreciendo hoy»: los que tienen oferta (aro naranja) y después los que solo publican catálogo (aro en
 * tinta), los más cercanos primero. Sin catálogo ni oferta, no sale.
 */
export function bizFaces(
  biz: { id: string; name: string; profile_url?: string | null; category_icon?: string | null; category_name?: string; has_active_offer?: boolean; distance_meters?: number | null }[],
  offers: Pick<MarketItem, 'entity_id' | 'entity_name' | 'kind' | 'distance_meters' | 'category_icon' | 'category_name'>[],
  catalogs: Record<string, unknown[]>,
  max = 10,
): BizFace[] {
  const byId = new Map<string, BizFace>();
  for (const o of offers) {
    if (o.kind === 'service' || byId.has(o.entity_id)) continue;
    byId.set(o.entity_id, { id: o.entity_id, name: o.entity_name, icon: o.category_icon, category: o.category_name, hasOffer: true, distance: o.distance_meters ?? null });
  }
  for (const b of biz) {
    const prev = byId.get(b.id);
    const hasCatalog = (catalogs[b.id]?.length ?? 0) > 0;
    if (prev) {
      prev.photo = b.profile_url;
      prev.icon = prev.icon ?? b.category_icon;
      continue;
    }
    if (b.has_active_offer || hasCatalog) byId.set(b.id, { id: b.id, name: b.name, photo: b.profile_url, icon: b.category_icon, category: b.category_name, hasOffer: Boolean(b.has_active_offer), distance: b.distance_meters ?? null });
  }
  return [...byId.values()]
    .sort((a, b) => Number(b.hasOffer) - Number(a.hasOffer) || (a.distance ?? Infinity) - (b.distance ?? Infinity))
    .slice(0, max);
}
