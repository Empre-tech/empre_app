/**
 * «Para ti» del inicio (3.59): como mucho 3 recomendaciones, por reglas fijas (sin IA). Cada una dice por qué sale y
 * lleva directo a lo importante. Ningún negocio paga por salir aquí.
 */

/** Sin mayúsculas ni tildes (la misma regla de searchHabits; repetida aquí para que este archivo no dependa de otro). */
function habitKey(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

export type ParaTiKind = 'offer' | 'service' | 'business';

export interface ParaTiCandidate {
  /** Única entre todos los candidatos («offer:<id>», «service:<id>», «business:<id>»). */
  key: string;
  kind: ParaTiKind;
  /** Id de la oferta, del servicio o del negocio, según `kind`. */
  id: string;
  entityId: string;
  entityName: string;
  title: string;
  /** Categoría y subcategoría, para comparar con lo que buscas. */
  category: string;
  /** null = no se sabe (no se afirma nada); false = cerrado y no sale. */
  open: boolean | null;
  distanceM: number | null;
  /** Solo ofertas: cuándo termina (ISO). */
  endsAt?: string;
  /** «HH:MM» o «24h». */
  closesAt?: string;
  /** Popular por canjes confirmados. */
  trending?: boolean;
  rating?: number;
}

export interface ParaTiContext {
  now: number;
  /** Lo que más buscas (ver searchHabits), de más a menos. */
  topTerms: string[];
  /** Negocios donde ya te atendieron («Lo de siempre»). */
  usualEntityIds: string[];
  /** Palabras de lo típico a esta hora (las de «Para esta hora»). */
  hourWords: string[];
  /** Lo que ya está en «Lo tuyo»: no se recomienda otra vez. */
  busyEntityIds: string[];
  busyOfferIds: string[];
}

export type ParaTiSignal = 'search' | 'usual' | 'hour' | 'near' | 'ends' | 'popular';

export interface ParaTiPick {
  candidate: ParaTiCandidate;
  score: number;
  /** La señal que más sumó: de ella sale el motivo que ves. */
  top: ParaTiSignal;
  /** Qué búsqueda coincidió, si fue por búsqueda. */
  term?: string;
  why: string;
  proof: string;
  cta: string;
}

const POINTS: Record<ParaTiSignal, number> = { search: 3, usual: 2, hour: 2, near: 1.5, ends: 1, popular: 1 };
/** Sin ninguna señal fuerte no se recomienda nada: mejor un espacio menos que uno de relleno. */
export const MIN_SCORE = 1.5;
const WALK_M_PER_MIN = 80;

export function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / WALK_M_PER_MIN));
}

function words(s: string): string[] {
  return habitKey(s)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4);
}

/** ¿La búsqueda aparece en el título, la categoría o el nombre? Compara raíces de 5 letras («barberia» ~ «barbero»). */
export function matches(term: string, c: Pick<ParaTiCandidate, 'title' | 'category' | 'entityName'>): boolean {
  const hay = words(`${c.title} ${c.category} ${c.entityName}`);
  const want = words(term);
  if (!want.length) return false;
  return want.some((w) => hay.some((h) => h.slice(0, 5) === w.slice(0, 5)));
}

function endsSoon(c: ParaTiCandidate, now: number): boolean {
  if (c.kind !== 'offer' || !c.endsAt) return false;
  const ms = Date.parse(c.endsAt) - now;
  return ms > 0 && ms <= 3 * 60 * 60 * 1000;
}

function untilText(closes?: string): string | null {
  if (!closes) return null;
  if (closes === '24h') return 'abierto 24 horas';
  const m = closes.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return `abierto hasta las ${h % 12 || 12}${m[2] === '00' ? '' : `:${m[2]}`} ${h < 12 ? 'am' : 'pm'}`;
}

function endsText(endsAt: string, now: number): string {
  const min = Math.ceil((Date.parse(endsAt) - now) / 60000);
  return min < 60 ? `Termina en ${min} min` : `Termina en ${Math.floor(min / 60)} h`;
}

