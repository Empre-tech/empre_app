// «Pregúntale» (CONVERSACIONES_Y_AGENDA.md, fase 1): preguntas según los datos del negocio y respuestas que salen SOLO
// de lo que publicó (catálogo, horario, ofertas, disponibilidad del día y agenda). Nunca inventa un precio, una hora ni
// una oferta: si el dato no está, lo dice y ofrece escribirle al negocio. Sin React para probarlo con Node.
//
// Las respuestas se arman en el teléfono con los datos que el perfil ya cargó: no hay otra consulta ni otro endpoint.

export type Intent = 'services' | 'duration' | 'price' | 'hours' | 'offers' | 'availability' | 'book' | 'delivery' | 'custom' | 'unknown';

/**
 * Lo que el dueño le enseñó a Empre AI (3.62, F3). Con `intent` completa o corrige esa respuesta; sin `intent` es una
 * pregunta propia del negocio («¿Atienden niños?») y se reconoce por `keywords`.
 */
export interface TaughtAnswer {
  id: string;
  intent: string;
  question: string;
  keywords: string[];
  answer: string;
}

export interface AnswerService {
  id: string;
  name: string;
  description?: string;
  section?: string;
  price: number | null;
  price_from: boolean;
  duration_min?: number | null;
  bookable?: boolean;
}

export interface AnswerOffer {
  id: string;
  title: string;
  conditions?: string;
  ends_at: string;
  items?: { name: string; service_item_id?: string }[];
}

export interface AnswerHour {
  weekday: number;
  closed: boolean;
  is_24h: boolean;
  open_time: string;
  close_time: string;
}

export interface AnswerData {
  name: string;
  /** Sustantivo del catálogo según la categoría («Carta», «Servicios»). */
  noun: string;
  services: AnswerService[];
  offers: AnswerOffer[];
  hours: AnswerHour[];
  isOpenNow: boolean | null;
  /** Disponibilidad del día publicada por el negocio («Mesas disponibles»), vigente; null si no hay. */
  availability: string | null;
  serviceMode: 'in_place' | 'delivery' | 'both' | '';
  /** La agenda del negocio está encendida (y la app la muestra). */
  agendaOn: boolean;
  /** Lo que el dueño enseñó (3.62, F3); vacío si no enseñó nada. */
  taught?: TaughtAnswer[];
}

export type Block =
  | { kind: 'text'; title: string; body?: string }
  | { kind: 'services'; title: string; items: AnswerService[]; more: number }
  | { kind: 'offer'; title: string; conditions?: string; endsAt: string; appliesTo?: string }
  | { kind: 'choose'; title: string; options: { id: string; label: string }[] }
  | { kind: 'missing'; title: string; body: string };

export type Action =
  | { kind: 'see_slots'; serviceId?: string; label: string }
  | { kind: 'message'; label: string; draft: string }
  | { kind: 'open_offer'; offerId: string; label: string };

export interface Answer {
  intent: Intent;
  blocks: Block[];
  actions: Action[];
  /** De dónde sale el dato («Según su carta»), para que se vea que no lo inventamos. */
  source?: string;
  /** No había con qué responder: se ofrece escribirle y cuenta como «pregunta sin respuesta». */
  unanswered: boolean;
}

const plain = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** «$25.000» */
const pesos = (n: number) => '$' + n.toLocaleString('es-CO').replace(/,/g, '.');
export const priceLabel = (s: Pick<AnswerService, 'price' | 'price_from'>) => (s.price === null || s.price === undefined ? null : `${s.price_from ? 'Desde ' : ''}${pesos(s.price)}`);

/** «9:00 a. m.» */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suf = h >= 12 && h < 24 ? 'p. m.' : 'a. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suf}`;
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** El horario de un día en palabras, o null si no lo publicó. */
export function dayHours(hours: AnswerHour[], weekday: number): string | null {
  const d = hours.find((h) => h.weekday === weekday);
  if (!d) return null;
  if (d.closed) return 'cerrado';
  if (d.is_24h) return 'abierto las 24 horas';
  if (!d.open_time || !d.close_time) return null;
  return `de ${clock(d.open_time)} a ${clock(d.close_time)}`;
}

