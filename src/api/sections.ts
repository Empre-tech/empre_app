import { useQuery } from '@tanstack/react-query';
import { request } from './client';

/** Una sección es de lo que se vende (productos y servicios) o de insumos. */
export type SectionKind = 'sell' | 'supply';

/** Sección del catálogo global de Empre. El negocio elige de aquí: no crea secciones. */
export interface Section {
  id: string;
  name: string;
  kind: SectionKind;
  /** Ícono de Ionicons de la sección («shirt-outline»). */
  icon?: string;
  /** Cuántos ítems activos tiene (en las secciones del negocio o del perfil). */
  count?: number;
  /** Viene de la plantilla de su subcategoría (false = la agregó el negocio, o es «Otros»). */
  template?: boolean;
}

/** Lo que guarda una pantalla al elegir: el id manda; el nombre es para mostrar. */
export interface SectionPick {
  id: string;
  name: string;
}

export interface SectionRequest {
  id: string;
  entity_id: string;
  entity_name?: string;
  kind: SectionKind;
  name: string;
  status: 'open' | 'added' | 'dismissed';
  section_id?: string;
  created_at: string;
}

/** Nombre de la sección que todo negocio tiene, al final, para lo que no encaja en otra. */
export const OTHER_SECTION = 'Otros';

export const sectionsApi = {
  /**
   * Las secciones del negocio, en orden, con cuántos ítems tiene cada una (solo el dueño), y si el negocio dice para
   * quién es cada producto (ropa, calzado, deporte).
   */
  forEntity: async (entityId: string, kind: SectionKind): Promise<{ sections: Section[]; audience: boolean }> => {
    const res = await request<{ sections: Section[] | null; audience?: boolean }>(`/api/entities/${entityId}/sections`, { query: { kind } });
    return { sections: res.sections ?? [], audience: Boolean(res.audience) };
  },
  /** El catálogo global de un tipo, para «Más secciones». */
  catalog: async (kind: SectionKind): Promise<Section[]> => (await request<{ sections: Section[] | null }>('/api/sections', { query: { kind } })).sections ?? [],
  /** Agrega una sección del catálogo a las del negocio. */
  add: async (entityId: string, sectionId: string): Promise<Section> =>
    (await request<{ section: Section }>(`/api/entities/${entityId}/sections`, { method: 'POST', body: { section_id: sectionId } })).section,
  /** Pide una sección que no existe. Si ya existía con ese nombre, vuelve `section` (ya quedó agregada). */
  request: (entityId: string, kind: SectionKind, name: string) =>
    request<{ section?: Section; request?: SectionRequest }>(`/api/entities/${entityId}/sections/requests`, { method: 'POST', body: { kind, name } }),

  // ---- panel de admin ----
  adminRequests: async (status: SectionRequest['status'] = 'open'): Promise<SectionRequest[]> =>
    (await request<{ requests: SectionRequest[] | null }>('/api/admin/section-requests', { query: { status } })).requests ?? [],
  adminResolve: (id: string, action: 'add' | 'dismiss', name?: string) =>
    request<{ request: SectionRequest }>(`/api/admin/section-requests/${id}`, { method: 'POST', body: { action, name } }),
};

/** Las secciones del negocio de un tipo (se refrescan al invalidar ['sections', entityId]). */
export function useEntitySections(entityId: string, kind: SectionKind) {
  return useQuery({
    queryKey: ['sections', entityId, kind],
    queryFn: () => sectionsApi.forEntity(entityId, kind),
    enabled: Boolean(entityId),
    select: (d) => d.sections,
  });
}

/** ¿El negocio dice para quién es cada producto? (ropa, calzado, deporte). */
export function useAudienceEnabled(entityId: string): boolean {
  const q = useQuery({
    queryKey: ['sections', entityId, 'sell'],
    queryFn: () => sectionsApi.forEntity(entityId, 'sell'),
    enabled: Boolean(entityId),
    select: (d) => d.audience,
  });
  return q.data ?? false;
}
