import type { Goal } from '@/lib/activity';
import { request } from './client';

/** La meta del mes de un negocio (tablero «Actividad y meta»): solo el dueño la ve y la cambia. */
export const goalsApi = {
  get: async (entityId: string, month: string): Promise<Goal | null> => (await request<{ goal: Goal | null }>(`/api/entities/${entityId}/goal`, { query: { month } })).goal ?? null,
  set: async (entityId: string, goal: Goal): Promise<Goal> => (await request<{ goal: Goal }>(`/api/entities/${entityId}/goal`, { method: 'PUT', body: goal })).goal,
};
