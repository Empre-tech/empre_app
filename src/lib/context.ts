// Fila de contexto de Explorar (F12): qué chips hay y qué quita cada ✕. Sin React para poder
// probarla con Node. La tabla de decisión sale del mockup `docs/mockups/busqueda_cercania_v3.html`.

export type ScopeKind = 'near' | 'zone' | 'all';

export type FilterId = 'category' | 'subcategory' | 'radius' | 'open';

export type ContextChip =
  | { kind: 'zone' }
  | { kind: 'scope'; scope: ScopeKind; label: string; /** El alcance por defecto no se quita: no hay nada que quitar. */ removable: boolean }
  | { kind: 'filter'; id: FilterId; label: string }
  | { kind: 'clear' }
  | { kind: 'area' };

export interface ContextInput {
  /** Hay una búsqueda activa. */
  searching: boolean;
  scope: ScopeKind;
  /** Se sabe dónde está la persona (hay permiso de ubicación). */
  hasLocation: boolean;
  /** Filtros activos, ya con su texto. */
  filters: { id: FilterId; label: string }[];
  /** El mapa se movió desde la última búsqueda: ofrece «Buscar en esta zona». */
  areaDirty: boolean;
}

export function scopeLabel(scope: ScopeKind, hasLocation: boolean): string {
  if (scope === 'zone') return 'En esta zona';
  if (scope === 'all') return 'Todas las zonas';
  return hasLocation ? 'Cerca de ti · 5 km' : 'Cerca del mapa · 5 km';
}

/**
 * Con búsqueda: zona, alcance (con ✕ si no es el de por defecto), filtros (con ✕), «Quitar todo» si hay
 * 2 o más cosas que quitar y, al final, «Buscar en esta zona» si el mapa se movió. Sin búsqueda la fila
 * solo lleva la zona (las categorías y filtros los dibuja la pantalla como siempre).
 */
export function contextChips(input: ContextInput): ContextChip[] {
  const out: ContextChip[] = [{ kind: 'zone' }];
  if (!input.searching) return out;
  const removableScope = input.scope !== 'near';
  out.push({ kind: 'scope', scope: input.scope, label: scopeLabel(input.scope, input.hasLocation), removable: removableScope });
  for (const f of input.filters) out.push({ kind: 'filter', id: f.id, label: f.label });
  if (input.filters.length + (removableScope ? 1 : 0) >= 2) out.push({ kind: 'clear' });
  if (input.areaDirty) out.push({ kind: 'area' });
  return out;
}

/** Texto para el lector de pantalla al quitar algo. */
export function removedAnnouncement(what: 'scope' | 'filter' | 'all' | 'search'): string {
  if (what === 'scope') return 'Alcance quitado: de nuevo cerca de ti';
  if (what === 'filter') return 'Filtro quitado';
  if (what === 'all') return 'Alcance y filtros quitados';
  return 'Búsqueda quitada: Descubre';
}
