// Lógica pura de «Mi negocio» (3.52), sin React ni red, para probarla con Node: el resultado del periodo (lo que te
// quedó, «de cada $100», la comparación), la caja por medio de pago, los gastos por categoría, lo más vendido, las
// barras por día y hasta tres frases de «Lo que dicen tus números». Todo sale del resumen que ya manda el servidor.

import type { LedgerSummary, Period } from '../api/ledger';

/** Cómo se escriben los pesos y las categorías (los de `ledger.ts`; se pasan para que este archivo no dependa de él). */
export interface Words {
  pesos: (n: number) => string;
  category: (key: string) => string;
}

/** Debajo de esto, comparar en % engaña (de $5.000 a $50.000 es «+900 %»): no se muestra. */
export const MIN_COMPARE_BASE = 20_000;

export interface PeriodResult {
  sold: number;
  spent: number;
  net: number;
  /** De cada $100 vendidos: cuánto quedó (si hubo ganancia) o cuánto se gastó (si hubo pérdida). */
  per100: number;
  /** Partes de la barra «de cada $100», entre 0 y 1: lo que quedó y lo que se fue en gastos. */
  keepShare: number;
  spendShare: number;
  /** Cambio de lo que te quedó frente al periodo anterior, en %; null si no se puede comparar con sentido. */
  changePct: number | null;
}

/** El resultado del periodo, con lo que está en camino sumado (ventas y gastos aún sin enviar). */
export function periodResult(sum: LedgerSummary, pending: { sales: number; expenses: number } = { sales: 0, expenses: 0 }): PeriodResult {
  const sold = sum.sales_total + pending.sales;
  const spent = sum.expenses_total + pending.expenses;
  const net = sold - spent;
  const prevNet = sum.prev_sales_total - sum.prev_expenses_total;
  // Sin movimientos todavía no hay con qué comparar (saldría «−100 %» apenas empieza el día).
  const comparable = prevNet >= MIN_COMPARE_BASE && net >= 0 && (sold > 0 || spent > 0);
  const keepShare = sold > 0 ? Math.max(0, Math.min(1, net / sold)) : 0;
  return {
    sold,
    spent,
    net,
    per100: sold > 0 ? Math.round(((net >= 0 ? net : spent) / sold) * 100) : 0,
    keepShare,
    spendShare: sold > 0 ? Math.min(1 - keepShare, spent / sold) : 0,
    changePct: comparable ? Math.round(((net - prevNet) / prevNet) * 100) : null,
  };
}

export interface Share {
  key: string;
  label: string;
  amount: number;
  /** Parte del total (0–1). */
  share: number;
  /** Largo de la barra frente al más grande (0–1). */
  rel: number;
}

function shares(entries: [string, string, number][], total: number): Share[] {
  const list = entries.filter(([, , v]) => v > 0).sort((a, b) => b[2] - a[2]);
  const max = list[0]?.[2] ?? 1;
  return list.map(([key, label, amount]) => ({ key, label, amount, share: total > 0 ? amount / total : 0, rel: amount / max }));
}

const METHOD_ORDER = ['cash', 'transfer', 'card', 'credit'] as const;

/** Cómo te pagaron, en el orden de siempre (efectivo, transferencia, tarjeta, fiado), sin los que están en cero. */
export function methodSlices(sum: LedgerSummary): Omit<Share, 'label'>[] {
  const total = METHOD_ORDER.reduce((s, k) => s + (sum.by_method[k] ?? 0), 0);
  return METHOD_ORDER.filter((k) => (sum.by_method[k] ?? 0) > 0).map((k) => ({ key: k, amount: sum.by_method[k], share: total > 0 ? sum.by_method[k] / total : 0, rel: 1 }));
}

/** En qué se fue la plata: categorías de gasto de mayor a menor. */
export function categoryRows(sum: LedgerSummary, w: Words): Share[] {
  return shares(Object.entries(sum.expenses_by_category ?? {}).map(([k, v]) => [k, w.category(k), v]), sum.expenses_total);
}

/** Lo más vendido, con su parte de las ventas. */
export function topRows(sum: LedgerSummary, limit = 3): (Share & { qty: number })[] {
  const items = (sum.top_items ?? []).slice(0, limit);
  const rows = shares(items.map((t) => [t.name, t.name, t.revenue]), sum.sales_total);
  return rows.map((r) => ({ ...r, qty: items.find((t) => t.name === r.key)?.qty ?? 0 }));
}

const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface DayNet {
  date: string;
  /** Lo que va debajo de la barra: la inicial del día (semana) o el número (mes). */
  label: string;
  net: number;
  today: boolean;
  best: boolean;
}

