// Ofertas del barrio (3.48, mockup ofertas_donde_buscar.html versión 4): lo que se dice en la franja, la pasarela, el
// mosaico, las rutas, los vecinos y las voces. Sin React ni red, para probarlo con Node. Las piezas las arma el
// servidor (sin repetir ofertas ni tipos de negocio); aquí solo se decide qué texto y qué orden se muestran.

import type { GroupId } from './categoryGroups';
import type { MarketItem } from './offerMarket';

export type SpotlightRule = 'save_today' | 'ends_first' | 'new_week';

export interface MarketSlide {
  rule: SpotlightRule;
  item: MarketItem;
}

/** Ruta del barrio: tres vecinos de tipos distintos, en orden de paso, con el ahorro sumado. */
export interface MarketRoute {
  stops: MarketItem[];
  saving: number;
  walk_meters: number;
}

/** Círculo de «Tus vecinos hoy»; `time_left` (0 a 1) es lo que le queda a su oferta. */
export interface MarketNeighbor {
  item: MarketItem;
  time_left: number;
}

/** Frase de «Lo recomiendan tus vecinos»: una reseña verificada (de un canje), con la oferta de hoy del negocio. */
export interface MarketVoice {
  quote: string;
  author: string;
  when: string;
  item: MarketItem;
}

/** «Este mes ahorraste»: el total y los negocios, el más reciente primero. Es el historial propio, no un conteo. */
export interface MonthSavings {
  total: number;
  businesses: { id: string; name: string; category_color?: string; profile_photo?: string }[];
}

const BLOCK_M = 100; // una cuadra
const NEAR_M = 3000; // «tu barrio» (MarketNearRadiusM del servidor)

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');

/**
 * Se puede confiar en las distancias solo si hay ubicación y una ciudad: lejos de toda ciudad de Empre el servidor
 * no adivina una, y mostrar «5575,7 km» en cada tarjeta no ayuda a nadie (auditoría 3.48, P1).
 */
export function trustDistances(hasLocation: boolean, city: string): boolean {
  return hasLocation && city.trim() !== '';
}

/** Distancia como se habla en el barrio: «a 1 cuadra», «a 7 cuadras»; desde 1 km, «a 1,2 km». null = no se sabe. */
export function blocksLabel(m: number | null | undefined): string | null {
  if (m === null || m === undefined || m < 0) return null;
  if (m >= 1000) return `a ${(m / 1000).toFixed(1).replace('.', ',')} km`;
  const n = Math.max(1, Math.round(m / BLOCK_M));
  return `a ${n} ${n === 1 ? 'cuadra' : 'cuadras'}`;
}

/** Lo que dice el recorrido de una ruta: «A pie · 5 cuadras»; más de 1,5 km, en km. */
export function walkLabel(m: number): string {
  if (m > 1500) return `${(m / 1000).toFixed(1).replace('.', ',')} km de recorrido`;
  const n = Math.max(1, Math.round(m / BLOCK_M));
  return `A pie · ${n} ${n === 1 ? 'cuadra' : 'cuadras'}`;
}

/** Ahorro en pesos de una oferta (referencia menos precio especial); 0 sin ahorro real. */
export function savingPesos(o: Pick<MarketItem, 'special_price' | 'reference_price'>): number {
  const sp = o.special_price;
  const rp = o.reference_price;
  return typeof sp === 'number' && typeof rp === 'number' && rp > sp ? rp - sp : 0;
}

/** «$7.000»; null sin ahorro. */
export function savingText(o: Pick<MarketItem, 'special_price' | 'reference_price'>): string | null {
  const s = savingPesos(o);
  return s > 0 ? pesos(s) : null;
}

/**
 * El monto del titular de la franja («Ahorra hasta $25.000 con tus vecinos hoy»): el mayor ahorro real entre lo que se
 * ve, primero lo de tu barrio (a menos de 3 km). 0 = no hay titular (sin ahorro no se inventa uno).
 */
export function bandHook(items: Pick<MarketItem, 'special_price' | 'reference_price' | 'distance_meters'>[]): number {
  const near = items.filter((o) => o.distance_meters !== null && o.distance_meters !== undefined && o.distance_meters >= 0 && o.distance_meters <= NEAR_M);
  const pool = near.some((o) => savingPesos(o) > 0) ? near : items;
  return pool.reduce((m, o) => Math.max(m, savingPesos(o)), 0);
}

