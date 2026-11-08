/**
 * Cuándo responde Empre AI en el chat (3.62, F1). Sin React para probarlo con Node.
 *
 * Reglas:
 * - Solo responde si reconoció la pregunta y el negocio publicó el dato. Si no, no adivina: muestra que el negocio aún
 *   no responde.
 * - Si el dueño ya contestó después de la pregunta, Empre AI no dice nada.
 * - Con el dueño en línea espera `WAIT_ONLINE_MS` por si contesta él; desconectado, responde al instante.
 * - Cada intención se responde una sola vez por conversación abierta (no repite el horario tres veces).
 */

export const WAIT_ONLINE_MS = 45_000;

export type AutoAnswerStep = 'answer' | 'wait' | 'status' | 'skip';

export function autoAnswerStep(input: {
  /** La respuesta tiene datos del negocio (no es «no tengo ese dato» ni una pregunta no reconocida). */
  answerable: boolean;
  intent: string;
  ownerOnline: boolean;
  /** El dueño escribió después de la pregunta. */
  ownerReplied: boolean;
  /** Milisegundos desde la pregunta. */
  elapsedMs: number;
  /** Intenciones que Empre AI ya respondió en esta conversación. */
  answered: ReadonlySet<string>;
}): AutoAnswerStep {
  if (input.ownerReplied) return 'skip';
  if (!input.answerable) return 'status';
  if (input.answered.has(input.intent)) return 'skip';
  if (input.ownerOnline && input.elapsedMs < WAIT_ONLINE_MS) return 'wait';
  return 'answer';
}

/** Dentro del chat no tiene sentido «Escribir al negocio»: ya le estás escribiendo. */
export function chatActions<A extends { kind: string }>(actions: A[]): A[] {
  return actions.filter((a) => a.kind !== 'message');
}

/** ¿El dueño escribió después de `sinceIso`? */
export function ownerRepliedSince(messages: { sent_by_entity: boolean; created_at: string }[], sinceIso: string): boolean {
  const since = Date.parse(sinceIso);
  return messages.some((m) => m.sent_by_entity && Date.parse(m.created_at) > since);
}
