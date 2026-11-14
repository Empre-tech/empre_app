import type { ArtKey } from '@/components/CategoryArt';

/** Nombre corto de cada ilustración: es lo que dice el ícono en la portada de Ofertas. */
export const ART_LABEL: Record<ArtKey, string> = {
  comida: 'Comida',
  belleza: 'Belleza',
  barberia: 'Barbería',
  ropa: 'Ropa',
  calzado: 'Calzado',
  tecnologia: 'Tecnología',
  talleres: 'Talleres',
  unas: 'Uñas',
  papeleria: 'Papelería',
  mascotas: 'Mascotas',
  hogar: 'Hogar',
  salud: 'Salud',
  tienda: 'Tiendas',
};

export interface IconGroup {
  key: ArtKey;
  label: string;
  /** Las categorías que caben en el ícono (el servidor acepta varias separadas por coma). */
  ids: string[];
  /** Negocios cercanos de ese tipo: los íconos con más van primero. */
  near: number;
}

/**
 * Los íconos de la portada: las 84 categorías sueltas se juntan por su ilustración (comida, belleza, ropa…), así un
 * toque filtra todo lo de ese tipo. Primero los que tienen negocios cerca; como mucho `max` (dos filas de cinco).
 */
export function iconGroups(
  categories: { id: string; name: string; icon?: string | null }[],
  nearby: { category_id: string }[],
  artOf: (name: string, icon?: string | null) => ArtKey,
  max = 10,
): IconGroup[] {
  const byKey = new Map<ArtKey, IconGroup>();
  for (const c of categories) {
    const key = artOf(c.name, c.icon);
    const g = byKey.get(key) ?? { key, label: ART_LABEL[key], ids: [], near: 0 };
    g.ids.push(c.id);
    byKey.set(key, g);
  }
  for (const b of nearby) for (const g of byKey.values()) if (g.ids.includes(b.category_id)) g.near += 1;
  const order = Object.keys(ART_LABEL) as ArtKey[];
  return [...byKey.values()]
    .sort((a, b) => b.near - a.near || order.indexOf(a.key) - order.indexOf(b.key))
    .slice(0, max);
}

export interface PopularPick<T> {
  item: T;
  rank: number;
}

/**
 * «Lo más pegado»: los negocios cercanos con más reseñas buenas (nota × cuántas). Solo cuenta lo que la gente
 * reseñó de verdad; con menos de dos negocios reseñados no hay lista (no se inventa un ranking).
 */
export function mostPopular<T extends { id: string; avg_rating: number; review_count: number }>(list: T[], max = 6): PopularPick<T>[] {
  const reviewed = list.filter((b) => b.review_count > 0 && b.avg_rating > 0);
  if (reviewed.length < 2) return [];
  const score = (b: T) => b.avg_rating * Math.log1p(b.review_count);
  return [...reviewed]
    .sort((a, b) => score(b) - score(a))
    .slice(0, max)
    .map((item, i) => ({ item, rank: i + 1 }));
}

