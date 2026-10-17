/**
 * Los grupos de categorías de Explorar: cinco, solo de presentación (las categorías y subcategorías del servidor no
 * cambian). Se reparten por el nombre de la categoría; una categoría que no está en ningún grupo (una nueva, por
 * ejemplo) cae en «Servicios» para que nunca quede fuera del filtro.
 */
export type GroupId = 'comer' | 'salud' | 'compras' | 'servicios' | 'planes';

interface Def {
  id: GroupId;
  name: string;
  /** Nombres de categoría, sin tildes ni mayúsculas. */
  members: string[];
}

const DEFS: Def[] = [
  { id: 'comer', name: 'Comer y beber', members: ['restaurantes', 'cafeterias y postres', 'bares y vida nocturna'] },
  { id: 'salud', name: 'Belleza y salud', members: ['belleza y peluqueria', 'salud y bienestar', 'deporte y recreacion'] },
  { id: 'compras', name: 'Compras', members: ['tiendas y comercio', 'tecnologia', 'mascotas'] },
  { id: 'servicios', name: 'Servicios', members: ['servicios del hogar', 'automotriz', 'educacion', 'fotografia y diseno', 'otros'] },
  { id: 'planes', name: 'Planes y viajes', members: ['turismo y hospedaje', 'eventos y fiestas'] },
];

/** El grupo que cae por defecto. */
const FALLBACK: GroupId = 'servicios';

interface Named {
  id: string;
  name: string;
}

export interface CategoryGroup<C extends Named> {
  id: GroupId;
  name: string;
  categories: C[];
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .trim();
}

/** Los grupos con al menos una categoría, en su orden fijo; dentro, las categorías por nombre. */
export function buildGroups<C extends Named>(categories: C[]): CategoryGroup<C>[] {
  const byGroup = new Map<GroupId, C[]>();
  for (const c of categories) {
    const key = norm(c.name);
    const def = DEFS.find((d) => d.members.includes(key));
    const id = def?.id ?? FALLBACK;
    byGroup.set(id, [...(byGroup.get(id) ?? []), c]);
  }
  return DEFS.filter((d) => byGroup.has(d.id)).map((d) => ({
    id: d.id,
    name: d.name,
    categories: [...(byGroup.get(d.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es')),
  }));
}

/** El grupo de una categoría. */
export function groupIdOf<C extends Named>(categoryId: string, groups: CategoryGroup<C>[]): GroupId | undefined {
  return groups.find((g) => g.categories.some((c) => c.id === categoryId))?.id;
}

/**
 * Lo que se manda como filtro `category`: la categoría elegida; si solo hay grupo, todas las del grupo separadas por
 * coma (el servidor acepta varias); si no hay nada, sin filtro.
 */
export function categoryFilter<C extends Named>(groupId: GroupId | undefined, categoryId: string | undefined, groups: CategoryGroup<C>[]): string | undefined {
  if (categoryId) return categoryId;
  if (!groupId) return undefined;
  const ids = groups.find((g) => g.id === groupId)?.categories.map((c) => c.id) ?? [];
  return ids.length ? ids.join(',') : undefined;
}
