// Reglas de montaje del perfil del negocio (maqueta `perfil_final.html`). Lógica pura, sin React, para probarla con Node.

// ---------- Ofertas ----------
// Mismo formato que Fotos y Reseñas (maqueta `perfil_secciones.html`): una muestra y «Ver todas».

/** Cuántas ofertas se muestran en el perfil; con más, «Ver todas las ofertas» (sin número). */
export const OFFERS_SAMPLE = 2;

export type OffersMode = 'none' | 'single' | 'stack';

/** 0 no sale; 1 tarjeta completa (con su ciclo y condiciones); 2 o más, hasta 2 apiladas. */
export function offersMode(count: number): OffersMode {
  if (count <= 0) return 'none';
  return count === 1 ? 'single' : 'stack';
}

/** Con más de 2 ofertas la sección termina en «Ver todas las ofertas». */
export function offersHasAll(count: number): boolean {
  return count > OFFERS_SAMPLE;
}

/** Cuántas tarjetas de oferta se dibujan en el perfil. */
export function offersShown(count: number): number {
  return Math.min(Math.max(count, 0), OFFERS_SAMPLE);
}

// ---------- Reseñas ----------

/** Cuántas reseñas de muestra salen en el perfil; «Ver todas las reseñas (N)» sale desde 1. */
export const REVIEWS_PREVIEW_COUNT = 3;

export type ReviewsMode = 'empty' | 'count' | 'score';

/** 0 vacío; 1 o 2 solo el número (un 5,0 de una persona engaña); 3 o más, nota y distribución. */
export function reviewsMode(count: number): ReviewsMode {
  if (count <= 0) return 'empty';
  return count < 3 ? 'count' : 'score';
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

/** Cuántas fotos de muestra salen en el perfil (al dueño, una menos: la primera celda es «+ Nueva»). */
export const PHOTOS_SAMPLE = 6;

/** La portada: la que eligió el dueño; si no hay, la primera foto; si tampoco, el color de la categoría. */
export function coverSource(bannerUrl: string | null | undefined, firstPhoto: { url: string; content_type?: string } | undefined): { kind: 'banner' | 'photo' | 'video' | 'fallback'; url: string | null } {
  if (bannerUrl && bannerUrl.trim()) return { kind: 'banner', url: bannerUrl };
  if (firstPhoto) return { kind: firstPhoto.content_type?.startsWith('video/') ? 'video' : 'photo', url: firstPhoto.url };
  return { kind: 'fallback', url: null };
}

/**
 * La muestra de «Fotos»: hasta 6 (5 al dueño); si hay más, la última celda lleva «+N» con las que no se ven. Sin fotos
 * no hay sección (salvo al dueño, que ve «+ Nueva»).
 */
export function photoSample(count: number, isOwner: boolean): { show: boolean; shown: number; extra: number } {
  const n = Math.max(0, Math.floor(count));
  const max = isOwner ? PHOTOS_SAMPLE - 1 : PHOTOS_SAMPLE;
  const shown = Math.min(n, max);
  return { show: n > 0 || isOwner, shown, extra: Math.max(0, n - shown) };
}

/**
 * Mosaico de 3 × 3 (3.27): la más reciente grande (2 × 2) y 5 pequeñas. Solo para quien visita, sin subidas en curso y
 * con 6 o más fotos (con menos no llena el bloque y queda un hueco); si no, la cuadrícula pareja de 3 columnas.
 */
export function showMosaic(i: { count: number; isOwner: boolean; uploading: number }): boolean {
  return !i.isOwner && i.uploading === 0 && i.count >= PHOTOS_SAMPLE;
}

/** «Nuevo» en la foto grande si se publicó hace menos de 48 h. */
export const NEW_PHOTO_MS = 48 * 3600_000;
export function isNewPhoto(createdAt: string | null | undefined, now: number): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t <= now && now - t < NEW_PHOTO_MS;
}

// ---------- Secciones, índice rápido y orden ----------

export type SectionId = 'offers' | 'services' | 'photos' | 'reviews' | 'info';

export interface SectionInput {
  offers: number;
  hasServices: boolean;
  photos: number;
  isOwner: boolean;
  /** Cuántas reseñas tiene (sin ninguna, el apartado sigue, para escribir la primera, pero no su chip). */
  reviews?: number;
}

/**
 * Los chips del índice, en el orden del perfil (3.28): Ofertas · Catálogo · Fotos · Reseñas · Info. Un apartado sin
 * contenido no tiene chip. El dueño siempre tiene «Ofertas» y «Fotos» (ahí publica). «Info» siempre está.
 */
export function sections(i: SectionInput): SectionId[] {
  const out: SectionId[] = [];
  if (i.offers > 0 || i.isOwner) out.push('offers');
  if (i.hasServices) out.push('services');
  if (i.photos > 0 || i.isOwner) out.push('photos');
  if (i.reviews === undefined || i.reviews > 0 || i.isOwner) out.push('reviews');
  out.push('info');
  return out;
}

/** El índice rápido sale con 2 o más secciones. */
export function showQuickIndex(list: SectionId[]): boolean {
  return list.length >= 2;
}

export const SECTION_LABEL: Record<SectionId, string> = { offers: 'Ofertas', services: 'Servicios', photos: 'Fotos', reviews: 'Reseñas', info: 'Info' };

/** El nombre del chip: el catálogo se llama según el negocio («Carta», «Productos»…). */
export function sectionLabel(id: SectionId, catalogNoun?: string): string {
  return id === 'services' && catalogNoun ? catalogNoun : SECTION_LABEL[id];
}

export type BlockId = 'offers' | 'services' | 'photos' | 'reviews' | 'info' | 'recs';

/**
 * El orden para decidir (3.28, `perfil_integrado.html`): ofertas (como estaban), qué ofrece y a qué precio (catálogo),
 * cómo es (fotos), qué dicen (reseñas, que ya ponen primero las verificadas: la cita suelta sobraba) y cómo llegar
 * (información). Al final las recomendaciones, también cuando está cerrado. El dueño no ve recomendaciones.
 */
export function blockOrder(i: { isOwner: boolean }): BlockId[] {
  const out: BlockId[] = ['offers', 'services', 'photos', 'reviews', 'info'];
  if (!i.isOwner) out.push('recs');
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
