// Lógica pura de Empre Finance (3.45), sin React ni red, para probarla con Node: el borrador de una venta o un gasto
// (lo del catálogo, lo escrito a mano y lo dicho por voz se suman en el mismo borrador), las barras de la semana y los
// gastos «de siempre» (los dos últimos ya vienen sumados del servidor).

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

/**
 * Lo escrito a mano y aún no agregado (monto, descripción, categoría) como línea del borrador, o null si no hay monto.
 * Así el total y «Mantén para registrar» ya lo cuentan: antes había que tocar «Agregar a la venta» y, si no, arriba
 * seguía diciendo $0 con el botón apagado.
 */
export function typedLine(key: string, amount: number, desc: string, fallbackName: string, category?: string): DraftLine | null {
  if (amount <= 0) return null;
  return { key, name: desc.trim() || fallbackName, qty: 1, unitPrice: amount, category, source: 'manual' };
}

/** El borrador con lo escrito a mano sumado al final (si hay). */
export function withTyped(draft: DraftLine[], typed: DraftLine | null): DraftLine[] {
  return typed ? [...draft, typed] : draft;
}

/** Lo que dice la cápsula y lee el lector: el monto (null si no se sabe) y su texto. */
export interface CapsuleView {
  amount: number | null;
  label: string;
  a11y: string;
}

/**
 * Si el resumen no llegó, no hay monto que mostrar: un «$0» se leía como «hoy no ganaste nada». Se dice qué pasó y que
 * se puede registrar igual. `formatted` es el monto ya escrito en pesos (para el lector).
 */
export function capsuleView(net: number, failed: boolean, offline: boolean, formatted: string): CapsuleView {
  if (!failed) return { amount: net, label: 'Hoy te quedó', a11y: `Te quedó hoy ${formatted}. Abrir Empre Finance` };
  return offline
    ? { amount: null, label: 'Sin conexión · registra igual', a11y: 'Sin conexión: el resumen de hoy no está disponible. Puedes registrar igual. Abrir Empre Finance' }
    : { amount: null, label: 'Resumen no disponible', a11y: 'El resumen de hoy no está disponible. Puedes registrar igual. Abrir Empre Finance' };
}

/** Un gasto «de siempre» tal como lo manda el servidor (3.51): ya agrupado, con el monto de la última vez. */
export interface UsualExpense {
  key: string;
  note: string;
  category: string;
  amount: number;
  count: number;
}

export interface FrequentExpense {
  key: string;
  name: string;
  category: string;
  amount: number;
}

/** Para «De siempre»: el nombre es la nota, o la categoría si el gasto no tiene nota. */
export function usualExpenseItems(list: UsualExpense[], categoryName: (key: string) => string): FrequentExpense[] {
  return list.map((u) => ({ key: u.key, name: u.note.trim() || categoryName(u.category), category: u.category, amount: u.amount }));
}

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export interface DayBar {
  label: string;
  net: number;
  today: boolean;
}

/** Lo que el servidor sumó cada día (hora de Colombia). */
export interface DayTotals {
  date: string;
  sales: number;
  expenses: number;
}