/** «Abierto hasta 9 pm» / «Cerrado» / null, desde lo que manda Descubrir. */
export function openLine(b: { is_open_now?: boolean; closes_at?: string }): string | null {
  if (b.is_open_now === undefined) return null;
  if (!b.is_open_now) return 'Cerrado ahora';
  if (!b.closes_at) return 'Abierto';
  if (b.closes_at === '24h') return 'Abierto 24 h';
  const [h, m] = b.closes_at.split(':').map(Number);
  if (Number.isNaN(h)) return 'Abierto';
  const hh = h % 12 || 12;
  return `Abierto hasta ${hh}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

const plainText = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ');

/** Cada palabra buscada (de 2+ letras) empieza alguna palabra del texto, sin importar tildes ni plural corto. */
export function matchesQuery(text: string, q: string): boolean {
  const words = plainText(text).split(/\s+/).filter(Boolean);
  const want = plainText(q).split(/\s+/).filter((w) => w.length >= 2);
  if (!want.length) return false;
  return want.every((w) => {
    const stem = w.length > 4 ? w.slice(0, w.length - 1) : w;
    return words.some((x) => x.startsWith(stem));
  });
}

interface ResultLike {
  id: string;
  entity_id: string;
  entity_name: string;
  title: string;
  kind?: string;
  section?: string;
  category_name?: string;
  linked_offer_title?: string;
  service_id?: string;
  open_now?: boolean;
  open_until?: string;
  distance_meters?: number | null;
}

export interface ResultGroup<T> {
  entityId: string;
  name: string;
  open: boolean | null;
  openUntil?: string;
  distance: number | null;
  items: T[];
}

/**
 * Resultados de una búsqueda en Ofertas, como en los mercados: un grupo por negocio con solo lo que coincide.
 * Lo que trajo Empre AI (id «ask-») ya coincide; lo demás se filtra por el texto. Abiertos primero y luego los más
 * cerca: nadie paga por subir.
 */
export function groupResults<T extends ResultLike>(items: T[], q: string): ResultGroup<T>[] {
  const groups = new Map<string, ResultGroup<T>>();
  const seen = new Set<string>();
  for (const it of items) {
    const hit = it.id.startsWith('ask-') || matchesQuery([it.title, it.section, it.category_name, it.linked_offer_title].filter(Boolean).join(' '), q);
    if (!hit) continue;
    const key = `${it.entity_id}|${it.service_id ?? plainText(it.title).trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const g = groups.get(it.entity_id) ?? { entityId: it.entity_id, name: it.entity_name, open: it.open_now ?? null, openUntil: it.open_until, distance: it.distance_meters ?? null, items: [] };
    if (g.open === null && it.open_now !== undefined) g.open = it.open_now;
    if (g.distance === null && it.distance_meters != null) g.distance = it.distance_meters;
    g.items.push(it);
    groups.set(it.entity_id, g);
  }
  const rank = (o: boolean | null) => (o === true ? 0 : o === null ? 1 : 2);
  return [...groups.values()].sort((a, b) => rank(a.open) - rank(b.open) || (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

/** «hasta 9 pm» desde «21:00»; «24 h»; null si no hay. */
export function untilLabel(closes?: string | null): string | null {
  if (!closes) return null;
  if (closes === '24h') return '24 h';
  const [h, m] = closes.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return `hasta ${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * El aviso de una tarjeta abierta en Inicio: «Cierra 9 pm», «Cierra en 40 min» si falta una hora o menos (`soon`, va
 * en rojo) o «Abierto 24 h». Sin horario no hay aviso.
 */
export function closeChip(closes: string | null | undefined, now: number): { text: string; soon: boolean } | null {
  if (!closes) return null;
  if (closes === '24h') return { text: 'Abierto 24 h', soon: false };
  const [h, m] = closes.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const d = new Date(now);
  let left = h * 60 + (m || 0) - (d.getHours() * 60 + d.getMinutes());
  if (left <= 0) left += 24 * 60; // cierra pasada la medianoche
  if (left <= 60) return { text: `Cierra en ${left} min`, soon: true };
  return { text: `Cierra ${(untilLabel(closes) ?? '').replace('hasta ', '')}`, soon: false };
}

/** «6 pm» o «6:30 pm» de una fecha: para «La primera termina a las 6 pm». */
export function hourLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (untilLabel(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`) ?? '').replace('hasta ', '') || null;
}

export interface ArtCount {
  key: ArtKey;
  label: string;
  /** Las categorías que caben en el dibujo, separadas por coma: así filtra el mapa. */
  ids: string;
  count: number;
}

/**
 * Las categorías de Inicio: los negocios cerca juntados por su dibujo (comida, barbería…), con cuántos hay. Solo las
 * que tienen alguno, de más a menos; nunca dos pastillas con el mismo dibujo.
 */
export function artCounts(
  list: { category_id: string; category_name: string; category_icon?: string | null }[],
  artOf: (name: string, icon?: string | null) => ArtKey,
  max = 8,
): ArtCount[] {
  const byKey = new Map<ArtKey, { ids: Set<string>; count: number }>();
  for (const b of list) {
    const key = artOf(b.category_name, b.category_icon);
    const g = byKey.get(key) ?? { ids: new Set<string>(), count: 0 };
    g.ids.add(b.category_id);
    g.count += 1;
    byKey.set(key, g);
  }
  const order = Object.keys(ART_LABEL) as ArtKey[];
  return [...byKey.entries()]
    .map(([key, g]) => ({ key, label: ART_LABEL[key], ids: [...g.ids].join(','), count: g.count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key))
    .slice(0, max);
}

/** Las dos primeras palabras que importan del nombre: «El Rincón Samario Mamatoco» y «El Rincón Samario» dan lo mismo. */
function brandKey(name: string): string {
  return plainText(name)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['los', 'las', 'del'].includes(w))
    .slice(0, 2)
    .join(' ');
}

/**
 * Sedes del mismo negocio (mismo nombre y casi la misma carta) salen en una sola fila, la más cercana, con cuántas
 * sedes hay cerca. Así no hay dos filas iguales en la misma pantalla.
 */
export function mergeBranches<T extends { biz: { name: string }; items: { name: string }[] }>(list: T[]): (T & { branches: number })[] {
  const out: (T & { branches: number })[] = [];
  for (const x of list) {
    const names = new Set(x.items.map((i) => plainText(i.name).trim()));
    const twin = out.find((o) => {
      if (brandKey(o.biz.name) !== brandKey(x.biz.name) || !brandKey(x.biz.name)) return false;
      const shared = o.items.filter((i) => names.has(plainText(i.name).trim())).length;
      return shared >= 2 && shared >= Math.min(o.items.length, x.items.length) * 0.6;
    });
    if (twin) twin.branches += 1;
    else out.push({ ...x, branches: 1 });
  }
  return out;
}
