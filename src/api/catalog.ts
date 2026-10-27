import type { ItemKind, ServiceItem } from '@/lib/catalog';
import { request } from './client';

export interface ServiceInput {
  name: string;
  description?: string;
  /** Precio habitual en pesos; null = sin publicar (no es cero). */
  price: number | null;
  price_from: boolean;
  /** Sección opcional («Almuerzos», «Cortes»); vacía, sin sección. */
  section?: string;
  /** Duración en minutos (5–480); 0 la quita. Sin el campo, no se toca. */
  duration_min?: number;
  /** Se puede reservar por Empre (exige duración). Sin el campo, no se toca. */
  bookable?: boolean;
  /** Solo al crear: una variante (sabor, talla) de este producto, con su parte corta. */
  parent_id?: string;
  variant_label?: string;
  /** Solo al crear: servicio o producto (vacío = lo más probable para el negocio). */
  kind?: ItemKind;
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
  /** Cambia un ítem entre servicio y producto (mueve su inventario: se archiva o vuelve). */
  setKind: (entityId: string, itemId: string, kind: ItemKind) =>
    request<ServiceItem>(`/api/entities/${entityId}/catalog/${itemId}/kind`, { method: 'PUT', body: { kind } }),
  /** Da por revisado qué es cada ítem. */
  confirmKinds: (entityId: string) => request<{ ok: boolean }>(`/api/entities/${entityId}/catalog/kinds/confirm`, { method: 'POST' }),
  /** Da por vigente todo el catálogo hoy. */
  confirm: (entityId: string) => request<{ confirmed: number }>(`/api/entities/${entityId}/catalog/confirm`, { method: 'POST' }),
};