/** Lo que exige cada intención para poder ofrecerse como pregunta. */
function canAnswer(intent: Intent, d: AnswerData): boolean {
  if (taughtFor(d, intent)) return true;
  switch (intent) {
    case 'services':
      return d.services.length > 0;
    case 'duration':
      return d.services.some((s) => (s.duration_min ?? 0) > 0);
    case 'price':
      return d.services.some((s) => s.price !== null && s.price !== undefined);
    case 'hours':
      return d.hours.length > 0;
    case 'offers':
      return d.offers.length > 0;
    case 'availability':
      return d.agendaOn || d.availability !== null || d.hours.length > 0;
    case 'book':
      return d.agendaOn && d.services.some((s) => s.bookable && (s.duration_min ?? 0) > 0);
    case 'delivery':
      return d.serviceMode !== '';
    default:
      return false;
  }
}

/** Texto de cada pregunta sugerida, según el sustantivo del catálogo. */
export function questionLabel(intent: Intent, noun: string): string {
  const n = noun.toLocaleLowerCase('es');
  switch (intent) {
    case 'services':
      return noun === 'Carta' ? '¿Qué tienen en la carta?' : `¿Qué ${n} tienen?`;
    case 'duration':
      return '¿Cuánto se demora?';
    case 'price':
      return '¿Cuánto cuesta?';
    case 'hours':
      return '¿Hasta qué hora atienden?';
    case 'offers':
      return '¿Hay alguna oferta?';
    case 'availability':
      return '¿Tienen disponibilidad hoy?';
    case 'book':
      return '¿Puedo reservar?';
    case 'delivery':
      return '¿Hacen domicilio?';
    default:
      return '';
  }
}

/**
 * Preguntas sugeridas: solo las que se pueden responder con lo publicado, primero las que ayudan a decidir (reservar,
 * ofertas, disponibilidad) y sin repetir las ya hechas. `max` es lo que se ve sin «Más preguntas».
 */
export function suggestQuestions(d: AnswerData, asked: ReadonlySet<Intent> = new Set(), max = 4): { intent: Intent; label: string }[] {
  const order: Intent[] = ['book', 'offers', 'availability', 'services', 'duration', 'price', 'hours', 'delivery'];
  return order
    .filter((i) => canAnswer(i, d) && !asked.has(i))
    .slice(0, max)
    .map((i) => ({ intent: i, label: questionLabel(i, d.noun) }));
}

/** Las preguntas que suelen venir después de una respuesta. */
export function followUps(d: AnswerData, last: Intent, asked: ReadonlySet<Intent>, max = 3): { intent: Intent; label: string }[] {
  const next: Record<Intent, Intent[]> = {
    services: ['book', 'duration', 'offers'],
    duration: ['book', 'price', 'offers'],
    price: ['offers', 'book', 'duration'],
    hours: ['availability', 'book', 'services'],
    offers: ['book', 'services', 'hours'],
    availability: ['book', 'hours', 'offers'],
    book: ['offers', 'hours'],
    delivery: ['services', 'hours'],
    custom: ['services', 'hours', 'offers'],
    unknown: ['services', 'hours', 'offers'],
  };
  const seen = new Set<Intent>();
  return [...next[last], 'services', 'hours', 'offers', 'book', 'availability', 'duration', 'price', 'delivery']
    .filter((i) => {
      if (seen.has(i as Intent)) return false;
      seen.add(i as Intent);
      return canAnswer(i as Intent, d) && !asked.has(i as Intent) && i !== last;
    })
    .slice(0, max)
    .map((i) => ({ intent: i as Intent, label: questionLabel(i as Intent, d.noun) }));
}

const WORDS: [Intent, RegExp][] = [
  ['book', /\b(reserv\w*|agend\w*|cita|turno|apart\w*)\b/],
  ['duration', /\b(dura\w*|demora\w*|tarda\w*|cuanto tiempo)\b/],
  ['offers', /\b(oferta\w*|promo\w*|descuento\w*|rebaja\w*)\b/],
  ['price', /\b(cuesta|cuestan|vale|valen|precio\w*|cobran|tarifa\w*)\b/],
  ['delivery', /\b(domicilio\w*|envio\w*|envian|llevan|delivery)\b/],
  ['availability', /\b(disponib\w*|cupo\w*|espacio\w*|mesa\w*|hay campo|atienden hoy|tienen hoy)\b/],
  ['hours', /\b(horario\w*|abren|abre|cierran|cierra|hasta que hora|a que hora|abierto\w*)\b/],
  ['services', /\b(servicio\w*|que tienen|que hacen|carta|menu|producto\w*|catalogo|que venden|ofrecen)\b/],
];

