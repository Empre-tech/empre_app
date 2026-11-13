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
