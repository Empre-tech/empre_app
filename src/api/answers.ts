import type { TaughtAnswer } from '@/lib/answers';
import { request } from './client';

/** Una pregunta que Empre AI no supo responder (3.62, F3): la ve el dueño para enseñarle. */
export interface UnansweredQuestion {
  message_id: string;
  user_id: string;
  text: string;
  at: string;
}

/** Lo que el dueño le enseña a Empre AI, el interruptor y «suele responder en» (3.62, F3). */
export const answersApi = {
  /** Público: lo que enseñó el negocio y si apagó las respuestas de Empre AI en su chat. */
  list: (entityId: string) => request<{ data: TaughtAnswer[] | null; ai_chat_off: boolean }>(`/api/entities/${entityId}/answers`, { auth: false }),
  upsert: (entityId: string, body: { id?: string; intent: string; question: string; answer: string }) =>
    request<TaughtAnswer>(`/api/entities/${entityId}/answers`, { method: 'PUT', body }),
  remove: (entityId: string, answerId: string) => request<void>(`/api/entities/${entityId}/answers/${answerId}`, { method: 'DELETE' }),
  unanswered: (entityId: string) => request<{ data: UnansweredQuestion[] | null }>(`/api/entities/${entityId}/answers/unanswered`),
  setChatOff: (entityId: string, off: boolean) => request<{ ai_chat_off: boolean }>(`/api/entities/${entityId}/answers/chat`, { method: 'PATCH', body: { off } }),
  /** Público: mediana en minutos de la primera respuesta del negocio; null si no hay suficientes conversaciones. */
  replyTime: (entityId: string) => request<{ minutes: number | null }>(`/api/entities/${entityId}/reply-time`, { auth: false }),
};

/** «15 min», «2 h»: lo que tarda en responder, redondeado como lo diría una persona. */
export function replyLabel(minutes: number): string {
  if (minutes < 60) return `${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  const h = Math.round(minutes / 60);
  return h >= 24 ? 'más de un día' : `${h} h`;
}