/** La regla de una diapositiva de la pasarela, como se lee en su etiqueta. */
export function spotlightLabel(rule: SpotlightRule, zone?: string): { text: string; icon: 'cash-outline' | 'time-outline' | 'sparkles-outline' } {
  switch (rule) {
    case 'save_today':
      return { text: 'Mayor ahorro de hoy', icon: 'cash-outline' };
    case 'ends_first':
      return { text: 'La que termina antes', icon: 'time-outline' };
    default:
      return { text: zone ? `Nueva esta semana en ${zone}` : 'Nueva esta semana', icon: 'sparkles-outline' };
  }
}

/**
 * Nombre de una ruta según la mezcla de negocios (los grupos de Explorar de sus paradas). Nombres de plan, no de
 * categoría: «Tarde de consentirse» si hay belleza o bienestar; «Día de vueltas» si se junta comer con compras o
 * servicios; «Plan de paseo» si hay planes y viajes; si no, «Ruta por el barrio».
 */
export function routeName(groups: (GroupId | undefined)[]): string {
  const has = (g: GroupId) => groups.includes(g);
  if (has('salud')) return 'Tarde de consentirse';
  if (has('comer') && (has('compras') || has('servicios'))) return 'Día de vueltas';
  if (has('planes')) return 'Plan de paseo';
  return 'Ruta por el barrio';
}

const TITLES = /^(don|doña|dona|sr\.?|sra\.?)\s+/i;

/** Quién atiende, para la tarjeta y la historia: «Ana, quien atiende»; vacío si el negocio no lo puso. */
export function attendantLine(o: Pick<MarketItem, 'attendant_name'>): string {
  const n = (o.attendant_name ?? '').trim();
  return n ? `${n}, quien atiende` : '';
}

/** Letra del círculo de un vecino: la de quien atiende (sin «Don» ni «Doña»); si no hay, la del negocio. */
export function personInitial(o: Pick<MarketItem, 'attendant_name' | 'entity_name'>): string {
  const n = (o.attendant_name ?? '').trim().replace(TITLES, '') || o.entity_name.trim().replace(/^(la|el|los|las)\s+/i, '');
  return (Array.from(n)[0] ?? '').toLocaleUpperCase('es');
}

/** Nombre corto del círculo: quien atiende; si no hay, el negocio. */
export function neighborName(o: Pick<MarketItem, 'attendant_name' | 'entity_name'>): string {
  return (o.attendant_name ?? '').trim() || o.entity_name;
}

/** Cuándo canjeó quien escribió la reseña: «canjeó hoy», «ayer», «hace 3 días», «la semana pasada», «este mes». */
export function redeemedWhen(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'canjeó aquí';
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return 'canjeó hoy';
  if (days === 1) return 'canjeó ayer';
  if (days < 7) return `canjeó hace ${days} días`;
  if (days < 14) return 'canjeó la semana pasada';
  return days < 31 ? 'canjeó este mes' : 'canjeó aquí';
}

/** El anillo de un vecino va en naranja si a su oferta le queda menos de una hora. */
export function ringUrgent(endsAt: string, now: number): boolean {
  const ms = Date.parse(endsAt) - now;
  return ms > 0 && ms < 3_600_000;
}

/** Mayor ahorro en porcentaje por grupo, entre lo que se ve («Hasta −50 %» en las tarjetas de «¿Qué se te antoja?»). */
export function bestByGroup(items: MarketItem[], groupOf: (categoryName: string) => GroupId | undefined): Partial<Record<GroupId, number>> {
  const out: Partial<Record<GroupId, number>> = {};
  for (const o of items) {
    const g = groupOf(o.category_name);
    const sp = o.special_price;
    const rp = o.reference_price;
    if (!g || typeof sp !== 'number' || typeof rp !== 'number' || rp <= sp) continue;
    const pct = Math.round((1 - sp / rp) * 100);
    out[g] = Math.max(out[g] ?? 0, pct);
  }
  return out;
}
