// La voz de Empre AI en el chat con un negocio (tablero «El chat con el negocio, con la voz de Empre AI», 3.70):
// una frase que responde y, debajo, una tarjeta solo si hay algo para ver o tocar. Sin React para probarlo con Node.

import type { Answer, Block, Intent } from './answers.ts';

/** La frase: `a` normal, `b` en negrita (el dato), `c` normal. */
export interface Lead {
  a: string;
  b: string;
  c: string;
}

export interface Voiced {
  lead: Lead;
  /** Una línea suave bajo la frase (lo que antes era el cuerpo del bloque). */
  note: string | null;
  /** Lo que va en la tarjeta (lista de la carta, oferta, elegir). Vacío = solo la frase. */
  card: Block[];
}

const money = (n: number) => `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const dot = (s: string) => (/[.!?:]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** Convierte la respuesta armada con lo publicado en frase + tarjeta. Nunca agrega datos que no estén en ella. */
export function voice(answer: Answer): Voiced {
  const [first, ...rest] = answer.blocks;
  if (!first) return { lead: { a: '', b: '', c: '' }, note: null, card: [] };
  switch (first.kind) {
    case 'services': {
      const prices = first.items.map((s) => s.price).filter((p): p is number => typeof p === 'number' && p > 0);
      const range = prices.length >= 2 && Math.min(...prices) !== Math.max(...prices) ? `, de ${money(Math.min(...prices))} a ${money(Math.max(...prices))}` : '';
      return { lead: { a: `Tienen ${first.title}${range}.`, b: '', c: '' }, note: null, card: [first, ...rest] };
    }
    case 'text': {
      if (first.plain) return { lead: { a: first.title.trim(), b: '', c: '' }, note: first.body ?? null, card: rest };
      // «Corte clásico: $20.000 · 30 min»: lo de antes de los dos puntos en normal y el dato en negrita.
      const i = first.title.indexOf(': ');
      const lead = i > 0 && i < first.title.length - 2 ? { a: `${first.title.slice(0, i)}: `, b: first.title.slice(i + 2).replace(/\.$/, ''), c: '.' } : { a: dot(first.title), b: '', c: '' };
      return { lead, note: first.body ?? null, card: rest };
    }
    case 'offer':
      return { lead: { a: 'Sí, tiene una oferta: ', b: first.title, c: '.' }, note: null, card: [first, ...rest] };
    case 'choose':
      return { lead: { a: first.title, b: '', c: '' }, note: null, card: [first, ...rest] };
    case 'missing':
      return { lead: { a: dot(first.title), b: '', c: '' }, note: first.body, card: rest };
  }
}

/** Qué entendió, para el paso «Entendí: …» mientras piensa. */
export function understoodLabel(intent: Intent | string, noun: string, service?: string): string {
  const n = noun.toLocaleLowerCase('es');
  switch (intent) {
    case 'services':
      return service ? `Entendí: si tienen ${service.toLocaleLowerCase('es')}` : `Entendí: lo que hay en su ${n}`;
    case 'price':
      return 'Entendí: cuánto cuesta';
    case 'duration':
      return 'Entendí: cuánto demora';
    case 'hours':
      return 'Entendí: su horario';
    case 'availability':
      return 'Entendí: si atienden hoy';
    case 'book':
      return 'Entendí: quieres una cita';
    case 'delivery':
      return 'Entendí: si hacen domicilio';
    case 'offers':
      return 'Entendí: si tiene ofertas';
    case 'custom':
      return 'Entendí tu pregunta';
    default:
      return 'Leyendo tu mensaje';
  }
}

/** El segundo paso: dónde buscó. */
export function lookedLabel(intent: Intent | string, noun: string): string {
  const n = noun.toLocaleLowerCase('es');
  if (intent === 'services' || intent === 'price' || intent === 'duration') return `Revisé su ${n}`;
  if (intent === 'hours' || intent === 'availability') return 'Revisé su horario de la semana';
  if (intent === 'book') return 'Revisé su agenda';
  if (intent === 'offers') return 'Revisé sus ofertas activas';
  if (intent === 'delivery') return 'Revisé cómo atiende';
  return 'Revisé lo que publicó';
}

/** Mientras busca, en presente: «Revisando su carta…». */
export function lookingLabel(intent: Intent | string, noun: string): string {
  return `${lookedLabel(intent, noun).replace(/^Revisé/, 'Revisando')}…`;
}

/** Cuántas palabras tiene la frase (para escribirla palabra por palabra). */
export function wordCount(parts: { t: string }[]): number {
  return parts.reduce((n, p) => n + (p.t.match(/\S+/g)?.length ?? 0), 0);
}

/** La frase hasta la palabra `n`, conservando qué va en negrita. */
export function sliceWords<P extends { t: string }>(parts: P[], n: number): P[] {
  const out: P[] = [];
  let left = n;
  for (const p of parts) {
    if (left <= 0) break;
    const tokens = p.t.split(/(\s+)/);
    let text = '';
    for (const tok of tokens) {
      if (!tok) continue;
      if (/^\s+$/.test(tok)) {
        text += tok;
        continue;
      }
      if (left <= 0) break;
      text += tok;
      left -= 1;
    }
    out.push({ ...p, t: left <= 0 ? text.trimEnd() : text });
  }
  return out;
}

/** De dónde salió la respuesta, en una línea: «Según su carta» + «Según su perfil» → «De su carta y su perfil». */
export function sourceLine(sources: string[], businessName: string): string {
  const parts = [...new Set(sources.map((s) => s.replace(/\s*\(.*\)$/, '').trim()).filter(Boolean))];
  if (!parts.length) return `De lo que publicó ${businessName}`;
  const own = parts.map((s) => (/^Según /.test(s) ? s.replace(/^Según /, '') : null));
  if (own.every(Boolean)) {
    const list = own as string[];
    return `De ${list.length > 1 ? `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}` : list[0]}`;
  }
  return parts[0];
}
