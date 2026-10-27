// Lógica pura del análisis del negocio (Empre Finance): rangos de fechas, comparaciones y lo que muestran los gráficos.
// Las fechas van como texto AAAA-MM-DD en hora de Colombia (UTC−5, sin cambio de hora). Sin imports: corre igual con
// `node --test` (ver finance.test.ts) que en la app.

export type Compare = 'prev' | 'month' | 'year';
export type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'lastMonth' | 'year' | 'custom';

export interface DateRange {
  from: string;
  to: string;
  compare: Compare;
  preset: Preset;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const WEEK_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const FRANJAS = ['Mañana', 'Mediodía', 'Tarde', 'Noche'];

const pad = (n: number) => String(n).padStart(2, '0');

function toUTC(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Hoy en Colombia. */
export function todayCO(now: Date = new Date()): string {
  return fromUTC(new Date(now.getTime() - 5 * 3600 * 1000));
}

export function addDays(ymd: string, n: number): string {
  const d = toUTC(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** Días entre dos fechas, ambas incluidas. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86400000) + 1;
}

/** Lunes = 0 … domingo = 6. */
export function weekdayIndex(ymd: string): number {
  return (toUTC(ymd).getUTCDay() + 6) % 7;
}

export const PRESETS: { key: Exclude<Preset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'lastMonth', label: 'Mes pasado' },
  { key: 'year', label: 'Este año' },
];

/** El rango de un atajo y con qué se compara («Este mes» va contra las mismas fechas del mes anterior). */
export function presetRange(p: Exclude<Preset, 'custom'>, today: string): DateRange {
  const [y, m] = today.split('-').map(Number);
  switch (p) {
    case 'today':
      return { from: today, to: today, compare: 'prev', preset: p };
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1), compare: 'prev', preset: p };
    case '7d':
      return { from: addDays(today, -6), to: today, compare: 'prev', preset: p };
    case '30d':
      return { from: addDays(today, -29), to: today, compare: 'prev', preset: p };
    case 'month':
      return { from: `${y}-${pad(m)}-01`, to: today, compare: 'month', preset: p };
    case 'lastMonth': {
      const first = fromUTC(new Date(Date.UTC(y, m - 2, 1)));
      const last = fromUTC(new Date(Date.UTC(y, m - 1, 0)));
      return { from: first, to: last, compare: 'month', preset: p };
    }
    case 'year':
      return { from: `${y}-01-01`, to: today, compare: 'year', preset: p };
  }
}

/** «18 oct», «5 – 18 oct», «28 sep – 3 oct», «28 dic 2025 – 3 ene 2026». */
export function rangeLabel(from: string, to: string, today: string = todayCO()): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const thisYear = Number(today.slice(0, 4));
  const showYear = fy !== ty || fy !== thisYear;
  const end = `${td} ${MONTHS[tm - 1]}${showYear ? ` ${ty}` : ''}`;
  if (from === to) return end;
  if (fy === ty && fm === tm) return `${fd} – ${end}`;
  return `${fd} ${MONTHS[fm - 1]}${showYear ? ` ${fy}` : ''} – ${end}`;
}

/** «5 – 18 oct · 14 días». */
export function rangeTitle(r: { from: string; to: string }, today?: string): string {
  const n = daysBetween(r.from, r.to);
  return n === 1 ? rangeLabel(r.from, r.to, today) : `${rangeLabel(r.from, r.to, today)} · ${n} días`;
}

