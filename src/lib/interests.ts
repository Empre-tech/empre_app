import type { ArtKey } from '@/components/CategoryArt';
import { ART_LABEL, brandKey } from './offerHome.ts';

/**
 * «Para ti» (2026-11-14): lo que más buscas manda, como en TikTok, pero explicado y solo en tu teléfono. Cada cosa que
 * haces deja una señal con el tipo de negocio (su dibujo: comida, barbería…) y pesa según cuánto dice de ti; las
 * señales se apagan con el tiempo (la mitad cada 10 días). Lo que busca la gente del barrio entra con menos peso y es lo
 * que se ve cuando todavía no hay señales tuyas. Nada sale del teléfono.
 */

export type SignalKind = 'search' | 'category' | 'view' | 'offer' | 'contact' | 'directions' | 'booking' | 'follow';

/** Cuánto dice cada cosa de lo que te gusta: mirar pesa poco; escribir, ir o reservar, mucho. */
export const SIGNAL_WEIGHT: Record<SignalKind, number> = {
  view: 1.5,
  offer: 1.5,
  category: 2,
  search: 3,
  contact: 4,
  directions: 4,
  booking: 5,
  follow: 5,
};

export interface Signal {
  kind: SignalKind;
  art: ArtKey;
  at: number;
  entityId?: string;
}

const DAY = 86_400_000;
export const HALF_LIFE_DAYS = 10;
/** Lo más viejo se olvida: más de 90 días o más de 200 señales. */
export const MAX_AGE_DAYS = 90;
export const MAX_SIGNALS = 200;

export const decay = (at: number, now: number) => 0.5 ** (Math.max(0, now - at) / DAY / HALF_LIFE_DAYS);

/** La lista con la señal nueva de primera, sin lo vencido. */
export function addSignal(list: Signal[], s: Signal): Signal[] {
  return [s, ...list.filter((x) => s.at - x.at < MAX_AGE_DAYS * DAY)].slice(0, MAX_SIGNALS);
}

function normalized<K>(m: Map<K, number>): Map<K, number> {
  const top = Math.max(0, ...m.values());
  if (top <= 0) return new Map();
  return new Map([...m].map(([k, v]) => [k, v / top]));
}

/** Tus intereses por tipo de negocio, de 0 a 1 (el que más, 1). Vacío si no hay señales. */
export function myInterests(signals: Signal[], now: number): Map<ArtKey, number> {
  const m = new Map<ArtKey, number>();
  for (const s of signals) m.set(s.art, (m.get(s.art) ?? 0) + SIGNAL_WEIGHT[s.kind] * decay(s.at, now));
  return normalized(m);
}

/** Los negocios que ya miraste o contactaste, de 0 a 1: para «Lo viste hace poco». */
export function seenBusinesses(signals: Signal[], now: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of signals) if (s.entityId) m.set(s.entityId, (m.get(s.entityId) ?? 0) + SIGNAL_WEIGHT[s.kind] * decay(s.at, now));
  return normalized(m);
}

/** Lo que busca la gente del barrio (el primero pesa más), por tipo de negocio, de 0 a 1. */
export function peopleInterests(terms: string[], match: (text: string) => ArtKey | null): Map<ArtKey, number> {
  const m = new Map<ArtKey, number>();
  terms.forEach((t, i) => {
    const art = match(t);
    if (art) m.set(art, (m.get(art) ?? 0) + 1 / (1 + i * 0.35));
  });
  return normalized(m);
}

export type PickSource = 'tuyo' | 'visto' | 'gente' | 'descubrir' | 'cerca';

export interface ForYouPick<T> {
  item: T;
  reason: string;
  source: PickSource;
}

interface Candidate {
  id: string;
  name: string;
  category_name: string;
  category_icon?: string | null;
  distance_meters: number;
  is_open_now: boolean;
  avg_rating?: number;
  review_count?: number;
}

const label = (a: ArtKey) => ART_LABEL[a].toLowerCase();

/**
 * Los negocios de «Para ti»: lo tuyo primero (lo que más buscas, lo que ya miraste), después lo que busca la gente, y
 * un hueco para descubrir algo de otro tipo, así no se vuelve siempre lo mismo. Como mucho `perArt` del mismo tipo y
 * una sola sede por negocio («El Rincón Samario» y «El Rincón Samario Mamatoco» salen una vez). Si quedan menos de
 * `fillTo`, se completa con lo abierto más cerca («Abierto cerca»). Cada uno dice por qué está. Sin señales tuyas ni
 * de la gente, no hay lista (no se inventa).
 */
