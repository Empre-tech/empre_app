import type { ServiceItem } from '@/lib/catalog';
import { request } from './client';

export interface ServiceInput {
  name: string;
  description?: string;
  /** Precio habitual en pesos; null = sin publicar (no es cero). */
  price: number | null;
  price_from: boolean;
  /** Sección opcional («Almuerzos», «Cortes»); vacía, sin sección. */
  section?: string;
}

/** Catálogo del negocio: lectura pública y gestión del dueño. */
export const catalogApi = {
  list: async (entityId: string): Promise<ServiceItem[]> => {
    const res = await request<{ items?: ServiceItem[] | null }>(`/api/entities/${entityId}/catalog`, { auth: false });
    return res.items ?? [];
  },
  create: (entityId: string, input: ServiceInput) =>
    request<ServiceItem>(`/api/entities/${entityId}/catalog`, { method: 'POST', body: input }),
  update: (entityId: string, itemId: string, input: ServiceInput) =>
    request<ServiceItem>(`/api/entities/${entityId}/catalog/${itemId}`, { method: 'PUT', body: input }),
  /** Retira el servicio: deja de mostrarse. */
  retire: (entityId: string, itemId: string) => request<void>(`/api/entities/${entityId}/catalog/${itemId}`, { method: 'DELETE' }),
  /** Da por vigente todo el catálogo hoy. */
  confirm: (entityId: string) => request<{ confirmed: number }>(`/api/entities/${entityId}/catalog/confirm`, { method: 'POST' }),
};
