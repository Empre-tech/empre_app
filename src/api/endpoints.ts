import { request, uploadFile } from './client';
import type {
  Category,
  CategoryInput,
  ChatMessage,
  Conversation,
  EntityDetail,
  EntityImageType,
  EntityInput,
  EntityMap,
  EntityOwnerItem,
  Paginated,
  RegisterInput,
  Review,
  ReviewInput,
  ReviewSummary,
  SubcategoryInput,
  TokenPair,
  UploadableImage,
  UploadedImage,
  User,
  VerificationStatus,
} from './types';

/**
 * Go serializa un slice nil como `null` ("data": null cuando no hay resultados),
 * así que aceptamos array directo, { data: [...] } o null.
 */
function unwrapList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object') {
    const data = (res as { data?: unknown }).data;
    if (Array.isArray(data)) return data as T[];
  }
  return [];
}

export const authApi = {
  login: (email: string, password: string) =>
    request<TokenPair>('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),

  register: (input: RegisterInput) =>
    request<{ message: string }>('/api/auth/register', { method: 'POST', body: input, auth: false }),

  requestPasswordReset: (email: string) =>
    request<{ message: string }>('/api/auth/password-reset/request', {
      method: 'POST',
      body: { email },
      auth: false,
    }),
};

export const usersApi = {
  me: () => request<User>('/api/users/me'),

  uploadProfileImage: (image: UploadableImage) =>
    uploadFile<UploadedImage>('/api/users/profile/image', image.uri, { fieldName: 'file', mimeType: image.type }),

  /** Negocios que el usuario marcó como favoritos. */
  favorites: async () =>
    unwrapList<EntityMap>(await request<unknown>('/api/users/me/favorites', { query: { pageSize: 100 } })),
};

export const categoriesApi = {
  list: async () =>
    unwrapList<Category>(await request<unknown>('/api/categories', { auth: false, query: { pageSize: 100 } })),
};

export interface EntityListParams {
  category?: string;
  subcategory?: string;
  /** Búsqueda libre: nombre, descripción, dirección, categoría o subcategoría. */
  q?: string;
  lat?: number;
  long?: number;
  /** metros */
  radius?: number;
  pageSize?: number;
}

export const entitiesApi = {
  list: async (params: EntityListParams = {}) =>
    unwrapList<EntityMap>(
      await request<unknown>('/api/entities', {
        auth: false,
        query: {
          category: params.category,
          subcategory: params.subcategory,
          q: params.q,
          lat: params.lat,
          long: params.long,
          radius: params.radius,
          pageSize: params.pageSize ?? 200,
        },
      }),
    ),

  // Sin `auth: false`: si hay sesión, mandamos el token para que el backend
  // pueda devolver `is_favorite` correcto (visitantes sin sesión igual pueden
  // ver el negocio; simplemente no se manda cabecera si no hay token).
  get: (id: string) => request<EntityDetail>(`/api/entities/${id}`),

  mine: async () =>
    unwrapList<EntityOwnerItem>(await request<unknown>('/api/entities/mine', { query: { pageSize: 50 } })),

  create: (input: EntityInput) => request<EntityDetail>('/api/entities', { method: 'POST', body: input }),

  /** PUT reemplaza todos los campos de texto y la ubicación: enviamos siempre el formulario completo. */
  update: (id: string, input: EntityInput) =>
    request<unknown>(`/api/entities/${id}`, { method: 'PUT', body: input }),

  remove: (id: string) => request<{ message: string }>(`/api/entities/${id}`, { method: 'DELETE' }),

  /** Solo el dueño. `gallery` añade una foto; `profile` y `banner` reemplazan la anterior. */
  uploadImage: (id: string, type: EntityImageType, image: UploadableImage) =>
    uploadFile<UploadedImage>(`/api/entities/${id}/images`, image.uri, {
      fieldName: 'file',
      mimeType: image.type,
      parameters: { type },
    }),

  /** Quita una foto ya subida de la galería (perfil y banner se reemplazan subiendo una nueva). */
  deleteImage: (id: string, photoId: string) =>
    request<{ message: string }>(`/api/entities/${id}/images/${photoId}`, { method: 'DELETE' }),

  /** Cambia la descripción de una foto de galería (Owner only). */
  updateImageCaption: (id: string, photoId: string, caption: string) =>
    request<{ message: string; caption: string }>(`/api/entities/${id}/images/${photoId}`, {
      method: 'PATCH',
      body: { caption },
    }),

  favorite: (id: string) => request<{ message: string }>(`/api/entities/${id}/favorite`, { method: 'POST' }),

  unfavorite: (id: string) => request<{ message: string }>(`/api/entities/${id}/favorite`, { method: 'DELETE' }),
};

export interface ReviewListResult {
  data: Review[];
  summary: ReviewSummary;
}

export const reviewsApi = {
  /** Lista pública de reseñas de un negocio, más nuevas primero, con el promedio. */
  list: async (entityId: string): Promise<ReviewListResult> => {
    const res = await request<{ data: Review[] | null; summary: ReviewSummary }>(
      `/api/entities/${entityId}/reviews`,
      { auth: false, query: { pageSize: 50 } },
    );
    return { data: res.data ?? [], summary: res.summary };
  },

  /** Crea o reemplaza mi reseña de este negocio (una por usuario). */
  upsert: (entityId: string, input: ReviewInput) =>
    request<Review>(`/api/entities/${entityId}/reviews`, { method: 'POST', body: input }),

  /** Mi reseña de este negocio, si ya dejé una. */
  mine: (entityId: string) => request<Review>(`/api/entities/${entityId}/reviews/mine`),

  remove: (entityId: string) =>
    request<{ message: string }>(`/api/entities/${entityId}/reviews`, { method: 'DELETE' }),
};

export interface AdminEntityListParams {
  /** Estado a listar. Por defecto "pending" (la cola de revisión). */
  status?: VerificationStatus;
  page?: number;
  pageSize?: number;
}

export const adminApi = {
  /** Solo para usuarios con role "admin". Lista negocios por estado de verificación. */
  listEntities: (params: AdminEntityListParams = {}) =>
    request<Paginated<EntityOwnerItem>>('/api/admin/entities', {
      query: { status: params.status, page: params.page, pageSize: params.pageSize ?? 50 },
    }),

  verifyEntity: (id: string, verificationStatus: VerificationStatus) =>
    request<EntityDetail>(`/api/admin/entities/${id}/verify`, {
      method: 'PATCH',
      body: { status: verificationStatus },
    }),

  /** Solo admin. Crear/editar/eliminar categorías y subcategorías. */
  createCategory: (input: CategoryInput) =>
    request<{ message: string; id: string }>('/api/admin/categories', { method: 'POST', body: input }),

  updateCategory: (id: string, input: CategoryInput) =>
    request<{ message: string }>(`/api/admin/categories/${id}`, { method: 'PUT', body: input }),

  deleteCategory: (id: string) =>
    request<{ message: string }>(`/api/admin/categories/${id}`, { method: 'DELETE' }),

  createSubcategory: (input: SubcategoryInput) =>
    request<{ message: string; id: string }>('/api/admin/subcategories', { method: 'POST', body: input }),

  updateSubcategory: (id: string, name: string) =>
    request<{ message: string }>(`/api/admin/subcategories/${id}`, { method: 'PUT', body: { name } }),

  deleteSubcategory: (id: string) =>
    request<{ message: string }>(`/api/admin/subcategories/${id}`, { method: 'DELETE' }),
};

export const chatApi = {
  conversations: async () =>
    unwrapList<Conversation>(await request<unknown>('/api/chat/conversations', { query: { pageSize: 50 } })),

  /**
   * Historial (más nuevo primero). `userId` solo lo usa el dueño del negocio
   * para pedir la conversación con un cliente concreto.
   */
  history: async (entityId: string, userId?: string) =>
    unwrapList<ChatMessage>(
      await request<unknown>(`/api/chat/history/${entityId}`, { query: { user_id: userId, pageSize: 50 } }),
    ),
};
