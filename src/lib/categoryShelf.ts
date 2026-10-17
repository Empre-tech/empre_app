/** Máximo de categorías que se asoman en el estante; el resto está en «Ver todas». */
export const SHELF_MAX = 8;

interface ShelfCategory {
  id: string;
  name: string;
}

interface ShelfEntity {
  category_id: string;
  is_open_now: boolean;
  has_hours: boolean;
}

/**
 * Las categorías del estante, por relevancia y no alfabéticas: primero las que tienen negocios abiertos ahora entre los
 * ya cargados, luego las que tienen más negocios, y a igualdad, por nombre. Las que no tienen ninguno no entran
 * (no se ofrece un callejón sin salida), salvo que aún no haya negocios cargados: ahí van todas, tal como llegan.
 *
 * Con una categoría elegida los negocios cargados ya vienen filtrados, así que no dicen nada de las demás: se muestran
 * todas en su orden y la elegida va primero para que siempre se vea y se pueda quitar.
 */
export function rankCategories<C extends ShelfCategory>(categories: C[], entities: ShelfEntity[], selectedId?: string): C[] {
  if (selectedId || entities.length === 0) {
    return [...categories].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
  }
  const stats = new Map<string, { open: number; total: number }>();
  for (const e of entities) {
    const s = stats.get(e.category_id) ?? { open: 0, total: 0 };
    s.total += 1;
    if (e.has_hours && e.is_open_now) s.open += 1;
    stats.set(e.category_id, s);
  }
  return categories
    .filter((c) => (stats.get(c.id)?.total ?? 0) > 0)
    .sort((a, b) => {
      const x = stats.get(a.id)!;
      const y = stats.get(b.id)!;
      return y.open - x.open || y.total - x.total || a.name.localeCompare(b.name, 'es');
    });
}

/** Todas las categorías por nombre (la rejilla de «Ver todas»). */
export function alphabetical<C extends ShelfCategory>(categories: C[]): C[] {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** ¿Tiene negocios abiertos ahora entre los cargados? (el puntito verde del estante). */
export function hasOpenNow(categoryId: string, entities: ShelfEntity[]): boolean {
  return entities.some((e) => e.category_id === categoryId && e.has_hours && e.is_open_now);
}