/** Servicios del catálogo que el texto nombra (todas las palabras largas del nombre aparecen en el texto). */
export function mentionedServices(text: string, services: AnswerService[]): AnswerService[] {
  const t = ` ${plain(text)} `;
  return services.filter((s) => {
    const words = plain(s.name)
      .split(' ')
      .filter((w) => w.length > 3);
    return words.length > 0 && words.every((w) => t.includes(w.slice(0, Math.max(4, w.length - 1))));
  });
}

/** La respuesta que enseñó el dueño para una intención, si la hay. */
const taughtFor = (d: AnswerData, intent: Intent) => (intent === 'custom' || intent === 'unknown' ? undefined : (d.taught ?? []).find((t) => t.intent === intent));

/**
 * ¿El texto coincide con una pregunta propia que enseñó el dueño? Compara raíces de 5 letras y pide que aparezca al
 * menos la mitad de sus palabras clave (y siempre una).
 */
export function matchTaught(text: string, taught: TaughtAnswer[] = []): TaughtAnswer | undefined {
  const words = plain(text).split(' ').filter((w) => w.length >= 4);
  const has = (k: string) => words.some((w) => w.slice(0, 5) === plain(k).slice(0, 5));
  let best: { t: TaughtAnswer; hits: number } | undefined;
  for (const t of taught) {
    if (t.intent || !t.keywords.length) continue;
    const hits = t.keywords.filter(has).length;
    if (hits >= Math.max(1, Math.ceil(t.keywords.length / 2)) && (!best || hits > best.hits)) best = { t, hits };
  }
  return best?.t;
}

/**
 * La intención de un texto libre. Si nombra un servicio sin decir qué quiere saber, se entiende como «ese servicio».
 * Las preguntas propias que enseñó el dueño (`taught`) se reconocen antes que un servicio suelto.
 */
export function detectIntent(text: string, services: AnswerService[], taught?: TaughtAnswer[]): { intent: Intent; services: AnswerService[]; taughtId?: string } {
  const t = ` ${plain(text)} `;
  const named = mentionedServices(text, services);
  const hit = WORDS.find(([, re]) => re.test(t));
  if (hit) return { intent: hit[0], services: named };
  const own = matchTaught(text, taught);
  if (own) return { intent: 'custom', services: [], taughtId: own.id };
  if (named.length) return { intent: 'price', services: named };
  return { intent: 'unknown', services: [] };
}

/** «Hola, ¿atienden niños?»: la primera letra en minúscula, aunque la pregunta empiece con «¿» o «¡». */
const draftFor = (_d: AnswerData, question: string) => {
  const q = question.trim();
  const i = q.search(/[^¿¡\s]/);
  return i < 0 ? `Hola, ${q}` : `Hola, ${q.slice(0, i)}${q.charAt(i).toLocaleLowerCase('es')}${q.slice(i + 1)}`;
};

function missing(d: AnswerData, intent: Intent, what: string, question: string): Answer {
  return {
    intent,
    unanswered: true,
    blocks: [{ kind: 'missing', title: 'No tengo ese dato', body: `${d.name} no publicó ${what}. Puedes preguntarle; tu pregunta va ya escrita.` }],
    actions: [{ kind: 'message', label: `Escribir a ${d.name}`, draft: draftFor(d, question) }],
  };
}

/** Solo ofertas que siguen vigentes en `now`: una vencida nunca se presenta como vigente. */
const liveOffers = (d: AnswerData, now: number) => d.offers.filter((o) => Date.parse(o.ends_at) > now);
const offersFor = (d: AnswerData, now: number, s?: AnswerService) =>
  s ? liveOffers(d, now).filter((o) => (o.items ?? []).some((it) => (it.service_item_id ? it.service_item_id === s.id : plain(it.name) === plain(s.name)))) : liveOffers(d, now);

/**
 * La respuesta a una intención. `serviceId` acota a un servicio; `text` es lo que escribió la persona (para el
 * borrador si hay que escribirle al negocio). `weekday` es el día de hoy (0 = domingo) y `now` la hora actual en ms.
 */
