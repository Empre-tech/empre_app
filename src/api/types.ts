// Tipos que reflejan los DTOs del backend (empre_backend/internal/dtos y models).

export type Role = 'user' | 'admin';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

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

export interface Category {
  id: string;
  name: string;
}

/** Versión liviana para el mapa (GET /api/entities). */
export interface EntityMap {
  id: string;
  name: string;
  category_name: string;
  profile_url: string;
  latitude: number;
  longitude: number;
  is_verified: boolean;
}

export interface Photo {
  id: string;
  url: string;
  order: number;
}

/** Perfil completo (GET /api/entities/:id). */
export interface EntityDetail {
  id: string;
  name: string;
  description: string;
  category: Category;
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
  is_read: boolean;
  sent_by_entity: boolean;
  other_party: ConversationParty;
}

/** Campos editables de un negocio (POST /api/entities y PUT /api/entities/:id). */
export interface EntityInput {
  name: string;
  description: string;
  /** UUID de la categoría. */
  category: string;
  address: string;
  city: string;
  contact_info: string;
  /** 0,0 significa "sin ubicación": el negocio solo aparece en la lista, no en el mapa. */
  latitude: number;
  longitude: number;
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
}
