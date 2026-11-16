/**
 * Las zonas de Inicio (tablero «Inicio», 2026-11-16): las zonas pasan solas como historias y debajo salen tres negocios
 * de la que se ve. Aquí se arman las diapositivas con datos reales: los negocios de cada zona registrada (los que caen
 * en su círculo) y los barrios que se ven en los nombres («Helados del Mar Mamatoco»), lo que se mueve hoy en cada una,
 * una foto arriba y tres ejemplos abajo distintos de ella. Pocas: el resto vive en Empre Finder.
 */
import { splitZone } from './businessName.ts';
import { distanceKm, type Coords } from './geo.ts';

/** Lo mínimo de un negocio que se usa aquí (sale de /api/discovery). */
export interface ZoneBiz {
  id: string;
  name: string;
  category_name: string;
  is_open_now?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  photos?: string[] | null;
  profile_url?: string | null;
}

export interface ZoneGroup<T extends ZoneBiz> {
  key: string;
  name: string;
  items: T[];
  /** Es donde estás (o la zona que elegiste): va primero. */
  here?: boolean;
}

export interface ZoneSlide<T extends ZoneBiz> {
  key: string;
  name: string;
  count: number;
  /** «Hoy se mueve: barbería y comida típica»; null si no hay con qué decirlo. */
  line: string | null;
  hero: T;
  examples: T[];
}

const hasPhoto = (b: ZoneBiz) => Boolean(b.photos?.[0] || b.profile_url);

/** Los negocios que caen en el círculo de una zona registrada. */
export function inCircle<T extends ZoneBiz>(items: readonly T[], center: Coords, radiusM: number): T[] {
  return items.filter((b) => b.latitude != null && b.longitude != null && distanceKm(center, { latitude: b.latitude, longitude: b.longitude }) * 1000 <= radiusM);
}

/** Los negocios de cada barrio que se ve en los nombres (los barrios que no son zonas registradas). */
export function groupByNamedBarrio<T extends ZoneBiz>(items: readonly T[], places: readonly string[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const b of items) {
    const { sede } = splitZone(b.name, places);
    if (!sede) continue;
    out.set(sede, [...(out.get(sede) ?? []), b]);
  }
  return out;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Las dos categorías que más se repiten entre los abiertos («Hoy se mueve: …»); sin abiertos, entre todos («Aquí hay: …»). */
export function movesToday(items: readonly ZoneBiz[]): string | null {
  const open = items.filter((b) => b.is_open_now);
  const base = open.length ? open : items;
  if (!base.length) return null;
  const count = new Map<string, number>();
  for (const b of base) if (b.category_name) count.set(b.category_name, (count.get(b.category_name) ?? 0) + 1);
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => lower(c));
  if (!top.length) return null;
  return `${open.length ? 'Hoy se mueve' : 'Aquí hay'}: ${top.join(' y ')}`;
}

/** Abiertos primero y, entre iguales, los que tienen foto. */
const rank = (a: ZoneBiz, b: ZoneBiz) => Number(Boolean(b.is_open_now)) - Number(Boolean(a.is_open_now)) || Number(hasPhoto(b)) - Number(hasPhoto(a));

/**
 * Las diapositivas: donde estás primero y luego las zonas con más abiertos; como mucho `max`. Cada una lleva una foto
 * arriba y hasta tres ejemplos abajo, ninguno repetido con la de arriba. Una zona con menos de dos negocios no sale.
 */
export function buildZoneSlides<T extends ZoneBiz>(groups: readonly ZoneGroup<T>[], max = 5): ZoneSlide<T>[] {
  const slides: (ZoneSlide<T> & { here: boolean; open: number })[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    const items = g.items.filter((b) => (seen.has(`${g.key}:${b.id}`) ? false : (seen.add(`${g.key}:${b.id}`), true)));
    if (items.length < 2) continue;
    const sorted = [...items].sort(rank);
    const hero = sorted.find(hasPhoto) ?? sorted[0];
    const rest = sorted.filter((b) => b.id !== hero.id);
    slides.push({ key: g.key, name: g.name, count: items.length, line: movesToday(items), hero, examples: rest.slice(0, 3), here: Boolean(g.here), open: items.filter((b) => b.is_open_now).length });
  }
  slides.sort((a, b) => Number(b.here) - Number(a.here) || b.open - a.open || b.count - a.count);
  return slides.slice(0, max).map(({ here: _here, open: _open, ...s }) => s);
}