/** Cambio en %; null si antes no hubo nada con qué comparar. */
export function deltaPct(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/**
 * «▲ 12 %» en verde si subir es bueno (ventas) o en ámbar si es malo (gastos, con `worseUp`). Sin base: «nuevo»
 * cuando ahora hay algo y antes no, o nada.
 */
export function deltaLabel(cur: number, prev: number, worseUp = false): { text: string; tone: 'good' | 'bad' | 'flat' } | null {
  const p = deltaPct(cur, prev);
  if (p === null) return cur > 0 && prev === 0 ? { text: 'Sin datos antes', tone: 'flat' } : null;
  if (p === 0) return { text: '= igual', tone: 'flat' };
  const up = p > 0;
  return { text: `${up ? '▲' : '▼'} ${Math.abs(p)} %`, tone: up !== worseUp ? 'good' : 'bad' };
}

/** La etiqueta de cada barra: inicial del día (hasta dos semanas), número del día, semana o mes. */
export function bucketLabel(bucket: string, start: string, count: number): string {
  const [, m, d] = start.split('-').map(Number);
  if (bucket === 'month') return MONTHS[m - 1];
  if (bucket === 'week') return `${d}/${m}`;
  return count <= 14 ? WEEK_INITIALS[weekdayIndex(start)] : String(d);
}

/** «sáb 10 oct» para el detalle de una barra. */
export function dayLong(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${WEEKDAYS[weekdayIndex(ymd)].slice(0, 3)} ${d} ${MONTHS[m - 1]}`;
}

/** Intensidad 0–3 de una casilla del mapa de calor. */
export function heatLevel(v: number, max: number): number {
  if (!(max > 0) || v <= 0) return 0;
  const r = v / max;
  return r > 0.75 ? 3 : r > 0.4 ? 2 : 1;
}

/** «sábado al mediodía»: la casilla que más vende, si hubo ventas. */
export function bestSlot(heat: number[][]): string | null {
  let best = 0;
  let day = -1;
  let slot = -1;
  for (let d = 0; d < heat.length; d++) {
    for (let f = 0; f < heat[d].length; f++) {
      if (heat[d][f] > best) {
        best = heat[d][f];
        day = d;
        slot = f;
      }
    }
  }
  if (day < 0) return null;
  return `${WEEKDAYS[day]} ${['en la mañana', 'al mediodía', 'en la tarde', 'en la noche'][slot]}`;
}

/** Las casillas de un mes para el calendario (lunes primero); null = casilla vacía. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = `${year}-${pad(month)}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: (string | null)[] = Array(weekdayIndex(first)).fill(null);
  for (let d = 1; d <= days; d++) out.push(`${year}-${pad(month)}-${pad(d)}`);
  return out;
}

/** Elegir fechas con dos toques: el primero marca el inicio; el segundo, el final (si es antes, se invierte). */
export function pickDay(cur: { from: string | null; to: string | null }, day: string): { from: string; to: string | null } {
  if (!cur.from || cur.to) return { from: day, to: null };
  return day < cur.from ? { from: day, to: cur.from } : { from: cur.from, to: day };
}

export interface ProductLike {
  name: string;
  revenue: number;
  profit: number | null;
  margin_pct: number | null;
}

/** Ordena por lo que más vendes o por lo que más te deja (sin costo, al final). */
export function rankProducts<T extends ProductLike>(list: T[], by: 'revenue' | 'profit'): T[] {
  const out = [...list];
  if (by === 'revenue') return out.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'es'));
  return out.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity) || b.revenue - a.revenue);
}

/** Los que dejan menos del 10 % o hacen perder. */
export function lowMargin<T extends ProductLike>(list: T[]): T[] {
  return list.filter((p) => p.margin_pct !== null && p.margin_pct < 10).sort((a, b) => (a.margin_pct ?? 0) - (b.margin_pct ?? 0));
}

/**
 * Una frase cuando lo que más vendes no es lo que más te deja: «La gaseosa es lo que más vendes, pero solo te deja
 * el 12 %». null si coinciden o no hay costos.
 */
export function topMismatch<T extends ProductLike>(list: T[]): string | null {
  const byRev = rankProducts(list, 'revenue')[0];
  const byProfit = rankProducts(list.filter((p) => p.profit !== null), 'profit')[0];
  if (!byRev || !byProfit || byRev === byProfit || byRev.margin_pct === null) return null;
  return `«${byRev.name}» es lo que más vendes, pero te deja el ${Math.round(byRev.margin_pct)} %. «${byProfit.name}» es lo que más ganancia te deja.`;
}

/** Margen bruto en % sobre lo vendido con costo; null si nada tenía costo. */
export function marginPct(t: { gross_margin: number; costed_revenue: number }): number | null {
  return t.costed_revenue > 0 ? Math.round((t.gross_margin / t.costed_revenue) * 100) : null;
}

/** Lee un rango de los parámetros de una pantalla; si falta o no sirve, «Este mes». */
export function rangeFromParams(p: { from?: string; to?: string; compare?: string; preset?: string }, today: string = todayCO()): DateRange {
  const ok = (s?: string) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (ok(p.from) && ok(p.to) && p.from! <= p.to!) {
    const compare: Compare = p.compare === 'month' || p.compare === 'year' ? p.compare : 'prev';
    const preset = (PRESETS.some((x) => x.key === p.preset) ? p.preset : 'custom') as Preset;
    return { from: p.from!, to: p.to!, compare, preset };
  }
  return presetRange('month', today);
}

/** «comparado con 1 – 27 sep». */
export function compareText(a: { compare_from: string; compare_to: string }, today?: string): string {
  return `comparado con ${rangeLabel(a.compare_from, a.compare_to, today)}`;
}
