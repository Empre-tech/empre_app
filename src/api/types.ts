// Tipos que reflejan los DTOs del backend (empre_backend/internal/dtos y models).

export type Role = 'user' | 'admin';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';
export type ServiceMode = 'in_place' | 'delivery' | 'both' | '';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  profile_picture_url: string;
  role: Role;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface Subcategory {
  id: string;
  name: string;
  category_id: string;
}

/** Horario de un día de la semana (0=domingo ... 6=sábado, igual a Date.getDay()). */
export interface BusinessHour {
  weekday: number;
  closed: boolean;
  is_24h: boolean;
  /** "HH:MM", vacío si closed o is_24h. */
  open_time: string;
  close_time: string;
}

export interface Category {
  id: string;
  name: string;
  /** Nombre de ícono de Ionicons (ej. "restaurant-outline"), usado en el mapa. */
  icon: string;
  /** Color de marca (hex) para teñir el portal/glifo en el mapa. */
  color?: string;
  subcategories?: Subcategory[];
}

/** Versión liviana para el mapa (GET /api/entities). */
export interface EntityMap {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  category_icon: string;
  /** Color de marca (hex) de la categoría para el portal. */
  category_color?: string;
  profile_url: string;
  latitude: number;
  longitude: number;
  is_verified: boolean;
  avg_rating: number;
  review_count: number;
  service_mode: ServiceMode;
  is_open_now: boolean;
  has_hours: boolean;
}

/** Cuerpo de POST/PUT /api/admin/categories. */
export interface CategoryInput {
  name: string;
  icon: string;
}

/** Cuerpo de POST /api/admin/subcategories. */
export interface SubcategoryInput {
  name: string;
  category_id: string;
}

export interface Photo {
  id: string;
  url: string;
  order: number;
  caption: string;
  /** MIME real detectado por el backend (ej. "image/jpeg", "video/mp4"). */
  content_type: string;
  /** Cuándo se publicó (la fecha de creación del Post al que pertenece). */
  created_at: string;
}

/** Un archivo (foto o video) dentro de una publicación. */
export interface PostItem {
  id: string;
  url: string;
  /** MIME real (ej. "image/jpeg", "video/mp4"). */
  content_type: string;
}

/** Una publicación del negocio (GET /api/entities/:id/posts): su descripción compartida y sus archivos en orden. */
export interface PostEntry {
  id: string;
  caption: string;
  created_at: string;
  items: PostItem[];
}

/** Perfil completo (GET /api/entities/:id). */
export interface EntityDetail {
  id: string;
  name: string;
  description: string;
  /** Frase corta que la tarjeta de Descubre muestra bajo el nombre. */
  tagline?: string;
  /** Quién atiende («Ana»), para la tarjeta y la historia de Ofertas (3.48). Hasta 40 caracteres. */
  attendant_name?: string;
  category: Category;
  subcategories?: Subcategory[];
  address: string;
  city: string;
  contact_info: string;
  banner_url: string;
  profile_url: string;
  latitude: number;
  longitude: number;
  verification_status: VerificationStatus;
  is_verified: boolean;
  owner_id: string;
  created_at: string;
  photos?: Photo[];
  /** Promedio y cantidad de reseñas (solo en el detalle del negocio). */
  avg_rating: number;
  review_count: number;
  /** true si el usuario logueado tiene este negocio en favoritos. */
  is_favorite: boolean;
  service_mode: ServiceMode;
  hours?: BusinessHour[];
  is_open_now: boolean;
}

/** Lista del dueño (GET /api/entities/mine). */
export interface EntityOwnerItem {
  id: string;
  name: string;
  category_name: string;
  profile_url: string;
  verification_status: VerificationStatus;
  is_verified: boolean;
  created_at: string;
  subcategories?: Subcategory[];
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; page_size: number };
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  entity_id: string;
  user_id: string;
  sent_by_entity: boolean;
  content: string;
  is_read: boolean;
  created_at: string;
  /** "appointment" = tarjeta de una cita dentro del hilo (ver appointment_id). */
  kind?: 'text' | 'appointment';
  appointment_id?: string;
}

export interface ConversationParty {
  id: string;
  name: string;
  profile_url: string;
  /** "user": soy el dueño hablando con un cliente. "entity": soy el cliente hablando con un negocio. */
  type: 'user' | 'entity';
}

