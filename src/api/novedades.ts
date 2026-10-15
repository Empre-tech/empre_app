import type { NovedadItem } from '@/lib/novedades';
import { request } from './client';

export const novedadesApi = {
  /** Lo que publicaron los negocios que sigo desde que los sigo (últimos 30 días). */
  list: async (): Promise<NovedadItem[]> => {
    const res = await request<{ data?: NovedadItem[] | null }>('/api/users/me/novedades');
    return res.data ?? [];
  },

  /** Marca como vistas las novedades de un negocio, o de todos si no se indica. */
  markSeen: (entityId?: string) =>
    request<{ message: string }>('/api/users/me/novedades/seen', { method: 'POST', body: entityId ? { entity_id: entityId } : {} }),

  /** Cuánta gente sigue al negocio (solo el dueño; nunca quiénes). */
  followers: async (entityId: string): Promise<number> => {
    const res = await request<{ followers?: number }>(`/api/entities/${entityId}/followers`);
    return res.followers ?? 0;
  },
};
