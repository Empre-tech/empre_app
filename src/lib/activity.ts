// «Actividad y meta» (tablero «Actividad y meta», 2026-11-15): todo lo que pasó en el negocio en una sola línea de
// tiempo —ventas, canjes, citas, fiado, gastos y reseñas—, con la meta del mes arriba. Solo hechos que existen: lo que no
// trae el servidor (seguidores uno a uno, «me gusta», quién cambió qué) no se inventa. Sin React para probarlo con Node.

import type { Appointment } from '@/api/agenda';
import type { Expense, Sale } from '@/api/ledger';
import type { Review } from '@/api/types';
import { categoryLabel, formatPesos, METHOD_LABEL } from './ledger.ts';

export type ActivityKind = 'venta' | 'oferta' | 'cita' | 'fiado' | 'gasto' | 'resena';
/** Los filtros del tablero: cada tipo con su color, solo en su ícono. */
export type ActivityFilter = 'todo' | 'ventas' | 'gastos' | 'fiado' | 'clientes';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  at: string;
  /** De dónde viene: «Cita por Empre», «Insumos», «Fiado · Jorge». */
  from: string;
  /** Qué fue. */
  title: string;
  /** La cifra con su signo («$18.000», «−$34.000»), o null si no mueve plata. */
  value: string | null;
  tag: string;
  /** Lo que se toca para ver el movimiento y su rastro. */
  ref: { type: 'sale'; sale: Sale } | { type: 'expense'; expense: Expense } | { type: 'review'; review: Review } | { type: 'appointment'; appointment: Appointment };
}

const FILTER_OF: Record<ActivityKind, Exclude<ActivityFilter, 'todo'>> = { venta: 'ventas', oferta: 'ventas', cita: 'clientes', fiado: 'fiado', gasto: 'gastos', resena: 'clientes' };

/** Qué fue una venta en pocas palabras: su primer producto (y cuántos más) o la nota. */
function saleWhat(s: Sale): string {
  const first = s.lines?.[0]?.name?.trim();
  if (first) return s.lines.length > 1 ? `${first} y ${s.lines.length - 1} más` : first;
  return s.note?.trim() || 'Venta';
}

const isCredit = (s: Sale) => s.method === 'credit' || s.method2 === 'credit';

export function fromSales(sales: Sale[]): ActivityItem[] {
  return sales
    .filter((s) => s.status !== 'voided')
    .map((s) => {
      const who = s.party?.name;
      const kind: ActivityKind = isCredit(s) ? 'fiado' : s.source === 'offer_claim' ? 'oferta' : s.source === 'appointment' ? 'cita' : 'venta';
      const from =
        kind === 'fiado' ? `Fiado${who ? ` · ${who}` : ''}` : kind === 'oferta' ? 'Empre Offers · canje' : kind === 'cita' ? 'Cita por Empre' : `Venta · ${METHOD_LABEL[s.method] ?? 'pago'}`;
      const tag = kind === 'fiado' ? 'Por cobrar' : kind === 'oferta' ? 'Oferta' : kind === 'cita' ? 'Cobrada' : 'Venta';
      return { id: `s-${s.id}`, kind, at: s.occurred_at, from, title: saleWhat(s), value: formatPesos(s.total), tag, ref: { type: 'sale', sale: s } };
    });
}

export function fromExpenses(expenses: Expense[]): ActivityItem[] {
  return expenses
    .filter((e) => e.status !== 'voided')
    .map((e) => ({
      id: `e-${e.id}`,
      kind: 'gasto' as const,
      at: e.occurred_at,
      from: `Gasto · ${categoryLabel(e.category)}${e.party?.name ? ` · ${e.party.name}` : ''}`,
      title: e.note?.trim() || categoryLabel(e.category),
      value: `−${formatPesos(e.amount)}`,
      tag: 'Gasto',
      ref: { type: 'expense', expense: e },
    }));
}

export function fromReviews(reviews: Review[]): ActivityItem[] {
  return reviews.map((r) => ({
    id: `r-${r.id}`,
    kind: 'resena' as const,
    at: r.created_at,
    from: `${r.user?.name?.split(/\s+/)[0] ?? 'Un cliente'}${r.verified ? ' · después de un canje' : ''}`,
    title: `${r.comment?.trim() ? `«${r.comment.trim()}» ` : ''}${'★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating))))}`,
    value: null,
    tag: 'Reseña',
    ref: { type: 'review', review: r },
  }));
}

