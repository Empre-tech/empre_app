// Reglas de montaje del perfil del negocio (maqueta `perfil_final.html`). Lógica pura, sin React, para probarla con Node.

// ---------- Ofertas ----------

/** Cuántas ofertas se muestran como máximo en el perfil; con más, «Ver todas las ofertas». */
export const OFFERS_MAX = 5;

export type OffersMode = 'none' | 'single' | 'stack' | 'carousel';

/** 0 no sale; 1 tarjeta completa; 2 apiladas; 3 o más, carrusel. */
export function offersMode(count: number): OffersMode {
  if (count <= 0) return 'none';
  if (count === 1) return 'single';
  if (count === 2) return 'stack';
  return 'carousel';
}

/** Con más de 5 ofertas el carrusel termina en «Ver todas las ofertas». */
export function offersHasAll(count: number): boolean {
  return count > OFFERS_MAX;
}

/** Cuántas tarjetas de oferta se dibujan. */
export function offersShown(count: number): number {
  return Math.min(Math.max(count, 0), OFFERS_MAX);
}

// ---------- Reseñas ----------

/** Desde cuántas reseñas el perfil muestra un adelanto de 3 y «Ver todas» (con menos se muestran todas). */
export const REVIEWS_PREVIEW_FROM = 10;
export const REVIEWS_PREVIEW_COUNT = 3;

export type ReviewsMode = 'empty' | 'count' | 'all' | 'preview';

/** 0 vacío; 1 o 2 solo el número y las reseñas; 3 a 9 nota y todas; 10 o más nota y adelanto. */
export function reviewsMode(count: number): ReviewsMode {
  if (count <= 0) return 'empty';
  if (count < 3) return 'count';
  if (count < REVIEWS_PREVIEW_FROM) return 'all';
  return 'preview';
}

interface ReviewLike {
  verified?: boolean;
  created_at: string;
}

/** El adelanto: las verificadas primero y, dentro de cada grupo, las más recientes; hasta 3. */
export function previewReviews<T extends ReviewLike>(reviews: T[]): T[] {
  return [...reviews]
    .sort((a, b) => Number(Boolean(b.verified)) - Number(Boolean(a.verified)) || Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, REVIEWS_PREVIEW_COUNT);
}

/** «María Pérez» → «María P.»: el nombre y la inicial del último apellido; una sola palabra se deja igual. */
export function shortName(full: string | null | undefined): string {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const last = Array.from(parts[parts.length - 1])[0] ?? '';
  return `${parts[0]} ${last.toUpperCase()}.`;
}

// ---------- Fotos ----------

/** Imágenes de la galería de la portada y celdas máximas del mosaico. */
export const COVER_MAX = 4;
export const MOSAIC_CELLS = 5;

export type CoverMode = 'fallback' | 'single' | 'gallery';
export type MosaicKind = 'none' | 'wide' | 'half' | 'big';

export interface PhotosPlan {
  cover: CoverMode;
  /** Cuántas imágenes entran a la portada. */
  coverCount: number;
  mosaic: MosaicKind;
  /** Cuántas celdas del mosaico se dibujan (la primera es la grande en el tipo «big»). */
  cells: number;
  /** Las que no caben y se anuncian con «+N» (0 = ninguna). */
  extra: number;
}

/**
 * 0 portada de color; 1 o 2 una portada fija; 3 o más galería de hasta 4. El mosaico muestra las que siguen a las
 * de la portada: 1 ancha, 2 medias, 3 a 5 una grande y las pequeñas que haya, 6 o más una grande, cuatro pequeñas y
 * «+N» en la última. Con 4 fotos o menos no hay mosaico (la portada ya las cubre).
 */
export function photosPlan(count: number): PhotosPlan {
  const n = Math.max(0, Math.floor(count));
  const cover: CoverMode = n === 0 ? 'fallback' : n <= 2 ? 'single' : 'gallery';
  const coverCount = n === 0 ? 0 : n <= 2 ? 1 : Math.min(COVER_MAX, n);
  const rest = Math.max(0, n - COVER_MAX);
  if (rest === 0) return { cover, coverCount, mosaic: 'none', cells: 0, extra: 0 };
  if (rest === 1) return { cover, coverCount, mosaic: 'wide', cells: 1, extra: 0 };
  if (rest === 2) return { cover, coverCount, mosaic: 'half', cells: 2, extra: 0 };
  return { cover, coverCount, mosaic: 'big', cells: Math.min(rest, MOSAIC_CELLS), extra: Math.max(0, rest - MOSAIC_CELLS) };
}

// ---------- Secciones, índice rápido y orden ----------

export type SectionId = 'offers' | 'services' | 'photos' | 'reviews';

export interface SectionInput {
  offers: number;
  hasServices: boolean;
  photos: number;
  isOwner: boolean;
}