export function forYou<T extends Candidate>(
  list: T[],
  mine: Map<ArtKey, number>,
  people: Map<ArtKey, number>,
  seen: Map<string, number>,
  artOf: (name: string, icon?: string | null) => ArtKey,
  max = 8,
  perArt = 2,
  fillTo = 4,
): ForYouPick<T>[] {
  const scored = list
    .map((item) => {
      const art = artOf(item.category_name, item.category_icon);
      const m = mine.get(art) ?? 0;
      const p = people.get(art) ?? 0;
      const v = seen.get(item.id) ?? 0;
      const near = 1 - Math.min(item.distance_meters, 2000) / 2000;
      const liked = (item.avg_rating ?? 0) >= 4 && (item.review_count ?? 0) >= 3 ? 1 : 0;
      const score = m + 0.45 * p + 0.8 * v + 0.2 * (item.is_open_now ? 1 : 0) + 0.25 * near + 0.1 * liked;
      // El porqué es lo que más pesó: lo que ya miraste, lo que tú buscas o lo que busca la gente.
      const pick: ForYouPick<T> =
        v >= 0.3
          ? { item, reason: 'Lo viste hace poco', source: 'visto' }
          : m > 0 && m >= 0.45 * p
            ? { item, reason: `Buscas ${label(art)}`, source: 'tuyo' }
            : { item, reason: 'Lo buscan cerca', source: 'gente' };
      return { art, signal: m + p + v, score, pick };
    })
    .filter((x) => x.signal > 0)
    .sort((a, b) => b.score - a.score);

  const out: typeof scored = [];
  const perKey = new Map<ArtKey, number>();
  const brands = new Set<string>();
  const brandOf = (item: T) => brandKey(item.name) || item.id;
  for (const x of scored) {
    if (out.length >= max) break;
    if ((perKey.get(x.art) ?? 0) >= perArt || brands.has(brandOf(x.pick.item))) continue;
    out.push(x);
    perKey.set(x.art, (perKey.get(x.art) ?? 0) + 1);
    brands.add(brandOf(x.pick.item));
  }

  // Para descubrir: si todo es de tus dos tipos de siempre, entra el mejor de otro tipo en el tercer lugar.
  const myTop = [...mine].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  if (myTop.length && out.length >= 3 && out.every((x) => myTop.includes(x.art))) {
    const other = scored.find((x) => !myTop.includes(x.art) && !out.includes(x) && !brands.has(brandOf(x.pick.item)));
    if (other) {
      const dropped = out.length >= max ? out.pop() : undefined;
      if (dropped) brands.delete(brandOf(dropped.pick.item));
      brands.add(brandOf(other.pick.item));
      out.splice(2, 0, { ...other, pick: { item: other.pick.item, reason: (people.get(other.art) ?? 0) >= 0.3 ? 'Lo buscan cerca' : 'Para descubrir', source: 'descubrir' } });
    }
  }

  const picks = out.map((x) => x.pick);
  // Fila corta: se completa con lo abierto más cerca, de otros negocios, diciendo por qué está.
  if (picks.length && picks.length < fillTo) {
    const rest = list
      .filter((item) => !brands.has(brandOf(item)))
      .sort((a, b) => Number(b.is_open_now) - Number(a.is_open_now) || a.distance_meters - b.distance_meters);
    for (const item of rest) {
      if (picks.length >= fillTo) break;
      if (brands.has(brandOf(item))) continue;
      brands.add(brandOf(item));
      picks.push({ item, reason: item.is_open_now ? 'Abierto cerca' : 'Cerca de ti', source: 'cerca' });
    }
  }
  return picks;
}

/**
 * Cuando todos los de la fila están por la misma razón (los cuatro «Lo viste hace poco»), la razón va una vez, en el
 * título, y debajo de cada uno va lo que lo distingue (tablero «Inicio», 2026-11-16). Si las razones son distintas, null.
 */
export function sharedReasonTitle(reasons: readonly string[]): string | null {
  if (reasons.length < 2 || reasons.some((r) => r !== reasons[0])) return null;
  const r = reasons[0];
  if (r === 'Lo viste hace poco') return 'Lo que viste hace poco';
  if (r === 'Lo buscan cerca') return 'Lo que buscan cerca';
  if (r === 'Abierto cerca') return 'Abierto cerca de ti';
  if (r.startsWith('Buscas ')) return `Porque buscas ${r.slice('Buscas '.length)}`;
  return r;
}

/** El título de la fila y su porqué. Sin señales, nada. */
export function forYouHeader(mine: Map<ArtKey, number>, people: Map<ArtKey, number>): { title: string; sub: string } | null {
  const top = [...mine].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => label(k));
  if (top.length) return { title: 'Para ti', sub: `Por lo que más buscas: ${top.join(' y ')}` };
  if (people.size) return { title: 'Lo que más se busca cerca', sub: 'Lo que la gente de tu barrio está buscando' };
  return null;
}