/** «AAAA-MM-DD» de hoy en Colombia (UTC−5, sin horario de verano): el mismo día con el que suma el servidor. */
export function colombiaDay(now: Date = new Date()): string {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Las barras de la semana con lo que sumó el servidor (antes la app bajaba cada registro y se cortaba en 300). A hoy se
 * le suma lo que está en camino (`pendingNet`), igual que a «Te quedó», para que la barra y el número digan lo mismo.
 */
export function weekBars(days: DayTotals[], today: string, pendingNet = 0): DayBar[] {
  return days.slice(0, 7).map((d) => {
    const isToday = d.date === today;
    return {
      label: DAY_LABELS[new Date(`${d.date}T12:00:00Z`).getUTCDay()],
      net: d.sales - d.expenses + (isToday ? pendingNet : 0),
      today: isToday,
    };
  });
}

/** Alto de cada barra entre 0 y 1 (los días en pérdida o en cero quedan en un mínimo visible). */
export function barHeights(bars: DayBar[]): number[] {
  const max = Math.max(1, ...bars.map((b) => b.net));
  return bars.map((b) => (b.net <= 0 ? 0.06 : Math.max(0.12, b.net / max)));
}

/**
 * El texto del dictado sin las repeticiones que mete el reconocedor al corregirse mientras hablas: «70 70,000» queda
 * «70,000» (un número que es el comienzo del siguiente) y «vendí vendí» queda «vendí». Sin esto, «70 70,000» se
 * entendía como un gasto de $70 aparte.
 */
export function cleanSpeech(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev === undefined) {
      out.push(w);
      continue;
    }
    const a = prev.toLocaleLowerCase('es');
    const b = w.toLocaleLowerCase('es');
    if (a === b) continue; // palabra repetida
    const digitsA = a.replace(/[^\d]/g, '');
    const digitsB = b.replace(/[^\d]/g, '');
    if (/^\$?\d[\d.,]*$/.test(a) && /^\$?\d[\d.,]*$/.test(b) && digitsB.startsWith(digitsA) && digitsB.length > digitsA.length) {
      out[out.length - 1] = w; // «70» seguido de «70,000»: se queda el número completo
      continue;
    }
    out.push(w);
  }
  return out.join(' ');
}

const NUMBER_WORDS = new Set([
  'un', 'uno', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
  'catorce', 'quince', 'dieciséis', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintidos', 'veintitrés', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintiseis', 'veintisiete', 'veintiocho',
  'veintinueve', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa', 'cien', 'ciento', 'doscientos',
  'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos', 'mil', 'millón',
  'millon', 'millones', 'medio', 'y',
]);
const MONEY_TAIL = new Set(['mil', 'millón', 'millon', 'millones', 'pesos', 'lucas', 'barras']);

/**
 * Qué palabras del dictado son un monto, para resaltarlo completo mientras se habla («veinte mil», «$20,000», «dos
 * millones de pesos»). Devuelve un booleano por palabra. «y» solo cuenta dentro de un número («treinta y cinco mil»);
 * un número suelto que no termina en mil, millón o pesos, y no es una cifra, no se resalta («dos cortes»).
 */
export function amountMask(words: string[]): boolean[] {
  const norm = words.map((w) => w.toLocaleLowerCase('es').replace(/[.,;:!?¡¿«»"]+$/g, ''));
  const isDigit = (w: string) => /^\$?\d[\d.,]*$/.test(w);
  const mask = norm.map(() => false);
  let i = 0;
  while (i < norm.length) {
    if (!(isDigit(norm[i]) || (NUMBER_WORDS.has(norm[i]) && norm[i] !== 'y'))) {
      i++;
      continue;
    }
    // Un tramo de número: cifras o palabras de número (con «y» y «de» por dentro), más «mil», «millones» o «pesos».
    let j = i;
    while (j + 1 < norm.length && (NUMBER_WORDS.has(norm[j + 1]) || MONEY_TAIL.has(norm[j + 1]) || (norm[j + 1] === 'de' && MONEY_TAIL.has(norm[j + 2] ?? '')))) j++;
    while (j > i && (norm[j] === 'y' || norm[j] === 'de')) j--;
    const span = norm.slice(i, j + 1);
    const money = span.some((w) => isDigit(w) && /\d{3}|\$/.test(w)) || span.some((w) => MONEY_TAIL.has(w));
    if (money) for (let k = i; k <= j; k++) mask[k] = true;
    i = j + 1;
  }
  return mask;
}

/**
 * Prepara lo que la voz entendió para guardarlo. El servidor rechaza una venta con renglones sin precio («cada renglón
 * necesita precio»), y como guardar es todo o nada, una sola tarjeta así tumbaba todas: si a una venta le falta el precio
 * de algún producto, se guarda por su total, con los productos en la nota («2 × corte de cabello»).
 */
export function prepareVoiceActions(actions: VoiceAction[]): VoiceAction[] {
  return actions.map((a) => {
    if (a.type !== 'sale' || !a.lines?.length || a.lines.every((l) => l.unit_price != null)) return a;
    const what = a.lines.map((l) => (l.qty > 1 ? `${l.qty} × ${l.name}` : l.name)).join(', ');
    return { ...a, lines: undefined, note: a.note?.trim() || what };
  });
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
