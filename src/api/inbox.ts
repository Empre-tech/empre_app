import { request } from './client';

/** Lo pendiente del usuario (3.37): conversaciones sin leer y, por negocio propio, solicitudes de cita por revisar. */
export interface InboxBusiness {
  entity_id: string;
  name: string;
  unread_conversations: number;
  pending_requests: number;
}

export interface InboxSummary {
  personal_unread: number;
  businesses: InboxBusiness[] | null;
}

export const inboxApi = {
  summary: () => request<InboxSummary>('/api/users/me/inbox-summary'),
};
