/**
 * El recorrido de la conversación (3.68): un mensaje con varias preguntas recibe UNA respuesta que las contesta en
 * orden, y las respuestas automáticas seguidas se ven como una sola burbuja. Sin React para probarlo con Node.
 */

const plain = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const GREETING = /^(hola|holi|buenas|buenos dias|buen dia|buenas tardes|buenas noches|que tal|saludos)( (senor|senora|don|dona|vecino|vecina))?$/;

/**
 * Las preguntas de un mensaje, en orden: se corta en cada «?» y en cada punto, y se quitan los saludos sueltos
 * («Hola,»). Sin cortes claros, el mensaje entero es una sola pregunta.
 */
export function splitQuestions(text: string): string[] {
  const parts = text
    .split(/(?<=\?)|(?<=[.!])\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    // «Hola, ¿hoy tienen…?»: el saludo pegado al comienzo no es una pregunta.
    .map((p) => p.replace(/^(hola|buenas( tardes| noches)?|buenos d[ií]as|buen d[ií]a)[,!.\s]+/i, '').trim())
    .filter((p) => p && !GREETING.test(plain(p)) && plain(p).length > 2);
  return parts.length ? parts : [text.trim()];
}

/** «Hola», «Buenas tardes», «Hola!»: un saludo sin pregunta. Empre AI lo contesta con un saludo, no con un aviso. */
export function isGreetingOnly(text: string): boolean {
  const p = plain(text);
  return p.length > 0 && GREETING.test(p);
}

type TailMsg = { id: string; sender_id: string; sent_by_entity: boolean; kind?: string; content: string; created_at: string; reply_to_id?: string; ai_unanswered?: boolean };

/**
 * Lo que el cliente escribió desde que el negocio contestó por última vez y nadie ha respondido, de lo más viejo a lo
 * más nuevo. Sirve para que Empre AI responda también lo que llegó desde otra pantalla («Pregúntales a varios», una
 * oferta). `messages` viene del más nuevo al más viejo; solo cuenta lo de las últimas `maxAgeMs`.
 * - Una pregunta ya respondida por Empre AI (una respuesta la nombra en `reply_to_id`) o que Empre AI ya no supo
 *   (`ai_unanswered`) no vuelve a salir: abrir el chat otra vez no repite nada (3.71).
 * - Una respuesta vieja de Empre AI sin `reply_to_id` cuenta como respuesta a todo lo anterior.
 */
export function unansweredTail<M extends TailMsg>(messages: M[], meId: string, now: number, maxAgeMs = 24 * 60 * 60 * 1000): M[] {
  const answered = new Set(messages.filter((m) => m.kind === 'ai_answer' && m.reply_to_id).map((m) => m.reply_to_id as string));
  const out: M[] = [];
  for (const m of messages) {
    if (m.kind === 'ai_answer') {
      if (!m.reply_to_id) break;
      continue;
    }
    if (m.sent_by_entity || m.sender_id !== meId) break;
    if (now - Date.parse(m.created_at) > maxAgeMs) break;
    if (m.kind && m.kind !== 'text') continue;
    if (answered.has(m.id) || m.ai_unanswered) continue;
    if (m.content.trim()) out.push(m);
  }
  return out.reverse();
}

/**
 * La conversación en orden (la más nueva primero, como la lista invertida): cada respuesta de Empre AI va justo
 * debajo de la pregunta que nombra en `reply_to_id`, aunque se haya guardado después (3.71). Lo demás, por su hora.
 */
export function timelineOrder<R extends { id: string; created_at: string; reply_to_id?: string }>(rows: R[]): R[] {
  const at = new Map(rows.map((r) => [r.id, Date.parse(r.created_at)]));
  const key = (r: R) => {
    const q = r.reply_to_id ? at.get(r.reply_to_id) : undefined;
    return q !== undefined ? q + 1 : Date.parse(r.created_at);
  };
  return [...rows].sort((a, b) => key(b) - key(a) || Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** El aviso cuando Empre AI no tiene el dato: dice cuándo puede contestar el negocio si se sabe. */
export function waitNotice(who: string, online: boolean, opening: { text: string; tone: 'open' | 'closed' } | null): string {
  if (online) return `Esto lo responde ${who}, que está en línea.`;
  if (opening?.tone === 'closed' && opening.text.startsWith('Cerrado · abre ')) {
    const when = opening.text.slice('Cerrado · abre '.length);
    return `Esto lo responde ${who}. Abre ${when}; te avisamos cuando conteste.`;
  }
  return `Esto lo responde ${who}. Te avisamos cuando conteste.`;
}

/** Lo que se necesita saber de cada fila de la conversación (la más nueva primero, como la lista invertida). */
export interface TurnRow {
  id: string;
  created_at: string;
  /** Es una respuesta automática de Empre AI. */
  ai: boolean;
}

export interface AiGroups {
  /** La fila que dibuja la burbuja de cada grupo (la más nueva) → las del grupo, de la más vieja a la más nueva. */
  lead: Map<string, string[]>;
  /** Filas que no se dibujan porque ya van dentro de la burbuja de su grupo. */
  hidden: Set<string>;
  /** La primera respuesta automática de la conversación: debajo va, una sola vez, «también le llegó al negocio». */
  first: string | null;
}

/** Respuestas automáticas seguidas (sin nada en medio y a menos de 2 min) se ven como una sola. */
export function groupAiAnswers(rows: TurnRow[], gapMs = 120_000): AiGroups {
  const lead = new Map<string, string[]>();
  const hidden = new Set<string>();
  let first: string | null = null;
  let run: TurnRow[] = [];
  const close = () => {
    if (!run.length) return;
    const ids = run.map((r) => r.id).reverse();
    lead.set(run[0].id, ids);
    for (const r of run.slice(1)) hidden.add(r.id);
    run = [];
  };
  for (const r of rows) {
    if (!r.ai) {
      close();
      continue;
    }
    const prev = run[run.length - 1];
    if (prev && Math.abs(Date.parse(prev.created_at) - Date.parse(r.created_at)) > gapMs) close();
    run.push(r);
    first = r.id;
  }
  close();
  return { lead, hidden, first };
}
