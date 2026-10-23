import * as FileSystem from 'expo-file-system/legacy';
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ApiError } from '@/api/client';
import { ledgerApi, type ExpenseInput, type PartyInput, type PaymentInput, type SaleInput } from '@/api/ledger';
import {
  cancelPending, enqueue, flushOrder, isRetryable, markFailed, removeItem, restoreOutbox, retryFailed,
  type OutboxItem, type OutboxKind,
} from '@/lib/ledger';

/**
 * La cola de registros de «Mi negocio». Cada venta, gasto, cliente o abono se guarda primero en el teléfono (en un
 * archivo) y se envía cuando hay señal; el client_id evita que un reenvío lo duplique. Vive fuera de React: el envío
 * sigue aunque se cierre la pantalla. Si el servidor rechaza un registro queda marcado «no se pudo enviar» con su motivo.
 */

interface State {
  items: OutboxItem[];
  flushing: boolean;
}

const FILE = `${FileSystem.documentDirectory ?? ''}ledger-outbox.json`;

let state: State = { items: [], flushing: false };
const listeners = new Set<() => void>();
let queryClient: QueryClient | null = null;

function set(next: Partial<State>) {
  const prev = state.items;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  if (next.items && next.items !== prev) void persist();
}

async function persist() {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(state.items));
  } catch {
    // Si no se puede guardar el archivo, el envío sigue igual desde la memoria.
  }
}

/** Conecta la cola con la caché de datos y recupera lo que quedó sin enviar. Se llama una vez al abrir la app. */
export async function initLedgerOutbox(qc: QueryClient) {
  queryClient = qc;
  if (FileSystem.documentDirectory) {
    try {
      const info = await FileSystem.getInfoAsync(FILE);
      if (info.exists) {
        const saved = restoreOutbox(JSON.parse(await FileSystem.readAsStringAsync(FILE)));
        const fresh = saved.filter((s) => !state.items.some((x) => x.id === s.id));
        if (fresh.length) set({ items: [...state.items, ...fresh] });
      }
    } catch {
      // Un archivo dañado no debe impedir abrir la app.
    }
  }
  void flushLedger();
}

function push(kind: OutboxKind, entityId: string, id: string, payload: object) {
  set({ items: enqueue(state.items, { id, entityId, kind, payload: payload as Record<string, unknown> }) });
  void flushLedger();
}

export const queueSale = (entityId: string, input: SaleInput) => push('sale', entityId, input.client_id, input);
export const queueExpense = (entityId: string, input: ExpenseInput) => push('expense', entityId, input.client_id, input);
export const queueParty = (entityId: string, input: PartyInput) => push('party', entityId, input.client_id, input);
export const queuePayment = (entityId: string, input: PaymentInput) => push('payment', entityId, input.client_id, input);

/**
 * Deshacer / anular un registro. Si todavía no salió del teléfono, simplemente se quita de la cola; si ya salió, se
 * anula en el servidor (el id de una venta o un gasto es su client_id).
 */
export function queueVoid(kind: 'sale' | 'expense', entityId: string, clientId: string, reason: string) {
  const removed = cancelPending(state.items, clientId);
  if (removed) {
    set({ items: removed });
    return;
  }
  push(kind === 'sale' ? 'void_sale' : 'void_expense', entityId, `void:${clientId}`, { id: clientId, reason });
}

export function retryLedgerItem(id: string) {
  set({ items: retryFailed(state.items, id) });
  void flushLedger();
}

export function discardLedgerItem(id: string) {
  set({ items: removeItem(state.items, id) });
}

async function send(item: OutboxItem): Promise<void> {
  const p = item.payload as never;
  const id = item.entityId;
  switch (item.kind) {
    case 'party':
      await ledgerApi.createParty(id, p);
      return;
    case 'sale':
      await ledgerApi.createSale(id, p);
      return;
    case 'expense':
      await ledgerApi.createExpense(id, p);
      return;
    case 'payment':
      await ledgerApi.createPayment(id, p);
      return;
    case 'void_sale': {
      const v = item.payload as { id: string; reason: string };
      await ledgerApi.voidSale(id, v.id, v.reason);
      return;
    }
    case 'void_expense': {
      const v = item.payload as { id: string; reason: string };
      await ledgerApi.voidExpense(id, v.id, v.reason);
      return;
    }
  }
}

let again = false;

/** Envía lo pendiente, en orden. Si no hay señal se detiene y lo deja para después. Nunca lanza. */
export async function flushLedger(): Promise<void> {
  if (state.flushing) {
    again = true; // llegó algo nuevo mientras se enviaba: otra vuelta al terminar
    return;
  }
  set({ flushing: true });
  const touched = new Set<string>();
  try {
    do {
      again = false;
      for (const item of flushOrder(state.items)) {
        try {
          await send(item);
          touched.add(item.entityId);
          set({ items: removeItem(state.items, item.id) });
        } catch (error) {
          const status = error instanceof ApiError ? error.status : 0;
          if (isRetryable(status)) return; // sin señal o servidor caído: se reintenta luego
          const msg = error instanceof Error ? error.message : 'No se pudo enviar';
          set({ items: markFailed(state.items, item.id, msg) });
          touched.add(item.entityId);
        }
      }
    } while (again);
  } finally {
    set({ flushing: false });
    touched.forEach((entityId) => void queryClient?.invalidateQueries({ queryKey: ['ledger', entityId] }));
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const snapshot = () => state;

/** Lo pendiente de enviar, para dibujar el aviso «N sin enviar» y sumarlo al resumen. */
export function useLedgerOutbox(): State {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
