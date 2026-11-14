/**
 * «Pregúntales a los N» (3.64): una pregunta a varios negocios cercanos que ofrecen lo mismo, respondida con
 * plantillas sobre lo que cada uno publicó en la Vitrina (precio, duración, si atiende ahora y su oferta). Nada de IA
 * aquí: la intención llega ya resuelta (tocada, por reglas o, como último recurso, clasificada en el servidor una sola
 * vez). Si un negocio no publicó el dato, se dice y se ofrece preguntarle al dueño. Sin React para probarlo con Node.
 */
import type { Intent } from './answers';
import type { MarketItem } from './offerMarket';

export type ManyIntent = 'price' | 'open' | 'offers' | 'duration';

/** El negocio de la ficha y hasta 3 más: lo que cabe en una pantalla sin desplazarse. */
export const MANY_MAX = 4;

export interface ManyRow {
  entityId: string;
  name: string;
  item: MarketItem;
  open: boolean | null;
  dist: string | null;
  priceNum: number | null;
  price: string | null;
  minutes: number | null;
  offer: string | null;
  openUntil: string | null;
}

export interface ManyLine {
  row: ManyRow;
  /** El dato que responde la pregunta; null si el negocio no lo publicó. */
  main: string | null;
  sub: string;
  known: boolean;
}

export interface ManyAnswer {
  intent: ManyIntent | 'unknown';
  /** Frase corta: `lead` + `bold` (lo importante) + `tail`. */
  summary: { lead: string; bold: string; tail: string };
  top: ManyLine | null;
  topTag: string;
  rest: ManyLine[];
  /** Los que no publicaron el dato: a ellos se les puede preguntar por chat. */
  missing: ManyRow[];
}

const plain = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set(['para', 'con', 'sin', 'del', 'los', 'las', 'una', 'uno', 'por']);

/** Raíces de 5 letras de las palabras que importan («Cortes clásicos» y «Corte clásico» dan lo mismo). */
function roots(t: string): string[] {
  return [...new Set(plain(t).split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5)))];
}

/** Mismo producto: las mismas palabras que importan, en cualquier orden. */
export function sameItem(a: string, b: string): boolean {
  const ra = roots(a);
  const rb = roots(b);
  return ra.length > 0 && ra.length === rb.length && ra.every((r) => rb.includes(r));
}

const openRank = (o: boolean | null) => (o === true ? 0 : o === null ? 1 : 2);

/** Abiertos primero y luego los más cerca. Nadie paga por subir. */
export function orderRows<T extends Pick<ManyRow, 'open' | 'item'>>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => openRank(x.r.open) - openRank(y.r.open) || (x.r.item.distance_meters ?? Infinity) - (y.r.item.distance_meters ?? Infinity) || x.i - y.i)
    .map((x) => x.r);
}

/**
 * Los negocios que ofrecen lo mismo que `item`: él primero y hasta `max - 1` más de la Vitrina cargada, uno por
 * negocio. Solo productos y servicios del catálogo (una oferta es de un solo negocio).
 */
export function sameItemPeers(item: MarketItem, pool: MarketItem[], max = MANY_MAX): MarketItem[] {
  if (item.kind !== 'service') return [item];
  const seen = new Set([item.entity_id]);
  const others: MarketItem[] = [];
  for (const it of pool) {
    if (it.kind !== 'service' || seen.has(it.entity_id) || !sameItem(item.title, it.title)) continue;
    seen.add(it.entity_id);
    others.push(it);
  }
  const ordered = orderRows(others.map((o) => ({ item: o, open: o.open_now ?? null }))).map((x) => x.item);
  return [item, ...ordered.slice(0, max - 1)];
}

/** «$25.000» */
export const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');