/** Lo que quedó cada día del periodo; a hoy se le suma lo que está en camino. El mejor día va marcado. */
export function dayNets(sum: LedgerSummary, today: string, pendingNet = 0): DayNet[] {
  const days = sum.days ?? [];
  const nets = days.map((d) => d.sales - d.expenses + (d.date === today ? pendingNet : 0));
  const best = Math.max(0, ...nets);
  return days.map((d, i) => {
    const at = new Date(`${d.date}T12:00:00Z`);
    return {
      date: d.date,
      label: sum.period === 'week' ? WEEKDAY_SHORT[at.getUTCDay()] : String(at.getUTCDate()),
      net: nets[i],
      today: d.date === today,
      best: best > 0 && nets[i] === best,
    };
  });
}

/** «el viernes» en la semana, «el 5 de octubre» en el mes. */
export function dayName(date: string, period: Period): string {
  const at = new Date(`${date}T12:00:00Z`);
  return period === 'week' ? `el ${WEEKDAY[at.getUTCDay()]}` : `el ${at.getUTCDate()} de ${MONTH[at.getUTCMonth()]}`;
}

/** Un trozo de frase; los marcados con `b` van en negrita. */
export type Part = string | { b: string };

export interface Insight {
  key: string;
  tone: 'good' | 'warn' | 'tip';
  parts: Part[];
  /** A dónde lleva el enlace de la frase, si tiene. */
  action?: 'debts' | 'costs';
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * «Lo que dicen tus números»: hasta tres frases, con reglas fijas y en este orden de importancia. Pérdida; gastos que
 * se llevan el 60 % o más de lo vendido; una categoría con la mitad o más de los gastos (si hay varias); el mejor día
 * (semana y mes, con dos días o más de movimiento);
 * un producto con el 30 % o más de las ventas; el 15 % o más vendido fiado; y, si menos de la mitad de lo vendido tiene
 * costo, el consejo de agregarlo.
 */
export function insights(sum: LedgerSummary, r: PeriodResult, today: string, w: Words, limit = 3): Insight[] {
  const formatPesos = w.pesos;
  const out: Insight[] = [];
  if (r.sold === 0 && r.spent === 0) return out;
  const cats = categoryRows(sum, w);
  const topCat = cats[0];

  if (r.net < 0) {
    out.push({
      key: 'loss',
      tone: 'warn',
      parts: ['Gastaste ', { b: formatPesos(-r.net) }, ' más de lo que vendiste.', ...(topCat ? [' Lo que más pesó: ', { b: topCat.label }, ` (${formatPesos(topCat.amount)}).`] : [])],
    });
  } else if (r.sold > 0 && r.spent / r.sold >= 0.6) {
    out.push({
      key: 'spend',
      tone: 'warn',
      parts: ['Tus gastos se llevaron el ', { b: pct(r.spent / r.sold) }, ' de lo que vendiste.', ...(topCat ? [' El más grande: ', { b: topCat.label }, ` (${formatPesos(topCat.amount)}).`] : [])],
    });
  } else if (topCat && cats.length >= 2 && topCat.share >= 0.5) {
    // Con una sola categoría, «fue el 100 %» no dice nada.
    out.push({ key: 'category', tone: 'tip', parts: [{ b: topCat.label }, ` fue el ${pct(topCat.share)} de tus gastos (${formatPesos(topCat.amount)}).`] });
  }

  if (sum.period !== 'day') {
    const nets = dayNets(sum, today);
    const best = nets.find((d) => d.best);
    // El mejor día solo tiene sentido si hubo al menos dos días con movimiento.
    if (best && nets.filter((d) => d.net !== 0).length >= 2) out.push({ key: 'best-day', tone: 'good', parts: ['Tu mejor día fue ', { b: dayName(best.date, sum.period) }, ': te quedaron ', { b: formatPesos(best.net) }, '.'] });
  }

  const top = topRows(sum, 1)[0];
  if (top && top.share >= 0.3) out.push({ key: 'top-item', tone: 'good', parts: [{ b: top.label }, ` es el ${pct(top.share)} de tus ventas: es lo que más te mueve.`] });

  const credit = sum.by_method.credit ?? 0;
  if (sum.sales_total > 0 && credit / sum.sales_total >= 0.15) {
    out.push({ key: 'credit', tone: 'tip', parts: ['El ', { b: pct(credit / sum.sales_total) }, ` lo vendiste fiado (${formatPesos(credit)}): esa plata entra cuando te paguen.`], action: 'debts' });
  }

  if (sum.sales_total > 0 && sum.margin_coverage_pct < 50) {
    out.push({ key: 'costs', tone: 'tip', parts: ['Agrega lo que te cuesta cada producto y te digo ', { b: 'cuánto ganas de verdad' }, ' en cada uno.'], action: 'costs' });
  }

  return out.slice(0, limit);
}

/** La frase entera (para el lector de pantalla). */
export function insightText(i: Insight): string {
  return i.parts.map((p) => (typeof p === 'string' ? p : p.b)).join('');
}
