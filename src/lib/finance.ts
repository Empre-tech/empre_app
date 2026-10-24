// Lógica pura de Empre Finance (3.45), sin React ni red, para probarla con Node: el borrador de una venta o un gasto
// (lo del catálogo, lo escrito a mano y lo dicho por voz se suman en el mismo borrador), la semana por días y los
// gastos «de siempre».

import type { ExpenseInput, PayMethod, SaleInput, VoiceAction } from '../api/ledger';

export type DraftSource = 'known' | 'manual' | 'voice';

export interface DraftLine {
  /** Para lo del catálogo o «de siempre» es estable (se suman cantidades); para lo manual o por voz, único. */
  key: string;
  name: string;
  qty: number;
  unitPrice: number;
  source: DraftSource;
  itemId?: string;
  /** Solo gastos. */
  category?: string;
}

export function draftTotal(lines: DraftLine[]): number {
  return lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

/** Suma `delta` a una línea conocida (la crea si no estaba, la quita si llega a 0). */
export function bumpLine(lines: DraftLine[], line: Omit<DraftLine, 'qty'>, delta: number): DraftLine[] {
  const i = lines.findIndex((l) => l.key === line.key);
  if (i < 0) return delta > 0 ? [...lines, { ...line, qty: delta }] : lines;
  const qty = lines[i].qty + delta;
  if (qty <= 0) return lines.filter((_, k) => k !== i);
  return lines.map((l, k) => (k === i ? { ...l, qty } : l));
}

export function qtyOf(lines: DraftLine[], key: string): number {
  return lines.find((l) => l.key === key)?.qty ?? 0;
}

export function removeLine(lines: DraftLine[], key: string): DraftLine[] {
  return lines.filter((l) => l.key !== key);
}

/** La venta lista para la cola: el total es la suma de las líneas. */
export function saleInputFrom(lines: DraftLine[], method: PayMethod, clientId: string): SaleInput {
  return {
    client_id: clientId,
    total: draftTotal(lines),
    method,
    lines: lines.map((l) => ({ item_id: l.itemId, name: l.name, qty: l.qty, unit_price: l.unitPrice })),
  };
}

/** Un gasto por línea (cada uno con su categoría y su nota): así «Mi negocio» los muestra por separado. */
export function expenseInputsFrom(lines: DraftLine[], newId: () => string): ExpenseInput[] {
  return lines.map((l) => ({
    client_id: newId(),
    amount: l.qty * l.unitPrice,
    category: l.category ?? 'otro',
    method: 'cash' as PayMethod,
    note: l.qty > 1 ? `${l.qty} × ${l.name}` : l.name,
  }));
}

export interface FrequentExpense {
  key: string;
  name: string;
  category: string;
  amount: number;
  count: number;
}

interface ExpenseLike {
  occurred_at: string;
  amount: number;
  category: string;
  note: string;
  status: string;
}

/**
 * Los gastos que más se repiten (por nota, o por categoría si no hay nota), con el monto de la última vez. Sirven para
 * «De siempre»: un gasto que pasó una sola vez no entra.
 */
export function frequentExpenses(expenses: ExpenseLike[], categoryName: (key: string) => string, limit = 4): FrequentExpense[] {
  const groups = new Map<string, FrequentExpense & { last: string }>();
  for (const e of expenses) {
    if (e.status !== 'active' || e.amount <= 0) continue;
    const name = e.note.trim() || categoryName(e.category);
    const key = name.toLocaleLowerCase('es');
    const g = groups.get(key);
    if (!g) groups.set(key, { key, name, category: e.category, amount: e.amount, count: 1, last: e.occurred_at });
    else {
      g.count++;
      if (e.occurred_at > g.last) {
        g.last = e.occurred_at;
        g.amount = e.amount;
        g.category = e.category;
      }
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(({ last: _last, ...g }) => g);
}

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export interface DayBar {
  label: string;
  net: number;
  today: boolean;
}

function localDayIndex(iso: string, from: Date): number {
  const d = new Date(iso);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** Lo que quedó cada día desde `fromIso` (7 días), con hoy marcado. Lo anulado no cuenta. */
export function weekBars(
  sales: { occurred_at: string; total: number; status: string }[],
  expenses: { occurred_at: string; amount: number; status: string }[],
  fromIso: string,
  now: Date = new Date(),
): DayBar[] {
  const from = new Date(fromIso);
  const bars: DayBar[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return { label: DAY_LABELS[d.getDay()], net: 0, today: localDayIndex(now.toISOString(), from) === i };
  });
  for (const s of sales) {
    const i = localDayIndex(s.occurred_at, from);
    if (s.status === 'active' && i >= 0 && i < 7) bars[i].net += s.total;
  }
  for (const e of expenses) {
    const i = localDayIndex(e.occurred_at, from);
    if (e.status === 'active' && i >= 0 && i < 7) bars[i].net -= e.amount;
  }
  return bars;
}

/** Alto de cada barra entre 0 y 1 (los días en pérdida o en cero quedan en un mínimo visible). */
export function barHeights(bars: DayBar[]): number[] {
  const max = Math.max(1, ...bars.map((b) => b.net));
  return bars.map((b) => (b.net <= 0 ? 0.06 : Math.max(0.12, b.net / max)));
}

/** Lo que la voz entendió, convertido en líneas del borrador del tipo pedido. Lo de otro tipo o a crédito se aparta. */
export function voiceToDraft(actions: VoiceAction[], kind: 'sale' | 'expense', newKey: () => string): { lines: DraftLine[]; skipped: number } {
  const lines: DraftLine[] = [];
  let skipped = 0;
  for (const a of actions) {
    if (a.type !== kind || a.method === 'credit' || a.amount <= 0) {
      skipped++;
      continue;
    }
    const priced = (a.lines ?? []).filter((l) => l.unit_price != null && l.qty > 0);
    const sum = priced.reduce((s, l) => s + l.qty * (l.unit_price ?? 0), 0);
    if (kind === 'sale' && priced.length > 0 && sum === a.amount) {
      for (const l of priced) lines.push({ key: newKey(), name: l.name, qty: l.qty, unitPrice: l.unit_price ?? 0, itemId: l.item_id, source: 'voice' });
    } else {
      const name = a.note?.trim() || (a.lines?.[0]?.name ?? '') || (kind === 'sale' ? 'Venta' : 'Gasto');
      lines.push({ key: newKey(), name, qty: 1, unitPrice: a.amount, category: a.category, source: 'voice' });
    }
  }
  return { lines, skipped };
}