function distLabel(m: number | null | undefined): string | null {
  if (m === null || m === undefined || m < 0) return null;
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Lo que la Vitrina ya sabe de ese negocio para ese producto. Nada más. */
export function toRow(it: MarketItem): ManyRow {
  const n = it.service_price ?? null;
  return {
    entityId: it.entity_id,
    name: it.entity_name,
    item: it,
    open: it.open_now ?? null,
    dist: distLabel(it.distance_meters),
    priceNum: n,
    price: n === null ? null : n === 0 ? 'Gratis' : `${it.price_from ? 'Desde ' : ''}${pesos(n)}`,
    minutes: it.duration_min && it.duration_min > 0 ? it.duration_min : null,
    offer: it.linked_offer_title?.trim() || null,
    openUntil: it.open_until?.trim() || null,
  };
}

/** De una intención del motor de reglas a una que se puede responder para varios; null si no aplica. */
export function manyIntentOf(intent: Intent | string): ManyIntent | null {
  switch (intent) {
    case 'price':
    case 'services':
    case 'book':
      return 'price';
    case 'hours':
    case 'availability':
      return 'open';
    case 'offers':
      return 'offers';
    case 'duration':
      return 'duration';
    default:
      return null;
  }
}

export const MANY_LABEL: Record<ManyIntent, { ask: string; short: string }> = {
  price: { ask: '¿Cuánto cuesta en cada uno?', short: 'Precio en cada uno' },
  open: { ask: '¿Quién atiende ahora?', short: 'Quién atiende ahora' },
  offers: { ask: '¿Alguno tiene oferta?', short: 'Si alguno tiene oferta' },
  duration: { ask: '¿Cuánto demora?', short: 'Cuánto demora' },
};

/** Las preguntas que vale la pena sugerir: solo las que al menos un negocio puede responder con lo publicado. */
export function manySuggestions(rows: ManyRow[]): ManyIntent[] {
  const out: ManyIntent[] = [];
  if (rows.some((r) => r.price)) out.push('price');
  if (rows.some((r) => r.open !== null)) out.push('open');
  out.push('offers');
  if (rows.some((r) => r.minutes)) out.push('duration');
  return out;
}

function lineFor(intent: ManyIntent, r: ManyRow): ManyLine {
  const tail = (xs: (string | null)[]) => xs.filter(Boolean).join(' · ');
  switch (intent) {
    case 'price':
      return { row: r, main: r.price, sub: tail([r.minutes ? `${r.minutes} min` : null, r.dist]), known: Boolean(r.price) };
    case 'duration':
      return { row: r, main: r.minutes ? `${r.minutes} min` : null, sub: tail([r.price, r.dist]), known: Boolean(r.minutes) };
    case 'open':
      return { row: r, main: r.open === null ? null : r.open ? 'Abierto' : 'Cerrado', sub: tail([r.price, r.dist]), known: r.open !== null };
    case 'offers':
      return { row: r, main: r.price, sub: tail([r.price ? 'precio normal' : null, r.dist]), known: true };
  }
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** La respuesta para todos: frase corta, la mejor opción ahora, los demás y a quiénes falta preguntarles. */
export function answerMany(intent: ManyIntent, input: ManyRow[], product: string): ManyAnswer {
  const rows = orderRows(input);
  const n = rows.length;
  let lines = rows.map((r) => lineFor(intent, r));
  if (intent === 'offers') lines = lines.filter((l) => l.row.offer);
  const known = lines.filter((l) => l.known);
  const missing = lines.filter((l) => !l.known).map((l) => l.row);

  let top: ManyLine | null = known.find((l) => l.row.open === true) ?? null;
  if (intent === 'duration') {
    const open = known.filter((l) => l.row.open === true);
    top = open.length ? open.reduce((a, b) => ((b.row.minutes ?? 0) < (a.row.minutes ?? 0) ? b : a)) : null;
  }
  if (intent === 'offers') top = known.find((l) => l.row.open === true) ?? known[0] ?? null;
  const topTag = intent === 'offers' ? 'CON OFERTA' : intent === 'duration' ? 'EL MÁS RÁPIDO ABIERTO' : top?.row.dist ? 'ABIERTO Y MÁS CERCA' : 'ABIERTO AHORA';
  const rest = lines.filter((l) => l !== top);

  const s = { lead: '', bold: '', tail: '' };
  const k = known.length;
  if (intent === 'price') {
    if (!k) s.lead = `Ninguno publicó el precio de ${product}. Se lo puedo preguntar a los dueños.`;
    else {
      const nums = known.map((l) => l.row.priceNum ?? 0);
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      const range = lo === hi ? `todos a ${pesos(lo)}` : `de ${pesos(lo)} a ${pesos(hi)}`;
      s.lead = k === 1 ? `Solo 1 de ${n} publicó su precio. ` : `${k} de ${n} publicaron su precio: ${range}. `;
      if (top) {
        s.lead += k === 1 ? '' : 'Abierto y más cerca: ';
        s.bold = `${top.row.name}, ${top.row.price}`;
        s.tail = '.';
      } else if (k === 1) {
        s.bold = `${known[0].row.name}, ${known[0].row.price}`;
        s.tail = '.';
      }
    }
  } else if (intent === 'open') {
    const openN = rows.filter((r) => r.open === true).length;
    if (!openN) s.lead = k ? `Ninguno atiende ahora según su horario.` : `No sé si atienden ahora: no publicaron su horario.`;
    else {
      s.lead = `${openN} ${plural(openN, 'atiende', 'atienden')} ahora. ${openN === 1 ? 'Es ' : 'El más cerca es '}`;
      s.bold = top?.row.name ?? '';
      s.tail = top?.row.openUntil ? `, abierto hasta las ${top.row.openUntil}.` : '.';
    }
  } else if (intent === 'offers') {
    if (!lines.length) s.lead = `Ninguno tiene una oferta publicada para ${product} ahora.`;
    else if (lines.length === 1) {
      s.lead = 'Solo ';
      s.bold = lines[0].row.name;
      s.tail = ` tiene oferta: ${lines[0].row.offer}. Su precio normal va aparte.`;
    } else {
      s.lead = `${lines.length} tienen oferta. ${top?.row.open ? 'La más cerca abierta: ' : 'La más cerca: '}`;
      s.bold = top?.row.name ?? '';
      s.tail = top ? `, ${top.row.offer}.` : '.';
    }
  } else {
    if (!k) s.lead = `Ninguno publicó cuánto demora. Se lo puedo preguntar a los dueños.`;
    else {
      const mins = known.map((l) => l.row.minutes ?? 0);
      const lo = Math.min(...mins);
      const hi = Math.max(...mins);
      s.lead = k === 1 ? `Solo 1 lo publicó: ${lo} min. ` : lo === hi ? `Todos tardan ${lo} min según lo publicado. ` : `Entre ${lo} y ${hi} min según lo publicado. `;
      if (top && k > 1) {
        s.lead += 'El más rápido abierto ahora: ';
        s.bold = `${top.row.name}, ${top.row.minutes} min`;
        s.tail = '.';
      }
    }
  }
  return { intent, summary: s, top, topTag, rest, missing };
}

/** Lo que no está en lo publicado: nadie lo adivina; se ofrece preguntarles a todos. */
export function unknownMany(rows: ManyRow[]): ManyAnswer {
  return {
    intent: 'unknown',
    summary: { lead: 'Eso no está en lo que publicaron. ', bold: 'Se lo puedo preguntar a los dueños', tail: ' por chat.' },
    top: null,
    topTag: '',
    rest: [],
    missing: orderRows(rows),
  };
}

/** El mensaje que le llega al dueño, ya escrito. */
export function askDraft(intent: ManyIntent | 'unknown', product: string, text?: string): string {
  switch (intent) {
    case 'price':
      return `Hola, ¿cuánto cuesta ${product}?`;
    case 'duration':
      return `Hola, ¿cuánto demora ${product}?`;
    case 'open':
      return `Hola, ¿están atendiendo ahora? Me interesa ${product}.`;
    case 'offers':
      return `Hola, ¿tienen alguna oferta en ${product}?`;
    default: {
      const q = (text ?? '').trim();
      if (!q) return `Hola, tengo una pregunta sobre ${product}.`;
      const i = q.search(/[^¿¡\s]/);
      const body = i < 0 ? q : `${q.slice(0, i)}${q.charAt(i).toLocaleLowerCase('es')}${q.slice(i + 1)}`;
      return `Hola, ${body} (sobre ${product})`;
    }
  }
}

/** Parecidos: las palabras del nombre más corto están en el otro y empiezan igual («Mojarra frita» ~ «Mojarra frita con patacón»). */
export function similarItem(a: string, b: string): boolean {
  const ra = roots(a);
  const rb = roots(b);
  if (!ra.length || !rb.length || ra[0] !== rb[0]) return false;
  const [short, long] = ra.length <= rb.length ? [ra, rb] : [rb, ra];
  return short.every((r) => long.includes(r));
}

export interface DecisionPoint {
  key: 'price' | 'near' | 'rated' | 'open' | 'only';
  /** El dato en una frase: «$4.000 más que en», con el nombre aparte para resaltarlo. */
  text: string;
  bold?: string;
  /** La otra opción, para verla en la misma hoja. */
  target?: MarketItem;
}

const priceOf = (it: MarketItem) => it.special_price ?? it.service_price ?? null;

/**
 * Puntos para decidir (hoja rápida de Ofertas): cómo queda este producto frente al mismo en otros negocios cerca.
 * Solo hechos que la Vitrina ya tiene (precio, distancia, reseñas, si abre); no favorece a nadie: si otro está más
 * barato, más cerca o mejor reseñado, lo dice, y si este gana, también.
 */
export function decisionPoints(item: MarketItem, pool: MarketItem[], max = 4): { peers: number; points: DecisionPoint[] } {
  const best = new Map<string, MarketItem>();
  for (const it of pool) {
    if (it.entity_id === item.entity_id || it.kind === 'offer' || !similarItem(item.title, it.title)) continue;
    const prev = best.get(it.entity_id);
    if (!prev || (priceOf(it) ?? Infinity) < (priceOf(prev) ?? Infinity)) best.set(it.entity_id, it);
  }
  const peers = [...best.values()];
  if (!peers.length) return { peers: 0, points: item.kind === 'offer' ? [] : [{ key: 'only', text: 'Cerca, solo este negocio lo tiene publicado' }] };
  const points: DecisionPoint[] = [];
  const mine = priceOf(item);
  const priced = peers.filter((p) => (priceOf(p) ?? 0) > 0).sort((a, b) => priceOf(a)! - priceOf(b)!);
  if (mine && priced.length) {
    const low = priced[0];
    const diff = mine - priceOf(low)!;
    if (diff > 0) points.push({ key: 'price', text: `${pesos(diff)} más que en`, bold: low.entity_name, target: low });
    else points.push({ key: 'price', text: `Es el precio más bajo de los ${peers.length + 1} cerca` });
  }
  const dist = (it: MarketItem) => it.distance_meters ?? Infinity;
  const nearer = [...peers].sort((a, b) => dist(a) - dist(b))[0];
  if (dist(nearer) + 100 < dist(item)) points.push({ key: 'near', text: `Más cerca, a ${distLabel(nearer.distance_meters) ?? '—'}:`, bold: nearer.entity_name, target: nearer });
  else if (dist(item) < Infinity) points.push({ key: 'near', text: 'Es el que tienes más cerca' });
  const rated = [...peers].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
  if ((rated.rating ?? 0) >= (item.rating ?? 0) + 0.3) points.push({ key: 'rated', text: `Mejor reseñado (★ ${(rated.rating ?? 0).toFixed(1).replace('.', ',')}):`, bold: rated.entity_name, target: rated });
  if (item.open_now === false) {
    const open = peers.find((p) => p.open_now);
    if (open) points.push({ key: 'open', text: 'Este está cerrado; abierto ahora:', bold: open.entity_name, target: open });
  }
  return { peers: peers.length, points: points.slice(0, max) };
}

export interface BestPrice {
  item: MarketItem;
  /** Cuántos negocios cerca lo tienen (con este). */
  count: number;
  min: number;
  max: number;
  /** Dónde quedan los otros precios en la franja, de 0 a 1. */
  others: number[];
}

/**
 * Mejor precio cerca: el mismo producto o servicio en varios negocios del catálogo cargado; sale el más barato de
 * cada grupo, con la franja de los demás precios. Solo con dos negocios o más (si no, no hay con qué comparar).
 */
export function bestPrices(pool: MarketItem[], max = 6): BestPrice[] {
  const priced = pool.filter((it) => it.kind !== 'offer' && (priceOf(it) ?? 0) > 0);
  const used = new Set<string>();
  const out: BestPrice[] = [];
  for (const it of priced) {
    if (used.has(it.id)) continue;
    const perBiz = new Map<string, MarketItem>();
    for (const o of priced) {
      if (used.has(o.id) || !similarItem(it.title, o.title)) continue;
      const prev = perBiz.get(o.entity_id);
      if (!prev || priceOf(o)! < priceOf(prev)!) perBiz.set(o.entity_id, o);
    }
    const group = [...perBiz.values()];
    group.forEach((g) => used.add(g.id));
    used.add(it.id);
    if (group.length < 2) continue;
    group.sort((a, b) => priceOf(a)! - priceOf(b)!);
    const lo = priceOf(group[0])!;
    const hi = priceOf(group[group.length - 1])!;
    if (hi <= lo) continue;
    out.push({ item: group[0], count: group.length, min: lo, max: hi, others: group.slice(1).map((g) => (priceOf(g)! - lo) / (hi - lo)) });
  }
  const photos = new Set<string>();
  return out
    .sort((a, b) => b.count - a.count || (b.max - b.min) / b.max - (a.max - a.min) / a.max)
    .filter((b) => (b.item.photo ? (photos.has(b.item.photo) ? false : (photos.add(b.item.photo), true)) : true))
    .slice(0, max);
}
