// Números de los avisos (3.37, avisos_negocio.html). Una sola fuente para la barra, Mensajes y el perfil, así nunca
// se contradicen. Sin React para probarlo con Node.

import type { InboxSummary } from '@/api/inbox';

export interface InboxCounts {
  personal: number;
  business: number;
  /** Conversaciones sin leer en total (personales + de mis negocios). */
  messages: number;
  /** Solicitudes de cita por revisar en todos mis negocios. */
  requests: number;
  byEntity: Map<string, { unread: number; requests: number }>;
}

export function inboxCounts(s: InboxSummary | null | undefined): InboxCounts {
  const byEntity = new Map<string, { unread: number; requests: number }>();
  let business = 0;
  let requests = 0;
  for (const b of s?.businesses ?? []) {
    byEntity.set(b.entity_id, { unread: b.unread_conversations, requests: b.pending_requests });
    business += b.unread_conversations;
    requests += b.pending_requests;
  }
  const personal = s?.personal_unread ?? 0;
  return { personal, business, messages: personal + business, requests, byEntity };
}

/** Lo que dice la insignia: nada en 0 y «9+» desde 10 (un número exacto grande no ayuda). */
export function badgeText(n: number): string | undefined {
  if (n <= 0) return undefined;
  return n > 9 ? '9+' : String(n);
}

/** «Mensajes, 3 conversaciones sin leer»: lo que lee el lector de pantalla en la pestaña. */
export function messagesA11y(n: number): string {
  if (n <= 0) return 'Mensajes';
  return `Mensajes, ${n} ${n === 1 ? 'conversación sin leer' : 'conversaciones sin leer'}`;
}

/** «2 por revisar» / «1 por revisar». */
export function requestsLabel(n: number): string {
  return `${n} por revisar`;
}