export interface Conversation {
  id: string;
  /** Negocio al que pertenece la conversación (siempre presente). */
  entity_id: string;
  content: string;
  created_at: string;
  /** Si el ÚLTIMO mensaje está leído (no confundir con `unread_count`, que es el total pendiente). */
  is_read: boolean;
  sent_by_entity: boolean;
  other_party: ConversationParty;
  /** Cuántos mensajes del otro lado están sin leer en esta conversación. */
  unread_count: number;
}

/** Campos editables de un negocio (POST /api/entities y PUT /api/entities/:id). */
export interface EntityInput {
  name: string;
  description: string;
  /** Frase corta (hasta 80 caracteres). */
  tagline?: string;
  /** Quién atiende («Ana»), para la tarjeta y la historia de Ofertas (3.48). Hasta 40 caracteres. */
  attendant_name?: string;
  /** UUID de la categoría. */
  category: string;
  /** UUIDs de subcategorías (dependientes de `category`). */
  subcategory_ids: string[];
  address: string;
  city: string;
  contact_info: string;
  /** 0,0 significa "sin ubicación": el negocio solo aparece en la lista, no en el mapa. */
  latitude: number;
  longitude: number;
  service_mode?: ServiceMode;
  hours?: BusinessHour[];
}

export type EntityImageType = 'profile' | 'banner' | 'gallery';

/** Imagen local lista para subir (ya convertida a JPEG). */
export interface UploadableImage {
  uri: string;
  name: string;
  type: string;
}

export interface UploadedImage {
  id: string;
  url: string;
  type?: EntityImageType;
  content_type?: string;
}

export interface ReviewUser {
  id: string;
  name: string;
  profile_picture_url: string;
}

/** Reseña de un negocio (GET /api/entities/:id/reviews). */
export interface Review {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
  user: ReviewUser;
  /** True si la respalda un canje confirmado en este negocio. */
  verified?: boolean;
}

export interface ReviewSummary {
  average: number;
  count: number;
  /** Cantidad de reseñas por estrellas; índice 0 = 1 estrella. */
  distribution?: number[];
  verified_count?: number;
}

/** Cuerpo de POST /api/entities/:id/reviews (crea o reemplaza mi reseña). */
export interface ReviewInput {
  rating: number;
  comment: string;
  /** Canje confirmado que respalda la reseña (la marca como verificada). */
  claim_id?: string;
}

// ---------------------------------------------------------------------------
// Asistente de IA para crear negocios (POST /api/ai/business-assistant)
// ---------------------------------------------------------------------------

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Lo que el asistente ya logró definir a partir de la conversación; cada
 * campo puede venir vacío/ausente si todavía no se ha hablado de eso. */
export interface AIBusinessDraft {
  /** Nombre ya decidido por el dueño. */
  name?: string;
  name_suggestions?: string[];
  description?: string;
  category_id?: string;
  subcategory_ids?: string[];
  service_mode?: ServiceMode;
  hours?: BusinessHour[];
  ready?: boolean;
}

export interface AIChatResponse {
  /** Mensaje del asistente para mostrar en el chat. */
  reply: string;
  draft?: AIBusinessDraft;
  /** true cuando ya hay suficiente información para pasar al formulario. */
  ready: boolean;
}

// ---------------------------------------------------------------------------
// Asistente de IA para redactar texto (POST /api/ai/writing-assistant)
// ---------------------------------------------------------------------------

export type AITextKind = 'business_description' | 'post_caption';

export interface AITextRequest {
  kind: AITextKind;
  current_text?: string;
  business_name?: string;
  category_name?: string;
}

export interface AITextResponse {
  /** 2 o 3 opciones listas para usar; el dueño elige una. */
  suggestions: string[];
}

export type SubscriptionStatus = 'active' | 'inactive';

export interface SubscriptionRecord {
  id: string;
  entity_id: string;
  plan: string;
  status: SubscriptionStatus;
  current_period_end?: string;
}

/** Gratis hasta que el negocio reciba mensajes de `trial_threshold` clientes
 * distintos; `requires_payment` se vuelve true en ese punto si todavía no
 * tiene un plan activo. */
export interface Subscription {
  subscription: SubscriptionRecord;
  distinct_customers: number;
  trial_threshold: number;
  requires_payment: boolean;
}

