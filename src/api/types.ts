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
  subcategories?: Subcategory[];
}

/** Versión liviana para el mapa (GET /api/entities). */
export interface EntityMap {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  category_icon: string;
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

/** Perfil completo (GET /api/entities/:id). */
export interface EntityDetail {
  id: string;
  name: string;
  description: string;
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
}

export interface ReviewSummary {
  average: number;
  count: number;
}

/** Cuerpo de POST /api/entities/:id/reviews (crea o reemplaza mi reseña). */
export interface ReviewInput {
  rating: number;
  comment: string;
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
