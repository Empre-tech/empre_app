/**
 * El mazo de medios de pago: lo que pasó hoy, repartido en una tarjeta por cada forma de pago (efectivo,
 * transferencia, tarjeta y fiado). Sin dependencias de pantalla para poder probarlo.
 */

export type DeckMethod = 'cash' | 'transfer' | 'card' | 'credit';

/** Un movimiento ya puesto en su medio: positivo entra, negativo sale. `at` vacío = del día, sin hora. */
export interface DeckEntry {
  /** Solo para lo que se puede tocar (una plata que sacaste o metiste se puede quitar). */
  id?: string;
  at: string;
  label: string;
  method: DeckMethod;
  amount: number;
}

export interface DeckCard {
  method: DeckMethod;
  moves: DeckEntry[];
  inTotal: number;
  outTotal: number;
  net: number;
}

export const DECK_ORDER: DeckMethod[] = ['cash', 'transfer', 'card', 'credit'];

interface SaleLike {
  occurred_at: string;
  total: number;
  method: DeckMethod;
  method2?: DeckMethod;
  amount2?: number;
  status?: string;
}

interface ExpenseLike {
  occurred_at: string;
  amount: number;
  method: DeckMethod;
  status?: string;
}

/** Una venta pagada de dos formas va a las dos tarjetas; lo fiado va a «Fiado». Las anuladas no cuentan. */
export function saleEntries(s: SaleLike, label: string, creditLabel: string = label): DeckEntry[] {
  if (s.status === 'voided') return [];
  const second = s.method2 && s.amount2 && s.amount2 > 0 && s.amount2 < s.total ? s.amount2 : 0;
  const lab = (m: DeckMethod) => (m === 'credit' ? creditLabel : label);
  const out: DeckEntry[] = [{ at: s.occurred_at, label: lab(s.method), method: s.method, amount: s.total - second }];
  if (second && s.method2) out.push({ at: s.occurred_at, label: lab(s.method2), method: s.method2, amount: second });
  return out.filter((e) => e.amount > 0);
}

/** Un gasto sale de su medio. Lo comprado a crédito no sale todavía: está en «Debes», no en el mazo. */
export function expenseEntries(e: ExpenseLike, label: string): DeckEntry[] {
  if (e.status === 'voided' || e.method === 'credit' || e.amount <= 0) return [];
  return [{ at: e.occurred_at, label, method: e.method, amount: -e.amount }];
}

/**
 * Una tarjeta por medio con movimientos, en el orden de siempre. `always` muestra un medio aunque hoy no tenga
 * nada (el efectivo al cerrar la caja); lo demás sin movimientos no aparece, para no llenar la pantalla de ceros.
 */
export function buildDeck(entries: DeckEntry[], always: DeckMethod[] = []): DeckCard[] {
  return DECK_ORDER.map((method) => {
    const moves = entries.filter((e) => e.method === method).sort((a, b) => (!a.at ? 1 : 0) - (!b.at ? 1 : 0) || (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
    const inTotal = moves.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0);
    const outTotal = moves.filter((m) => m.amount < 0).reduce((s, m) => s - m.amount, 0);
    return { method, moves, inTotal, outTotal, net: inTotal - outTotal };
  }).filter((c) => c.moves.length > 0 || always.includes(c.method));
}

/** «4 movimientos», «1 cliente». */
export function deckCount(c: DeckCard): string {
  const n = c.moves.length;
  if (c.method === 'credit') return n === 1 ? '1 fiado' : `${n} fiados`;
  if (n === 0) return 'Sin movimientos hoy';
  return n === 1 ? '1 movimiento' : `${n} movimientos`;
}

/** Lo que entró hoy por medios que ya son plata (sin lo fiado). */
export function deckEntered(cards: DeckCard[]): number {
  return cards.filter((c) => c.method !== 'credit').reduce((s, c) => s + c.inTotal, 0);
}