export interface SubscriptionCheckout {
  public_key: string;
  reference: string;
  amount_in_cents: number;
  currency: string;
  signature: string;
  redirect_url: string;
}

// ---------------------------------------------------------------------------
// Ofertas y canje (empre_backend/internal/dtos/offer_dto.go y claim_dto.go)
// ---------------------------------------------------------------------------

export type OfferType = 'HORAS' | 'DIA' | 'SEMANA';
export type ClaimStatus = 'RECLAMADO' | 'CANJEADO' | 'EXPIRADO' | 'CANCELADO';
export type RepeatPolicy = 'once' | 'daily';

export interface Offer {
  id: string;
  entity_id: string;
  type: OfferType;
  title: string;
  /** La nota de quien atiende, con su voz (3.48; hasta 90 caracteres). */
  owner_note?: string;
  price: string;
  /** Valor habitual (opcional) para mostrar el ahorro. */
  normal_price?: string;
  conditions?: string;
  starts_at: string;
  ends_at: string;
  total_slots: number;
  used_slots: number;
  slots_left: number;
  radius_meters: number;
  repeat_policy: RepeatPolicy;
  /** Cuánto dura un reclamo de esta oferta antes de expirar. */
  claim_window_minutes?: number;
  /** Precio temporal propio de la oferta y la referencia congelada al publicar (precio habitual de lo incluido). */
  special_price?: number;
  reference_price?: number;
  /** Solo existe con referencia y precio especial menor. */
  saving?: number;
  /** Servicios del catálogo incluidos, tal como estaban al publicar. */
  items?: { name: string; price?: number; service_item_id?: string }[];
}

/** Una oferta del negocio con sus resultados (GET /api/entities/:id/offers/stats, solo el dueño). */
export interface OfferStat {
  offer_id: string;
  title: string;
  type: OfferType;
  starts_at: string;
  ends_at: string;
  total_slots: number;
  special_price?: number;
  ended: boolean;
  /** Instalaciones distintas que la vieron (anónimo). */
  views: number;
  claims: number;
  redeemed: number;
  /** Minutos hasta que se reclamó el último cupo; sin valor si no se agotó. */
  filled_minutes?: number;
  /** Hora y día del inicio (hora de Colombia) y cuánto duró. */
  hour: number;
  weekday: number;
  duration_minutes: number;
}

/** Resumen de las ofertas terminadas y lo que se puede sugerir (solo con datos suficientes). */
export interface OfferStatsSummary {
  finished: number;
  views: number;
  claims: number;
  redeemed: number;
  enough: boolean;
  min_offers: number;
  min_views: number;
  insights: { kind: 'band' | 'duration' | 'fill' | string; text: string }[];
  best_offer_id?: string;
  /** «mañana», «tarde» o «noche». */
  prefer_band?: string;
  prefer_short: boolean;
  avg_fill_minutes?: number;
}

export interface OfferClaim {
  id: string;
  offer_id: string;
  status: ClaimStatus;
  token: string;
  short_code: string;
  claimed_at: string;
  expires_at: string;
  offer?: Offer;
  /** Nombre del negocio, para mostrar el QR sin otra consulta. */
  entity_name?: string;
  redeemed_at?: string;
  /** El cliente confirmó que lo atendieron (canje verificado). */
  verified_by_client?: boolean;
}

/** Causa de un rechazo al canjear. Un servidor anterior puede no enviarla. */
export type RedeemReasonCode = 'ALREADY_REDEEMED' | 'EXPIRED' | 'CANCELED' | 'WRONG_BUSINESS' | 'NOT_FOUND';

/**
 * Resultado del escáner. Un rechazo es un resultado normal (HTTP 200 con
 * `valid: false`), no un error. Los campos de contexto solo vienen para
 * reclamos del propio negocio: con WRONG_BUSINESS y NOT_FOUND llegan vacíos.
 */
export interface RedeemResult {
  valid: boolean;
  reason?: string;
  reason_code?: RedeemReasonCode;
  claim_id?: string;
  entity_name?: string;
  offer_title?: string;
  offer_price?: string;
  offer_conditions?: string;
  /** Nombre y la inicial del apellido, p. ej. "María P.". */
  client_name?: string;
  claimed_at?: string;
  expires_at?: string;
  redeemed_at?: string;
  slots_left?: number;
  slots_total?: number;
}

