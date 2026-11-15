// «Así sale» (tablero «Cada cifra con su porqué», 2026-11-14): toda cifra se toca y abre una VISTA PREVIA corta de por
// qué sale — la cuenta en palabras, lo principal (no todo), qué cuenta y qué no, y si falta algo — y lleva al detalle a
// la parte de Empre que se encarga de esa cifra (Finance, Mis salidas…). Sin hechos, no hay cifra. Sin React para
// probarlo con Node.

import type { Expense, PeriodTotals, Sale } from '@/api/ledger';
import type { OfferClaim } from '@/api/types';
import { categoryLabel, formatPesos } from './ledger.ts';

/** Una parte de la frase de la cuenta: `bold` es una cifra; `result`, la que se está explicando. */
export interface EqPart {
  t: string;
  bold?: boolean;
  result?: boolean;
}

export interface PreviewRow {
  key: string;
  title: string;
  sub?: string;
  value: string;
  /** El valor no es una cifra («No suma»): va suave. */
  quiet?: boolean;
}

export interface Preview {
  title: string;
  sub: string;
  equation: EqPart[];
  rows: PreviewRow[];
  /** Algo que falta y cambia la cifra («no anotaste gastos»). */
  warning?: string;
  /** Qué cuenta y qué no. */
  note?: string;
}

/** Lo de hoy de un negocio, con lo que manda cualquier versión del servidor. */
export interface Kept {
  entered: number;
  out: number;
  left: number;
  count: number;
  credit: number;
}

export function keptOf(t: PeriodTotals | undefined): Kept | null {
  if (!t) return null;
  const credit = t.by_method?.credit ?? 0;
  const entered = t.entered ?? Math.max(0, t.sales_total - credit);
  const out = t.out ?? t.expenses_total;
  return { entered, out, left: t.left ?? entered - out, count: t.sales_count, credit };
}

/** Sin hechos, sin cifra: un negocio sin ventas ni gastos hoy no muestra $0. */
export const hasFacts = (k: Kept | null): k is Kept => Boolean(k && (k.entered > 0 || k.out > 0 || k.count > 0 || k.credit > 0));

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Qué fue una venta, en pocas palabras: su primer producto (y cuántos más) o la nota. */
export function saleLabel(s: Sale): string {
  const first = s.lines?.[0]?.name?.trim();
  if (first) return s.lines.length > 1 ? `${first} y ${plural(s.lines.length - 1, 'más', 'más')}` : first;
  return s.note?.trim() || 'Venta';
}

const live = <T extends { status: string }>(list: T[]) => list.filter((x) => x.status !== 'voided');

/** «Te quedó hoy» de un negocio: la cuenta, la venta más grande, los gastos más grandes y lo que no cuenta. */
export function keptPreview(name: string, k: Kept, sales: Sale[] | undefined, expenses: Expense[] | undefined, time: string): Preview {
  const s = sales ? live(sales) : undefined;
  const e = expenses ? live(expenses) : undefined;
  const biggest = s?.length ? [...s].sort((a, b) => b.total - a.total)[0] : undefined;
  const topOut = e?.length ? [...e].sort((a, b) => b.amount - a.amount).slice(0, 2) : [];
  const rows: PreviewRow[] = [
    {
      key: 'in',
      title: `Entró · ${plural(k.count, 'venta', 'ventas')}`,
      sub: biggest ? (s!.length > 1 ? `La más grande: ${saleLabel(biggest).toLocaleLowerCase('es')}, ${formatPesos(biggest.total)}` : saleLabel(biggest)) : undefined,
      value: formatPesos(k.entered),
    },
  ];
  if (k.out > 0) {
    rows.push({
      key: 'out',
      title: `Salió · ${plural(e?.length || 1, 'gasto', 'gastos')}`,
      sub: topOut.length ? topOut.map((x) => `${(x.note?.trim() || categoryLabel(x.category)).replace(/^./, (c) => c.toLocaleUpperCase('es'))} ${formatPesos(x.amount)}`).join(' · ') : undefined,
      value: formatPesos(k.out),
    });
  }
  return {
    title: 'Así sale',
    sub: `${name} · hoy`,
    equation: [{ t: 'Entró ' }, { t: formatPesos(k.entered), bold: true }, { t: ' − salió ' }, { t: formatPesos(k.out), bold: true }, { t: ' = te quedó ' }, { t: formatPesos(k.left), bold: true, result: true }],
    rows,
    warning: k.out === 0 && k.entered > 0 ? 'No anotaste gastos hoy: «te quedó» es todo lo que entró. Si tuviste gastos, la cifra baja.' : undefined,
    note: `Lo anotado hasta las ${time}.${k.credit > 0 ? ` No cuenta lo fiado (${formatPesos(k.credit)}): entra cuando te paguen.` : ''}`,
  };
}