/** Las secciones que existen, en su orden; el dueño siempre tiene «Fotos» (ahí está «+ Nueva»). */
export function sections(i: SectionInput): SectionId[] {
  const out: SectionId[] = [];
  if (i.offers > 0) out.push('offers');
  if (i.hasServices) out.push('services');
  if (i.photos > COVER_MAX || i.isOwner) out.push('photos');
  out.push('reviews');
  return out;
}

/** El índice rápido solo sale con 3 o más secciones. */
export function showQuickIndex(list: SectionId[]): boolean {
  return list.length >= 3;
}

export const SECTION_LABEL: Record<SectionId, string> = { offers: 'Ofertas', services: 'Servicios', photos: 'Fotos', reviews: 'Reseñas' };

export type BlockId = 'closedNote' | 'recsTop' | 'offers' | 'quote' | 'about' | 'services' | 'photos' | 'reviews' | 'recsBottom';

export interface OrderInput {
  /** true/false si publicó horario; null si no. */
  open: boolean | null;
  isOwner: boolean;
}

/**
 * El orden de los bloques: cerrado, primero el aviso y las alternativas abiertas (salvo al dueño, que no ve
 * recomendaciones); luego ofertas, la cita de una reseña, sobre el negocio, servicios, fotos y reseñas; las
 * recomendaciones, al final cuando está abierto o no se sabe.
 */
export function blockOrder(i: OrderInput): BlockId[] {
  const out: BlockId[] = [];
  if (i.open === false) {
    out.push('closedNote');
    if (!i.isOwner) out.push('recsTop');
  }
  out.push('offers', 'quote', 'about', 'services', 'photos', 'reviews');
  if (i.open !== false && !i.isOwner) out.push('recsBottom');
  return out;
}

// ---------- Recomendaciones ----------

export const RECS_MAX = 6;
export const RECS_RADIUS_KM = 2;

interface RecCandidate {
  id: string;
  category_id: string;
  is_open_now: boolean;
  has_hours: boolean;
  distanceKm: number | null;
}

/**
 * «Más como este, cerca de ti»: otros negocios de la misma categoría a menos de 2 km, en el orden en que llegan
 * (el del listado de descubrimiento: sin patrocinados ni favoritos), sin el propio negocio. Si el visitado está
 * cerrado, solo los que están abiertos ahora. Hasta 6.
 */
export function pickRecommendations<T extends RecCandidate>(self: { id: string; category_id: string }, candidates: T[], selfClosed: boolean): T[] {
  return candidates
    .filter((c) => c.id !== self.id && c.category_id === self.category_id)
    .filter((c) => c.distanceKm !== null && c.distanceKm <= RECS_RADIUS_KM)
    .filter((c) => !selfClosed || (c.has_hours && c.is_open_now))
    .slice(0, RECS_MAX);
}

/** La razón que dice cada recomendación: «Oferta» si tiene una vigente, «Abierto ahora» si está abierto. */
export function recReason(c: { is_open_now: boolean; has_hours: boolean; has_active_offer?: boolean }): 'offer' | 'open' | null {
  if (c.has_active_offer) return 'offer';
  if (c.has_hours && c.is_open_now) return 'open';
  return null;
}

// ---------- La cita de una reseña ----------

export const QUOTE_MIN_CHARS = 20;
export const QUOTE_MAX_CHARS = 90;
export const QUOTE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

interface QuoteReview {
  comment: string;
  verified?: boolean;
  created_at: string;
  rating: number;
  user: { name: string };
}

/** Una línea y de hasta 90 letras, cortando en una palabra y cerrando con «…». */
export function trimQuote(text: string): string {
  const flat = text.split(/\s+/).filter(Boolean).join(' ');
  const chars = Array.from(flat);
  if (chars.length <= QUOTE_MAX_CHARS) return flat;
  const cut = chars.slice(0, QUOTE_MAX_CHARS).join('');
  const i = cut.lastIndexOf(' ');
  const base = i > QUOTE_MAX_CHARS / 2 ? cut.slice(0, i) : cut;
  return `${base.replace(/[ ,.;:]+$/, '')}…`;
}

/**
 * La cita del perfil: la reseña más reciente que sea verificada, con comentario de al menos 20 letras y de los últimos
 * 90 días (la misma regla del servidor para los destacados); sin filtrar por nota. Sin ninguna, no hay cita.
 */
export function pickQuote(reviews: QuoteReview[], now: number): { text: string; author: string; rating: number; createdAt: string } | null {
  const best = reviews
    .filter((r) => r.verified && r.comment.trim().length >= QUOTE_MIN_CHARS)
    .filter((r) => {
      const age = now - Date.parse(r.created_at);
      return age >= 0 && age <= QUOTE_MAX_AGE_MS;
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return best ? { text: trimQuote(best.comment), author: shortName(best.user.name), rating: best.rating, createdAt: best.created_at } : null;
}
