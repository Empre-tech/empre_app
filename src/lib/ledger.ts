// Lógica pura del módulo «Mi negocio» (sin React ni red, para probarla con Node): formato de pesos, entrada de
// montos, identificadores del dispositivo y la cola de registros sin enviar.

export type PayMethod = 'cash' | 'transfer' | 'card' | 'credit';

export const MAX_AMOUNT = 100_000_000;

/** «$25.000». Sin Intl: así sale igual en todos los teléfonos. */
export function formatPesos(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  const sign = v < 0 ? '-' : '';
  const digits = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}$${digits}`;
}

/** Lo que el dueño escribe en un campo de monto: deja solo cifras (acepta «25.000» o «$ 25000»). 0 si no hay nada. */
export function parseAmountInput(text: string): number {
  const digits = text.replace(/\D/g, '').slice(0, 9);
  if (!digits) return 0;
  return Math.min(MAX_AMOUNT, parseInt(digits, 10));
}

/** El monto tal como se muestra mientras se escribe: «25.000» (sin el signo). */
export function amountField(n: number): string {
  return n > 0 ? formatPesos(n).slice(1) : '';
}

/** UUID v4 generado en el teléfono. Es la llave que evita duplicar un registro al reenviarlo. */
export function newClientId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  credit: 'Fiado',
};

export const EXPENSE_CATEGORIES: { key: string; label: string }[] = [
  { key: 'mercancia', label: 'Mercancía' },
  { key: 'arriendo', label: 'Arriendo' },
  { key: 'servicios', label: 'Servicios' },
  { key: 'nomina', label: 'Nómina' },
  { key: 'transporte', label: 'Transporte' },
  { key: 'impuestos', label: 'Impuestos' },
  { key: 'mantenimiento', label: 'Mantenimiento' },
  { key: 'publicidad', label: 'Publicidad' },
  { key: 'otro', label: 'Otro' },
];

export function categoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? 'Otro';
}

/** «+12 % frente a ayer» / «−5 % …». null si no hay con qué comparar. */
export function changeText(current: number, previous: number, versus: string): string | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `Igual que ${versus}`;
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} % frente a ${versus}`;
}

// ---------------------------------------------------------------------------
// Cola de registros sin enviar (modo sin conexión)
// ---------------------------------------------------------------------------

export type OutboxKind =
  | 'party'
  | 'sale'
  | 'expense'
  | 'payment'
  | 'void_sale'
  | 'void_expense'
  | 'tab_open'
  | 'tab_add'
  | 'tab_remove'
  | 'tab_pay'
  | 'tab_cancel';

export interface OutboxItem {
  /** Para ventas, gastos, terceros y abonos es el client_id; para anulaciones, un id propio. */
  id: string;
  entityId: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  createdAt: number;
  /** pending = por enviar; failed = el servidor lo rechazó (no se reintenta solo). */
  status: 'pending' | 'failed';
  error?: string;
}

export function enqueue(list: OutboxItem[], item: Omit<OutboxItem, 'status' | 'createdAt'> & { createdAt?: number }): OutboxItem[] {
  if (list.some((x) => x.id === item.id)) return list; // mismo client_id: ya está en la cola
  return [...list, { ...item, createdAt: item.createdAt ?? Date.now(), status: 'pending' }];
}

export function removeItem(list: OutboxItem[], id: string): OutboxItem[] {
  return list.filter((x) => x.id !== id);
}

export function markFailed(list: OutboxItem[], id: string, error: string): OutboxItem[] {
  return list.map((x) => (x.id === id ? { ...x, status: 'failed' as const, error } : x));
}

export function retryFailed(list: OutboxItem[], id: string): OutboxItem[] {
  return list.map((x) => (x.id === id ? { ...x, status: 'pending' as const, error: undefined } : x));
}

// Las cuentas abiertas: abrir antes que agregar, agregar y quitar antes que cobrar o cancelar (y, dentro de cada
// grupo, en el orden en que se hizo).
const ORDER: Record<OutboxKind, number> = {
  party: 0,
  sale: 1,
  expense: 1,
  tab_open: 1,
  payment: 2,
  tab_add: 2,
  tab_remove: 2,
  void_sale: 3,
  void_expense: 3,
  tab_pay: 3,
  tab_cancel: 3,
};

/** En qué orden enviar: primero los terceros (una venta fiada los necesita), luego ventas y gastos, luego abonos y
 * anulaciones; dentro de cada grupo, por antigüedad. */
export function flushOrder(list: OutboxItem[]): OutboxItem[] {
  return list
    .filter((x) => x.status === 'pending')
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.createdAt - b.createdAt);
}

export interface PendingTotals {
  count: number;
  failed: number;
  sales: number;
  expenses: number;
}

/** Lo que falta por enviar de un negocio, para sumarlo al resumen del servidor mientras no hay señal. */
export function pendingTotals(list: OutboxItem[], entityId: string): PendingTotals {
  const t: PendingTotals = { count: 0, failed: 0, sales: 0, expenses: 0 };
  for (const x of list) {
    if (x.entityId !== entityId) continue;
    if (x.status === 'failed') {
      t.failed++;
      continue;
    }
    t.count++;
    if (x.kind === 'sale') t.sales += Number(x.payload.total ?? 0);
    if (x.kind === 'expense') t.expenses += Number(x.payload.amount ?? 0);
  }
  return t;
}

/** ¿El error es de conexión o del servidor (se reintenta) o el servidor rechazó el dato (no se reintenta)? */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/** Quita de la cola un registro que todavía no salió (deshacer sin señal). Devuelve null si ya no está. */
export function cancelPending(list: OutboxItem[], id: string): OutboxItem[] | null {
  return list.some((x) => x.id === id && x.status === 'pending') ? removeItem(list, id) : null;
}

/** Restaura lo guardado en el archivo, descartando basura. */
export function restoreOutbox(raw: unknown): OutboxItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is OutboxItem =>
      !!x && typeof x.id === 'string' && typeof x.entityId === 'string' && typeof x.kind === 'string' && x.kind in ORDER && typeof x.payload === 'object',
  );
}
