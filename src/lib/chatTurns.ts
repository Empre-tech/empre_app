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