export function answer(d: AnswerData, intent: Intent, opts: { serviceId?: string; taughtId?: string; text?: string; weekday: number; now: number }): Answer {
  // Una pregunta propia del negocio: se responde con lo que enseñó el dueño, tal cual.
  if (intent === 'custom') {
    const own = (d.taught ?? []).find((t) => t.id === opts.taughtId);
    if (!own) return missing(d, 'unknown', 'esa información', opts.text?.trim() || '¿me ayudas con una pregunta?');
    return { intent, unanswered: false, source: `Respuesta de ${d.name}`, blocks: [{ kind: 'text', title: own.answer }], actions: [] };
  }
  const base = baseAnswer(d, intent, opts);
  const own = taughtFor(d, intent);
  if (!own) return base;
  // El dueño enseñó algo sobre esto: si no había dato, su respuesta lo reemplaza; si había, se suma al final.
  if (base.unanswered) return { intent, unanswered: false, source: `Respuesta de ${d.name}`, blocks: [{ kind: 'text', title: own.answer }], actions: [] };
  return { ...base, blocks: [...base.blocks, { kind: 'text', title: `Además, ${d.name} dice:`, body: own.answer }] };
}

function baseAnswer(d: AnswerData, intent: Intent, opts: { serviceId?: string; text?: string; weekday: number; now: number }): Answer {
  const svc = opts.serviceId ? d.services.find((s) => s.id === opts.serviceId) : undefined;
  const question = opts.text?.trim() || questionLabel(intent, d.noun) || '¿me ayudas con una pregunta?';
  const bookable = d.agendaOn ? d.services.filter((s) => s.bookable && (s.duration_min ?? 0) > 0) : [];

  switch (intent) {
    case 'services': {
      if (!d.services.length) return missing(d, intent, `su ${d.noun.toLocaleLowerCase('es')}`, question);
      const top = d.services.slice(0, 5);
      return {
        intent,
        unanswered: false,
        source: `Según su ${d.noun.toLocaleLowerCase('es')}`,
        blocks: [{ kind: 'services', title: `${d.services.length} en su ${d.noun.toLocaleLowerCase('es')}`, items: top, more: d.services.length - top.length }],
        actions: bookable.length ? [{ kind: 'see_slots', label: 'Ver horas libres' }] : [{ kind: 'message', label: `Escribir a ${d.name}`, draft: draftFor(d, question) }],
      };
    }
    case 'duration':
    case 'price': {
      const field = intent === 'duration' ? 'la duración' : 'el precio';
      const has = (s: AnswerService) => (intent === 'duration' ? (s.duration_min ?? 0) > 0 : s.price !== null && s.price !== undefined);
      if (svc) {
        if (!has(svc)) return missing(d, intent, `${field} de ${svc.name}`, question);
        const parts = [svc.duration_min ? `${svc.duration_min} min` : null, priceLabel(svc)].filter(Boolean).join(' · ');
        const offer = offersFor(d, opts.now, svc)[0];
        return {
          intent,
          unanswered: false,
          source: intent === 'price' ? 'Precio habitual según su lista' : 'Según su lista',
          blocks: [{ kind: 'text', title: `${svc.name}: ${parts}` }, ...(offer ? [{ kind: 'offer' as const, title: offer.title, conditions: offer.conditions, endsAt: offer.ends_at, appliesTo: svc.name }] : [])],
          actions: svc.bookable && d.agendaOn ? [{ kind: 'see_slots', serviceId: svc.id, label: 'Ver horas libres' }] : [{ kind: 'message', label: `Escribir a ${d.name}`, draft: draftFor(d, question) }],
        };
      }
      const withData = d.services.filter(has);
      if (!withData.length) return missing(d, intent, field, question);
      if (withData.length === 1) return baseAnswer(d, intent, { ...opts, serviceId: withData[0].id });
      return {
        intent,
        unanswered: false,
        source: 'Según su lista',
        blocks: [{ kind: 'choose', title: '¿De cuál?', options: withData.slice(0, 6).map((s) => ({ id: s.id, label: s.name })) }],
        actions: [],
      };
    }
    case 'hours': {
      const today = dayHours(d.hours, opts.weekday);
      if (!today) return missing(d, intent, 'su horario', question);
      const tomorrow = dayHours(d.hours, (opts.weekday + 1) % 7);
      return {
        intent,
        unanswered: false,
        source: 'Según su horario publicado',
        blocks: [{ kind: 'text', title: `Hoy: ${today}`, body: [d.isOpenNow === true ? 'Ahora está abierto.' : d.isOpenNow === false ? 'Ahora está cerrado.' : '', tomorrow ? `Mañana (${DAYS[(opts.weekday + 1) % 7]}): ${tomorrow}${tomorrow.endsWith('.') ? '' : '.'}` : ''].filter(Boolean).join(' ') }],
        actions: [],
      };
    }
    case 'offers': {
      const list = offersFor(d, opts.now, svc);
      if (!list.length) {
        return { intent, unanswered: false, blocks: [{ kind: 'text', title: svc ? `Ahora no hay ofertas para ${svc.name}` : 'Ahora no hay ofertas', body: 'Si sigues al negocio, te enteras cuando publique una.' }], actions: [] };
      }
      const o = list[0];
      return {
        intent,
        unanswered: false,
        source: 'Oferta vigente publicada por el negocio',
        blocks: [{ kind: 'offer', title: o.title, conditions: o.conditions, endsAt: o.ends_at, appliesTo: o.items?.map((i) => i.name).join(', ') || undefined }],
        actions: [{ kind: 'open_offer', offerId: o.id, label: 'Ver la oferta' }],
      };
    }
    case 'availability': {
      if (d.agendaOn && bookable.length) {
        return { intent, unanswered: false, source: 'Horas libres reales de su agenda', blocks: [{ kind: 'text', title: 'Tiene agenda en Empre', body: 'Puedes ver sus horas libres de hoy y de los próximos días.' }], actions: [{ kind: 'see_slots', label: 'Ver horas libres' }] };
      }
      if (d.availability) {
        return { intent, unanswered: false, source: 'Lo que el negocio marcó hoy', blocks: [{ kind: 'text', title: d.availability }], actions: [{ kind: 'message', label: `Escribir a ${d.name}`, draft: draftFor(d, question) }] };
      }
      const today = dayHours(d.hours, opts.weekday);
      if (today) {
        return {
          intent,
          unanswered: false,
          source: 'Según su horario habitual (no es un cupo confirmado)',
          blocks: [{ kind: 'text', title: d.isOpenNow ? `Ahora está abierto (hoy ${today})` : `Hoy: ${today}`, body: 'Para saber si tienen cupo ahora, pregúntale.' }],
          actions: [{ kind: 'message', label: `Escribir a ${d.name}`, draft: draftFor(d, question) }],
        };
      }
      return missing(d, intent, 'su disponibilidad', question);
    }
    case 'book': {
      if (!bookable.length) {
        return { intent, unanswered: false, blocks: [{ kind: 'text', title: `${d.name} no recibe reservas por Empre`, body: 'Puedes escribirle para acordar una hora.' }], actions: [{ kind: 'message', label: `Escribir a ${d.name}`, draft: draftFor(d, question) }] };
      }
      const target = svc && bookable.find((s) => s.id === svc.id);
      if (target || bookable.length === 1) {
        const s = target ?? bookable[0];
        return { intent, unanswered: false, source: 'Horas libres reales de su agenda', blocks: [{ kind: 'text', title: `${s.name} · ${s.duration_min} min`, body: priceLabel(s) ? `${priceLabel(s)} precio habitual` : undefined }], actions: [{ kind: 'see_slots', serviceId: s.id, label: 'Ver horas libres' }] };
      }
      return { intent, unanswered: false, source: 'Solo los que el negocio marcó como reservables', blocks: [{ kind: 'choose', title: '¿Para qué servicio?', options: bookable.map((s) => ({ id: s.id, label: `${s.name} · ${s.duration_min} min` })) }], actions: [] };
    }
    case 'delivery': {
      if (d.serviceMode === '') return missing(d, intent, 'si hace domicilios', question);
      const text = d.serviceMode === 'delivery' ? 'Atiende a domicilio' : d.serviceMode === 'both' ? 'Atiende en el local y a domicilio' : 'Atiende solo en el local';
      return { intent, unanswered: false, source: 'Según su perfil', blocks: [{ kind: 'text', title: text }], actions: d.serviceMode === 'in_place' ? [] : [{ kind: 'message', label: `Pedir a ${d.name}`, draft: draftFor(d, question) }] };
    }
    default:
      return missing(d, 'unknown', 'esa información', question);
  }
}
