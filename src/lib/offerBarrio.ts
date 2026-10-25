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
  /** 3.50: lo que cuesta el plan (ofertas a su precio especial más servicios a su precio de siempre). */
  total_price?: number;
  /** De ti a la primera parada (m); null sin ubicación. */
  distance_from_you?: number | null;
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

/** Por qué es esta ruta, en una línea: para qué momento, con qué regla y, si lleva un servicio, por qué entró. */
export function routeWhy(r: Pick<MarketRoute, 'level' | 'times'> & { stops?: Pick<MarketItem, 'kind' | 'entity_name' | 'rating'>[] }): string {
  const svc = (r.stops ?? []).find((s) => s.kind === 'service');
  const because = svc ? ` · ${svc.entity_name} entra por sus reseñas${svc.rating ? ` (★ ${svc.rating.toFixed(1).replace('.', ',')})` : ''}` : '';
  if (r.level === 'day') return `Nada cerca de ti: un plan por momentos, cada uno abierto a esa hora${because}`;
  const first = r.times.find((t): t is string => Boolean(t));
  if (!first) return `Abiertos ahora; revisa el horario de cada uno${because}`;
  const m = momentOf(first);
  return `Para ${m === 'noche' ? 'esta noche' : m === 'tarde' ? 'esta tarde' : 'esta mañana'} · abiertos a esa hora${because}`;
}

// ---------------------------------------------------------------------------
// 3.50 · Qué es «cerca», servicios, lo que cuesta el plan y la agenda
// ---------------------------------------------------------------------------

const km = (m: number) => `${(m / 1000).toFixed(1).replace('.', ',')} km`;

/** De ti a la ruta: «A 300 m de ti», «A 4,3 km de ti»; null sin ubicación. */
export function fromYouLabel(m: number | null | undefined): string | null {
  if (m === null || m === undefined || m < 0) return null;
  return m < 1000 ? `A ${Math.max(50, Math.round(m / 50) * 50)} m de ti` : `A ${km(m)} de ti`;
}

/** El radio de reclamo de una oferta, como lo dice la parada: «a menos de 500 m del negocio». */
export function radiusLabel(m: number | undefined): string {
  if (!m) return 'en el negocio';
  return `a menos de ${m < 1000 ? `${m} m` : km(m).replace(',0', '')} del negocio`;
}

export type Claimability = 'here' | 'arrive' | 'unknown' | 'service';

/**
 * Si una parada se puede reclamar desde donde estás: dentro del radio del negocio, «here»; fuera, «arrive» (se reclama
 * al llegar); sin tu ubicación, «unknown» (lo decide el servidor al reclamar). Un servicio no se reclama.
 */
export function claimability(o: Pick<MarketItem, 'kind' | 'radius_meters' | 'latitude' | 'longitude'>, you: { latitude: number; longitude: number } | null): Claimability {
  if (o.kind === 'service') return 'service';
  if (!you) return 'unknown';
  const r = o.radius_meters ?? 0;
  if (!r) return 'here';
  const d = metersBetween(you, o);
  if (d < 0) return 'unknown';
  return d <= r ? 'here' : 'arrive';
}

/** Lo que dice el botón de la ruta: solo promete lo que se puede cumplir desde aquí. */
export function claimCta(now: number, later: number, done: number): string {
  if (now === 0 && later === 0) return done ? `Listo: ver mis ${done} boletos` : 'Nada que reclamar';
  if (later === 0) return now === 1 ? 'Reclamar la oferta' : `Reclamar las ${now}`;
  if (now === 0) return later === 1 ? 'Se reclama al llegar' : `Las ${later} se reclaman al llegar`;
  return `Reclamar ${now} ahora · ${later} al llegar`;
}

/** El precio de una parada en la tarjeta: «precio de siempre» o «desde $20.000» para un servicio. */
export function servicePriceLabel(o: Pick<MarketItem, 'service_price' | 'price_from'>): string {
  if (typeof o.service_price !== 'number') return 'precio de siempre';
  return o.price_from ? `desde ${pesos(o.service_price)}` : `${pesos(o.service_price)} · precio de siempre`;
}

