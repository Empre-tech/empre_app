// Lógica pura para encontrar insumos entre cientos: grupos, búsqueda sin tildes y filtros por estado.
// Se prueba con `node --test` (ver supplies.test.ts).
// (Sin imports: así corre igual con `node --test` que en la app.)

interface Block<T> {
  title: string;
  items: T[];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export const NO_GROUP = 'Sin grupo';

interface Groupable {
  name: string;
  group?: string;
}

/** El grupo de un insumo, o «Sin grupo». */
export function groupOf(i: Groupable): string {
  return (i.group ?? '').trim() || NO_GROUP;
}

/** Ordena alfabéticamente, con «Sin grupo» siempre al final. */
function byGroupName(a: string, b: string): number {
  if (a === b) return 0;
  if (a === NO_GROUP) return 1;
  if (b === NO_GROUP) return -1;
  return a.localeCompare(b, 'es');
}

/** Los grupos con cuántos insumos tiene cada uno (para los chips del buscador). */
export function groupCounts<T extends Groupable>(items: T[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const i of items) map.set(groupOf(i), (map.get(groupOf(i)) ?? 0) + 1);
  return [...map.entries()].sort(([a], [b]) => byGroupName(a, b)).map(([name, count]) => ({ name, count }));
}

/** Los grupos que el dueño ya escribió (sin «Sin grupo»), para elegir uno al crear. */
export function knownGroups<T extends Groupable>(items: T[]): string[] {
  return groupCounts(items)
    .map((g) => g.name)
    .filter((g) => g !== NO_GROUP);
}

/** Agrupa por grupo, A–Z dentro de cada uno. */
export function blocksByGroup<T extends Groupable>(items: T[]): Block<T>[] {
  const map = new Map<string, T[]>();
  for (const i of items) map.set(groupOf(i), [...(map.get(groupOf(i)) ?? []), i]);
  return [...map.entries()]
    .sort(([a], [b]) => byGroupName(a, b))
    .map(([title, list]) => ({ title, items: [...list].sort((x, y) => x.name.localeCompare(y.name, 'es')) }));
}

/**
 * Busca sin importar tildes ni mayúsculas: «pimenton» encuentra «Pimentón rojo». Primero los que empiezan con lo
 * escrito, después los que lo contienen; también busca en el grupo («carnes» trae todas las carnes).
 */
export function searchSupplies<T extends Groupable>(items: T[], query: string): T[] {
  const q = normalize(query);
  if (!q) return items;
  const starts: T[] = [];
  const contains: T[] = [];
  for (const i of items) {
    const n = normalize(i.name);
    if (n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q))) starts.push(i);
    else if (n.includes(q) || normalize(groupOf(i)).startsWith(q)) contains.push(i);
  }
  const az = (a: T, b: T) => a.name.localeCompare(b.name, 'es');
  return [...starts.sort(az), ...contains.sort(az)];
}

/** ¿Ya hay uno que se llame así (sin importar tildes)? Entonces no se ofrece crearlo. */
export function hasExact<T extends Groupable>(items: T[], name: string): boolean {
  const q = normalize(name);
  return q.length > 0 && items.some((i) => normalize(i.name) === q);
}

/** Primera letra en mayúscula y sin espacios dobles: así «carnes» y «Carnes » terminan en el mismo grupo. */
export function cleanLabel(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

export type SupplyFilter = 'attention' | 'out' | 'low' | 'all';

/** Filtra por estado: «atención» = se acabó o queda poco. */
export function filterByStatus<T extends { status: string }>(items: T[], f: SupplyFilter): T[] {
  if (f === 'all') return items;
  if (f === 'attention') return items.filter((i) => i.status === 'out' || i.status === 'low');
  return items.filter((i) => i.status === f);
}

/** Resumen de un grupo plegado: «2 se acabaron · 4 poco». */
export function groupSummary(items: { status: string }[]): { text: string; tone: 'out' | 'low' | 'muted' } {
  const out = items.filter((i) => i.status === 'out').length;
  const low = items.filter((i) => i.status === 'low').length;
  if (out === 0 && low === 0) return { text: `${items.length}`, tone: 'muted' };
  const parts = [out ? (out === 1 ? '1 se acabó' : `${out} se acabaron`) : null, low ? (out ? `${low} poco` : low === 1 ? '1 queda poco' : `${low} quedan poco`) : null];
  return { text: parts.filter(Boolean).join(' · '), tone: out ? 'out' : 'low' };
}

/** Las secciones del catálogo con cuántos productos tiene cada una, de la más usada a la menos. */
export function sectionCounts(items: { section?: string | null; parent_id?: string | null }[]): { name: string; count: number }[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const i of items) {
    if (i.parent_id) continue; // las variantes van con su producto
    const name = (i.section ?? '').trim();
    if (!name) continue;
    const key = normalize(name);
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else map.set(key, { name, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

/** Cuánto ganas por unidad. Null si falta el precio o el costo. */
export function marginOf(price: number | null | undefined, cost: number | null | undefined): { amount: number; pct: number } | null {
  if (price == null || cost == null || !(price > 0) || !(cost > 0)) return null;
  const amount = price - cost;
  return { amount, pct: Math.round((amount / price) * 100) };
}
