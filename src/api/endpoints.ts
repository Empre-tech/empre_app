import { request } from './client';
import type {
  Category,
  ChatMessage,
  Conversation,
  EntityDetail,
  EntityImageType,
  EntityInput,
  EntityMap,
  EntityOwnerItem,
  RegisterInput,
  TokenPair,
  UploadableImage,
  UploadedImage,
  User,
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

/** Multipart con el archivo en el campo `file` (lo que esperan los endpoints de imágenes). */
function imageForm(image: UploadableImage, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  // React Native acepta { uri, name, type } como parte de un FormData.
  form.append('file', { uri: image.uri, name: image.name, type: image.type } as unknown as Blob);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
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
    request<UploadedImage>('/api/users/profile/image', { method: 'POST', formData: imageForm(image) }),
};

export const categoriesApi = {
  list: async () =>
    unwrapList<Category>(await request<unknown>('/api/categories', { auth: false, query: { pageSize: 100 } })),
};

export interface EntityListParams {
  category?: string;
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
          lat: params.lat,
          long: params.long,
          radius: params.radius,
          pageSize: params.pageSize ?? 200,
        },
      }),
    ),

  get: (id: string) => request<EntityDetail>(`/api/entities/${id}`, { auth: false }),

  mine: async () =>
    unwrapList<EntityOwnerItem>(await request<unknown>('/api/entities/mine', { query: { pageSize: 50 } })),

  create: (input: EntityInput) => request<EntityDetail>('/api/entities', { method: 'POST', body: input }),

  /** PUT reemplaza todos los campos de texto y la ubicación: enviamos siempre el formulario completo. */
  update: (id: string, input: EntityInput) =>
    request<unknown>(`/api/entities/${id}`, { method: 'PUT', body: input }),

  remove: (id: string) => request<{ message: string }>(`/api/entities/${id}`, { method: 'DELETE' }),

  /** Solo el dueño. `gallery` añade una foto; `profile` y `banner` reemplazan la anterior. */
  uploadImage: (id: string, type: EntityImageType, image: UploadableImage) =>
    request<UploadedImage>(`/api/entities/${id}/images`, {
      method: 'POST',
      formData: imageForm(image, { type }),
    }),
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