function score(c: ParaTiCandidate, ctx: ParaTiContext): { score: number; top: ParaTiSignal; term?: string } {
  const got: { s: ParaTiSignal; p: number; term?: string }[] = [];
  const term = ctx.topTerms.find((t) => matches(t, c));
  if (term) got.push({ s: 'search', p: POINTS.search, term });
  if (ctx.usualEntityIds.includes(c.entityId)) got.push({ s: 'usual', p: POINTS.usual });
  if (ctx.hourWords.some((w) => matches(w, c))) got.push({ s: 'hour', p: POINTS.hour });
  if (c.distanceM !== null && c.distanceM <= 5 * WALK_M_PER_MIN) got.push({ s: 'near', p: POINTS.near });
  if (endsSoon(c, ctx.now)) got.push({ s: 'ends', p: POINTS.ends });
  if (c.trending) got.push({ s: 'popular', p: POINTS.popular });
  const total = got.reduce((a, g) => a + g.p, 0);
  const best = [...got].sort((a, b) => b.p - a.p)[0];
  return { score: total, top: best?.s ?? 'near', term: best?.s === 'search' ? best.term : undefined };
}

function whyText(top: ParaTiSignal, c: ParaTiCandidate, now: number, term?: string): string {
  switch (top) {
    case 'search':
      return `Porque buscas ${habitKey(term ?? '')}`;
    case 'usual':
      return 'Lo de siempre';
    case 'hour':
      return 'Para esta hora';
    case 'ends':
      return c.endsAt ? endsText(c.endsAt, now) : 'Termina pronto';
    case 'popular':
      return 'Lo más pedido en tu zona';
    case 'near':
    default:
      return c.distanceM !== null ? `A ${walkMinutes(c.distanceM)} min a pie` : 'Cerca de ti';
  }
}

function proofText(c: ParaTiCandidate): string {
  return [
    c.entityName,
    c.distanceM !== null ? `a ${walkMinutes(c.distanceM)} min` : null,
    c.rating && c.rating > 0 ? `★ ${c.rating.toFixed(1).replace('.', ',')}` : null,
    c.open ? untilText(c.closesAt) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const CTA: Record<ParaTiKind, string> = { offer: 'Ver la oferta', service: 'Ver el servicio', business: 'Ver el negocio' };

/**
 * Elige hasta `max` recomendaciones. Fuera: lo cerrado, ofertas terminadas, lo que ya está en «Lo tuyo» y lo que no
 * llega al mínimo. Un solo espacio por negocio y uno por tipo (oferta, servicio, negocio).
 */
export function pickParaTi(cands: ParaTiCandidate[], ctx: ParaTiContext, max = 3): ParaTiPick[] {
  const scored = cands
    .filter((c) => c.open !== false)
    .filter((c) => !(c.kind === 'offer' && c.endsAt && !(Date.parse(c.endsAt) > ctx.now)))
    .filter((c) => !ctx.busyEntityIds.includes(c.entityId) && !(c.kind === 'offer' && ctx.busyOfferIds.includes(c.id)))
    .map((c) => ({ c, ...score(c, ctx) }))
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || (a.c.distanceM ?? Infinity) - (b.c.distanceM ?? Infinity));

  const out: ParaTiPick[] = [];
  const entities = new Set<string>();
  const kinds = new Set<ParaTiKind>();
  for (const x of scored) {
    if (out.length >= max) break;
    if (entities.has(x.c.entityId) || kinds.has(x.c.kind)) continue;
    entities.add(x.c.entityId);
    kinds.add(x.c.kind);
    out.push({ candidate: x.c, score: x.score, top: x.top, term: x.term, why: whyText(x.top, x.c, ctx.now, x.term), proof: proofText(x.c), cta: CTA[x.c.kind] });
  }
  return out;
}