/** «$104.000 en total · ahorras $35.000»; null si no se sabe el total. */
export function totalLine(r: Pick<MarketRoute, 'total_price' | 'saving'>): { total: string; saving: string | null } | null {
  if (!r.total_price) return null;
  return { total: `${pesos(r.total_price)} en total`, saving: r.saving > 0 ? `ahorras ${pesos(r.saving)}` : null };
}

const MIN = 60_000;

/** Minutos del día (Colombia) de una hora ISO. */
function minuteOfDay(iso: string): number {
  const d = bogota(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** ¿La parada sigue abierta a esa hora? Según `open_until` de hoy («02:00» = pasada la medianoche). Sin dato, sí. */
export function openAtTime(o: Pick<MarketItem, 'open_until'>, iso: string): boolean {
  const u = o.open_until ?? '';
  if (!u || u === '24h') return true;
  const [h, m] = u.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return true;
  let close = h * 60 + m;
  if (close < 6 * 60) close += 24 * 60; // cierra de madrugada
  return minuteOfDay(iso) < close;
}

/**
 * Al pedir otra hora para la parada `k`, las siguientes se reacomodan solas: cada una a la hora anterior más la
 * duración del servicio anterior (o 30 min si no se sabe) más el tramo a pie (80 m por minuto, redondeado a 5 min).
 * Devuelve las horas nuevas y la primera parada que deja de estar abierta a su hora (null si todas sirven).
 */
export function reflowTimes(stops: Pick<MarketItem, 'duration_min' | 'latitude' | 'longitude' | 'open_until'>[], times: (string | null)[], k: number, chosen: string): { times: (string | null)[]; closed: number | null } {
  const out = [...times];
  out[k] = chosen;
  let prev = Date.parse(chosen);
  let closed: number | null = null;
  for (let i = k + 1; i < stops.length; i++) {
    const walk = metersBetween(stops[i - 1], stops[i]);
    const walkMin = walk < 0 ? 0 : Math.ceil((Math.ceil(walk / 80) + 1) / 5) * 5;
    prev += ((stops[i - 1].duration_min ?? 30) + walkMin) * MIN;
    out[i] = new Date(prev).toISOString();
    if (closed === null && !openAtTime(stops[i], out[i] as string)) closed = i;
  }
  return { times: out, closed };
}

/** Una ruta guardada, en lo que el aviso necesita (la forma de `SavedRoute`, sin depender del almacenamiento). */
export interface SavedRouteLike {
  key: string;
  title: string;
  route: Pick<MarketRoute, 'stops'>;
  claimed: string[];
  dismissed: string[];
}

/**
 * El aviso «Llegaste a…» (3.50): la primera parada pendiente de una ruta guardada (una oferta aún vigente, sin
 * reclamar ni descartada) que ya se puede reclamar desde donde estás. null si no hay ninguna.
 */
export function pendingArrival<R extends SavedRouteLike>(routes: R[], you: { latitude: number; longitude: number } | null, now: number): { route: R; stop: MarketItem } | null {
  if (!you) return null;
  for (const r of routes) {
    for (const s of r.route.stops) {
      if (s.kind === 'service' || r.claimed.includes(s.id) || r.dismissed.includes(s.id) || !(Date.parse(s.ends_at) > now)) continue;
      if (claimability(s, you) === 'here') return { route: r, stop: s };
    }
  }
  return null;
}

/** «YYYY-MM-DD» del día de Colombia de una hora (para pedir las horas libres de la agenda). */
export function bogotaDay(iso: string): string {
  return bogota(iso).toISOString().slice(0, 10);
}

/** La hora libre que mejor encaja con la ruta: la primera que no es antes de la sugerida; si no, la más cercana. */
export function bestSlot(slots: string[], suggested: string | null): string | null {
  if (!slots.length) return null;
  if (!suggested) return slots[0];
  const s = Date.parse(suggested);
  const after = slots.find((x) => Date.parse(x) >= s);
  if (after) return after;
  return [...slots].sort((a, b) => Math.abs(Date.parse(a) - s) - Math.abs(Date.parse(b) - s))[0];
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
