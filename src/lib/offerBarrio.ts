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

export type RouteTheme = 'pamper' | 'errands' | 'active' | 'night' | 'sweet' | 'pet' | 'zone' | 'day';
export type RouteLevel = 'walk' | 'zone' | 'day';

/**
 * Ruta del barrio (3.49): su tema, su nivel (a pie, en tu barrio o tu día en la ciudad), las paradas en orden con la
 * hora sugerida de cada una (`times[i]`; null si el negocio no tiene horario) y el ahorro sumado.
 */
export interface MarketRoute {
  theme: RouteTheme;
  level: RouteLevel;
  /** La zona de la primera parada. */
  zone?: string;
  stops: MarketItem[];
  times: (string | null)[];
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

const THEME_NAME: Record<Exclude<RouteTheme, 'zone' | 'day'>, string> = {
  pamper: 'Tarde de consentirse',
  errands: 'Día de vueltas',
  active: 'Mañana activa',
  night: 'Noche en el barrio',
  sweet: 'Antojo dulce',
  pet: 'Plan con tu mascota',
};
const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const TZ_OFFSET_MS = -5 * 3_600_000; // Colombia (UTC−5, sin horario de verano)
const bogota = (iso: string) => new Date(Date.parse(iso) + TZ_OFFSET_MS); // leer con getUTC*

/** El nombre de la ruta: el de su tema; «Ruta por {zona}» si es la mezcla de siempre; «Tu sábado en {ciudad}» si es tu día. */
export function routeTitle(r: Pick<MarketRoute, 'theme' | 'zone' | 'times'>, city: string): string {
  if (r.theme === 'day') {
    const first = r.times.find((t): t is string => Boolean(t));
    const day = first ? WEEKDAY[bogota(first).getUTCDay()] : 'día';
    return city ? `Tu ${day} en ${city}` : `Tu ${day} en la ciudad`;
  }
  if (r.theme === 'zone') return r.zone ? `Ruta por ${r.zone}` : 'Ruta por el barrio';
  return THEME_NAME[r.theme] ?? 'Ruta por el barrio';
}

/** «3:00 pm» (hora de Colombia). */
export function clockLabel(iso: string): string {
  const d = bogota(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

/** El momento del día de una hora: mañana (antes de 12), tarde (antes de 18) o noche. */
export function momentOf(iso: string): 'mañana' | 'tarde' | 'noche' {
  const h = bogota(iso).getUTCHours();
  return h < 12 ? 'mañana' : h < 18 ? 'tarde' : 'noche';
}

/**
 * Lo que dice la tarjeta bajo el nombre, sin adornos: «A pie · 4 cuadras», «En tu barrio · 2,4 km de recorrido» o,
 * para tu día, los momentos («Mañana, tarde y noche»). Si la ruta queda en otra zona, la nombra («A pie en El Rodadero»).
 */
export function levelLabel(r: Pick<MarketRoute, 'level' | 'zone' | 'walk_meters' | 'times'>, hereZone: string): string {
  if (r.level === 'day') {
    const moments = [...new Set(r.times.filter((t): t is string => Boolean(t)).map(momentOf))];
    const list = moments.length > 1 ? `${moments.slice(0, -1).join(', ')} y ${moments[moments.length - 1]}` : (moments[0] ?? 'todo el día');
    return list.charAt(0).toLocaleUpperCase('es') + list.slice(1);
  }
  const elsewhere = r.zone && r.zone !== hereZone ? r.zone : '';
  if (r.level === 'walk') {
    const n = Math.max(1, Math.round(r.walk_meters / BLOCK_M));
    return `A pie${elsewhere ? ` en ${elsewhere}` : ''} · ${n} ${n === 1 ? 'cuadra' : 'cuadras'}`;
  }
  return `${elsewhere ? `En ${elsewhere}` : 'En tu barrio'} · ${(r.walk_meters / 1000).toFixed(1).replace('.', ',')} km de recorrido`;
}

/** Por qué es esta ruta, en una línea: para qué momento y con qué regla. */
export function routeWhy(r: Pick<MarketRoute, 'level' | 'times'>): string {
  if (r.level === 'day') return 'Nada cerca de ti: un plan por momentos, cada uno abierto a esa hora';
  const first = r.times.find((t): t is string => Boolean(t));
  if (!first) return 'Abiertos ahora; revisa el horario de cada uno';
  const m = momentOf(first);
  return `Para ${m === 'noche' ? 'esta noche' : m === 'tarde' ? 'esta tarde' : 'esta mañana'} · abiertos a esa hora`;
}

/** Distancia en línea recta entre dos negocios (m); −1 si falta un punto. */
export function metersBetween(a: { latitude?: number; longitude?: number }, b: { latitude?: number; longitude?: number }): number {
  if (a.latitude === undefined || a.longitude === undefined || b.latitude === undefined || b.longitude === undefined) return -1;
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(s));
}

/** El tramo entre dos paradas: «2 cuadras, 3 min a pie»; más de 2 km, «4,3 km en carro o taxi». */
export function legLabel(m: number): string | null {
  if (m < 0) return null;
  if (m > 2000) return `${(m / 1000).toFixed(1).replace('.', ',')} km en carro o taxi`;
  const min = Math.max(1, Math.round(m / 80)); // 80 m por minuto, a paso tranquilo
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace('.', ',')} km, ${min} min a pie`;
  const n = Math.max(1, Math.round(m / BLOCK_M));
  return `${n} ${n === 1 ? 'cuadra' : 'cuadras'}, ${min} min a pie`;
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

export interface WhyLine {
  icon: 'cash-outline' | 'star-outline' | 'walk-outline' | 'time-outline' | 'moon-outline';
  title: string;
  sub: string;
}

/**
 * «Por qué vale la pena» en la hoja de la oferta (3.48): solo hechos que la oferta trae, en este orden: el ahorro
 * frente a su precio habitual, la valoración de quienes fueron, qué tan cerca está y si está abierto. Una línea sin
 * dato no sale (nunca se rellena con frases de venta).
 */
export function whyWorthIt(o: MarketItem, now: number): WhyLine[] {
  const out: WhyLine[] = [];
  const save = savingPesos(o);
  if (save > 0 && typeof o.reference_price === 'number') {
    const pct = Math.round((save / o.reference_price) * 100);
    out.push({ icon: 'cash-outline', title: `Ahorras ${pesos(save)} (${pct} %)`, sub: `Su precio habitual es ${pesos(o.reference_price)}` });
  }
  if (typeof o.rating === 'number' && o.rating > 0) {
    out.push({ icon: 'star-outline', title: `${o.rating.toFixed(1).replace('.', ',')} de 5 en reseñas`, sub: 'De quienes ya fueron' });
  }
  const near = blocksLabel(o.distance_meters);
  if (near) {
    const m = o.distance_meters as number;
    out.push({ icon: 'walk-outline', title: `Está ${near} de ti`, sub: m <= 1000 ? 'Puedes ir a pie' : 'En tu ciudad' });
  }
  const left = Date.parse(o.ends_at) - now;
  const leftText = left > 0 ? (left < 3_600_000 ? `La oferta termina en ${Math.ceil(left / 60_000)} min` : 'La oferta sigue vigente') : 'La oferta terminó';
  if (o.open_now === true) out.push({ icon: 'time-outline', title: 'Abierto ahora', sub: leftText });
  else if (o.open_now === false) out.push({ icon: 'moon-outline', title: 'Cerrado ahora', sub: `${leftText}; puedes reclamarla y canjearla cuando abra` });
  return out;
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