/** Las citas que pidieron (por Empre): cuándo la pidieron y para cuándo. */
export function fromAppointments(appts: Appointment[], timeOf: (iso: string) => string): ActivityItem[] {
  return appts
    .filter((a) => a.kind === 'booking')
    .map((a) => ({
      id: `a-${a.id}`,
      kind: 'cita' as const,
      at: a.created_at,
      from: `${a.customer?.name?.split(/\s+/)[0] ?? 'Un cliente'} · por Empre`,
      title: `${a.status === 'requested' ? 'Pidió' : 'Tiene'} una cita${a.service?.name ? ` de ${a.service.name.toLocaleLowerCase('es')}` : ''} a las ${timeOf(a.starts_at)}`,
      value: null,
      tag: a.status === 'requested' ? 'Por responder' : a.status === 'confirmed' ? 'Confirmada' : 'Cita',
      ref: { type: 'appointment', appointment: a },
    }));
}

/** Lo de un día (AAAA-MM-DD en Colombia), de lo más nuevo a lo más viejo. */
export function onDay(items: ActivityItem[], ymd: string): ActivityItem[] {
  const dayOf = (iso: string) => new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 10);
  return items.filter((i) => dayOf(i.at) === ymd).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export const FILTER_LABEL: Record<ActivityFilter, string> = { todo: 'Todo', ventas: 'Ventas', gastos: 'Gastos', fiado: 'Fiado', clientes: 'Clientes' };

/** Los filtros con cuántos hay; solo los que tienen algo (más «Todo»). */
export function filterCounts(items: ActivityItem[]): { key: ActivityFilter; n: number }[] {
  const n = (f: ActivityFilter) => (f === 'todo' ? items.length : items.filter((i) => FILTER_OF[i.kind] === f).length);
  return (['todo', 'ventas', 'gastos', 'fiado', 'clientes'] as ActivityFilter[]).map((key) => ({ key, n: n(key) })).filter((x) => x.key === 'todo' || x.n > 0);
}

export const matches = (i: ActivityItem, f: ActivityFilter) => f === 'todo' || FILTER_OF[i.kind] === f;

/** «8 movimientos · entró $186.000 · salió $34.000»: solo lo que hubo. */
export function daySummary(items: ActivityItem[]): string {
  if (!items.length) return 'Sin movimientos este día';
  const sum = (ks: ActivityKind[]) =>
    items.reduce((s, i) => {
      if (!ks.includes(i.kind)) return s;
      if (i.ref.type === 'sale') return s + i.ref.sale.total;
      if (i.ref.type === 'expense') return s + i.ref.expense.amount;
      return s;
    }, 0);
  const entered = sum(['venta', 'oferta', 'cita']);
  const out = sum(['gasto']);
  const credit = sum(['fiado']);
  return [
    `${items.length} ${items.length === 1 ? 'movimiento' : 'movimientos'}`,
    entered ? `entró ${formatPesos(entered)}` : null,
    out ? `salió ${formatPesos(out)}` : null,
    credit ? `fiaste ${formatPesos(credit)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface Goal {
  month: string;
  kind: 'sales' | 'left';
  target: number;
}

/** La meta: cuánto va, cuánto falta, cuánto hace falta al día y cuánto deja un día normal. */
export function goalProgress(goal: Goal, done: number, today: string): { pct: number; left: number; daysLeft: number; perDay: number; normalDay: number; reached: boolean } {
  const [y, m, d] = today.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysLeft = Math.max(0, daysInMonth - d);
  const left = Math.max(0, goal.target - done);
  return {
    pct: Math.min(100, Math.round((done / goal.target) * 100)),
    left,
    daysLeft,
    perDay: daysLeft > 0 ? Math.ceil(left / daysLeft / 1000) * 1000 : left,
    normalDay: d > 0 ? Math.round(done / d / 1000) * 1000 : 0,
    reached: done >= goal.target,
  };
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? '';

/** Una meta propuesta para empezar: lo del mes pasado, redondeado hacia arriba (sin inventar: sale de lo anotado). */
export function suggestedTarget(lastMonth: number): number | null {
  if (lastMonth <= 0) return null;
  const step = lastMonth >= 1_000_000 ? 100_000 : 10_000;
  return Math.ceil((lastMonth * 1.1) / step) * step;
}
