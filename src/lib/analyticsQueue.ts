// Cola de eventos de uso (E1). Sin React ni red para poder probarla con Node: guarda los eventos hasta
// enviarlos en lotes, con tope de memoria y un solo reintento por evento.

export interface QueuedEvent {
  name: string;
  entity_id?: string;
  props?: Record<string, string | number | boolean>;
}

interface Entry {
  event: QueuedEvent;
  attempts: number;
}

/** Eventos por petición (el servidor acepta hasta 20). */
export const BATCH_SIZE = 20;
/** Tope de la cola: si la red falla mucho, los más viejos se descartan. */
export const MAX_QUEUE = 100;
/** Cuántas veces se intenta enviar un evento antes de descartarlo. */
export const MAX_ATTEMPTS = 2;

export function createQueue() {
  let items: Entry[] = [];
  return {
    push(event: QueuedEvent) {
      items.push({ event, attempts: 0 });
      if (items.length > MAX_QUEUE) items = items.slice(items.length - MAX_QUEUE);
    },
    size: () => items.length,
    clear() {
      items = [];
    },
    /** Saca hasta `n` eventos para enviarlos. */
    take(n = BATCH_SIZE): Entry[] {
      return items.splice(0, n);
    },
    /** Devuelve al frente de la cola los de un envío fallido; los que ya se intentaron dos veces se descartan. */
    requeue(failed: Entry[]) {
      const again = failed.map((e) => ({ ...e, attempts: e.attempts + 1 })).filter((e) => e.attempts < MAX_ATTEMPTS);
      items = [...again, ...items].slice(0, MAX_QUEUE);
    },
  };
}

/** Identificador anónimo de instalación: letras, números y guiones, de 16 a 64 caracteres. */
export function makeAnonId(now: number, rand: () => number = Math.random): string {
  const part = () => Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0');
  return `${now.toString(36)}-${part()}${part()}`;
}

export const ANON_ID_RE = /^[A-Za-z0-9-]{16,64}$/;