export interface OfferInput {
  type: OfferType;
  title: string;
  price?: string;
  normal_price?: string;
  conditions?: string;
  /** La nota de quien atiende (3.48): opcional, hasta 90 caracteres. */
  owner_note?: string;
  ends_at: string;
  total_slots: number;
  radius_meters?: number;
  repeat_policy?: RepeatPolicy;
  /** Servicios del catálogo que incluye la oferta (hasta 5) y su precio especial propio. */
  service_item_ids?: string[];
  special_price?: number;
}

export type PromotionStatus = 'draft' | 'active' | 'paused' | 'finished';

/** Oferta sostenida (sin cupos ni QR), editable y con vigencia. */
export interface Promotion {
  id: string;
  entity_id: string;
  title: string;
  description?: string;
  price?: string;
  discount?: string;
  normal_price?: string;
  starts_at: string;
  ends_at: string;
  conditions?: string;
  tags: string[];
  status: PromotionStatus;
  /** Editor por plantillas: mensaje para clientes, plantilla y servicios destacados (copia congelada). */
  public_message?: string;
  template?: string;
  items?: { name: string; price?: number; service_item_id?: string }[];
  /** Solo lo recibe el dueño: el porqué de la campaña. */
  motive_internal?: string;
  /** Portada: ruta pública del medio (/api/images/{id}); no caduca. */
  photo_url?: string;
}

export interface PromotionInput {
  title: string;
  description?: string;
  price?: string;
  discount?: string;
  normal_price?: string;
  /** Obligatoria al publicar; un borrador puede no traerla. */
  ends_at?: string;
  conditions?: string;
  /** Etiquetas separadas por coma. */
  tags?: string;
  /** Editor por plantillas. El motivo es privado: el servidor nunca lo publica. */
  motive_internal?: string;
  public_message?: string;
  template?: string;
  service_item_ids?: string[];
  /** Id del medio de la portada (lo devuelve la subida suelta). */
  photo_media_id?: string;
  draft?: boolean;
}

/** Relámpago en el listado de la pestaña Ofertas (con negocio/categoría/distancia). */
export interface RelampagoListItem extends Offer {
  distance_meters: number;
  entity_name: string;
  category_name: string;
}

/** Promoción en el listado de la pestaña Ofertas. */
export interface PromotionListItem extends Promotion {
  distance_meters: number;
  entity_name: string;
  category_name: string;
}

export interface OffersFeed {
  relampagos: RelampagoListItem[];
  promotions: PromotionListItem[];
}

export type QuickAction = 'extend' | 'radius' | 'slots';

/** Resultado de descubrimiento (GET /api/discovery): EntityMap + distancia + oferta. */
export interface DiscoveryItem extends EntityMap {
  /** Fotos recientes (hasta 4, sin videos) y cuántas tiene en total. */
  photos?: string[];
  photos_count?: number;
  /** Subcategorías y frase corta del negocio (para recomendaciones y tarjetas). */
  subcategory_ids?: string[];
  subcategory?: string;
  tagline?: string;
  distance_meters: number;
  has_active_offer: boolean;
  active_offer?: Offer;
  /** Abierto: a qué hora cierra («HH:MM» o «24h»). Cerrado: cuándo vuelve a abrir. Sin horario, ninguno. */
  closes_at?: string;
  next_open?: { days_ahead: number; weekday: number; time: string } | null;
}

export interface BusinessStatus {
  availability: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Descubre (GET /api/discovery/sections): lo que el panel muestra sin búsqueda
// ---------------------------------------------------------------------------

export type DiscoverSectionId = 'offers' | 'open' | 'new';

export interface DiscoverReason {
  kind: DiscoverSectionId;
  ends_at?: string;
  posted_at?: string;
  offer_title?: string;
}

export interface DiscoverItem {
  entity_id: string;
  name: string;
  category_name: string;
  category_icon: string;
  category_color?: string;
  subcategory?: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  is_open_now: boolean;
  /** "HH:MM", "24h" o ausente. */
  closes_at?: string;
  cover_url?: string;
  profile_url?: string;
  tagline?: string;
  reason: DiscoverReason;
  /** Fotos recientes (hasta 4, sin videos) y cuántas tiene en total. */
  photos?: string[];
  photos_count?: number;
}

export interface DiscoverSection {
  id: DiscoverSectionId;
  title: string;
  items: DiscoverItem[];
}