/** El total de varios negocios: la suma de los que tuvieron movimiento, y cada uno con lo suyo. */
export function totalPreview(list: { id: string; name: string; kept: Kept | null }[]): Preview {
  const withFacts = list.filter((x): x is { id: string; name: string; kept: Kept } => hasFacts(x.kept));
  const total = withFacts.reduce((s, x) => s + x.kept.left, 0);
  const noOut = withFacts.filter((x) => x.kept.out === 0 && x.kept.entered > 0).map((x) => x.name);
  const terms: EqPart[] = withFacts.flatMap((x, i) => [...(i ? [{ t: ' + ' }] : []), { t: formatPesos(x.kept.left), bold: true }]);
  return {
    title: 'Así sale',
    sub: `Tus ${list.length} negocios · hoy`,
    equation: withFacts.length > 1 ? [...terms, { t: ' = te quedó ' }, { t: formatPesos(total), bold: true, result: true }] : [{ t: 'Te quedó ' }, { t: formatPesos(total), bold: true, result: true }],
    rows: list.map((x) =>
      hasFacts(x.kept)
        ? { key: x.id, title: x.name, sub: `Entró ${formatPesos(x.kept.entered)} · ${x.kept.out > 0 ? `salió ${formatPesos(x.kept.out)}` : 'sin gastos anotados'}`, value: formatPesos(x.kept.left) }
        : { key: x.id, title: x.name, sub: 'Sin movimientos hoy', value: 'No suma', quiet: true },
    ),
    warning: noOut.length ? `${noOut.length === 1 ? noOut[0] : noOut.slice(0, -1).join(', ') + ' y ' + noOut[noOut.length - 1]} no ${noOut.length === 1 ? 'anotó' : 'anotaron'} gastos hoy: ahí «te quedó» es todo lo que entró.` : undefined,
    note: 'Cada negocio lleva a su propio detalle en Empre Finance.',
  };
}

const DAY = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

/** Lo ahorrado este mes: las ofertas canjeadas que dicen los dos precios, de la más nueva a la más vieja. */
export function savedPreview(claims: { claim: OfferClaim; saved: number; at: string }[], monthName: string): Preview {
  const list = claims.filter((c) => c.saved > 0).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const total = list.reduce((s, c) => s + c.saved, 0);
  const shown = list.slice(0, 3);
  const terms: EqPart[] = shown.flatMap((c, i) => [...(i ? [{ t: ' + ' }] : []), { t: formatPesos(c.saved) }]);
  return {
    title: 'Así sale',
    sub: `Lo que ahorraste · ${monthName}`,
    equation:
      list.length <= 3 && list.length > 1
        ? [{ t: plural(list.length, 'oferta canjeada', 'ofertas canjeadas'), bold: true }, { t: ': ' }, ...terms, { t: ' = ' }, { t: formatPesos(total), bold: true, result: true }]
        : [{ t: plural(list.length, 'oferta canjeada', 'ofertas canjeadas'), bold: true }, { t: ' = ' }, { t: formatPesos(total), bold: true, result: true }],
    rows: shown.map((c) => ({
      key: c.claim.id,
      title: c.claim.entity_name ?? 'Un negocio',
      sub: [c.claim.offer?.title, DAY.format(new Date(c.at)).replace('.', '').replace(' de ', ' ')].filter(Boolean).join(' · '),
      value: formatPesos(c.saved),
    })),
    note: `Solo lo que el negocio confirmó al canjear: precio normal menos lo que pagaste.${list.length > 3 ? ` Aquí van las 3 más nuevas de ${list.length}.` : ''}`,
  };
}
