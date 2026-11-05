// Empre AI cuando la respuesta ya está en los números: plantillas con reglas, sin modelo de lenguaje. Cuestan cero, salen
// al instante y funcionan sin señal. Separa siempre lo que se sabe de lo que no y nunca inventa una causa. Sin imports
// de la app: corre igual con `node --test`.

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const FRANJA = ['en la mañana', 'al mediodía', 'en la tarde', 'en la noche'];
const pesos = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('es-CO').replace(/,/g, '.')}`;
/** Una diferencia menor no se explica: es un día normal. */
const SMALL = 8;

export interface DayData {
  series: { start: string; sales: number; expenses: number }[];
  normal?: number[];
  previous_series?: number[];
}

export interface DayExplanation {
  name: string;
  headline: string;
  tag: string | null;
  facts: string[];
  unknown: string | null;
  /** Qué se puede probar: solo si el día salió por debajo. */
  suggestOffer: boolean;
}

const weekdayOf = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};

function baseOf(a: DayData, i: number): { value: number; what: 'normal' | 'prev' } | null {
  const n = a.normal?.[i];
  if (a.normal?.length === a.series.length && n && n > 0) return { value: n, what: 'normal' };
  const p = a.previous_series?.[i];
  return p && p > 0 ? { value: p, what: 'prev' } : null;
}

const diffOf = (a: DayData, i: number) => {
  const b = baseOf(a, i);
  return b ? Math.round(((a.series[i].sales - b.value) / b.value) * 100) : null;
};

/** El día que más se salió de lo esperado; sin con qué comparar, el último. */
export function dayToExplain(a: DayData): number {
  let best = a.series.length - 1;
  let top = -1;
  a.series.forEach((_, i) => {
    const d = diffOf(a, i);
    if (d !== null && Math.abs(d) > top) {
      top = Math.abs(d);
      best = i;
    }
  });
  return best;
}

/** Lo que Empre AI puede decir de un día con lo que quedó registrado. */
export function explainDay(a: DayData, i: number): DayExplanation {
  const day = a.series[i];
  const name = WEEKDAYS[weekdayOf(day.start)];
  const base = baseOf(a, i);
  const diff = diffOf(a, i);
  const facts: string[] = [];
  if (day.expenses > 0) facts.push(`Ese día gastaste ${pesos(day.expenses)}`);
  if (!base || diff === null) {
    return { name, headline: `El ${name} vendiste ${pesos(day.sales)}. Aún no hay con qué compararlo.`, tag: null, facts, unknown: null, suggestOffer: false };
  }
  if (Math.abs(diff) < SMALL) {
    return { name, headline: `El ${name} vendiste ${pesos(day.sales)}. Un ${name} normal para ti: no hay nada que explicar.`, tag: 'Lo de siempre', facts: [], unknown: null, suggestOffer: false };
  }
  const ref = base.what === 'normal' ? `un ${name} normal` : 'el periodo anterior';
  facts.unshift(`${base.what === 'normal' ? `Un ${name} normal` : 'En el periodo anterior'} vendes ${pesos(base.value)}`);
  return {
    name,
    headline: `El ${name} vendiste ${pesos(day.sales)}, ${diff < 0 ? 'menos' : 'más'} que ${ref}.`,
    tag: `${diff > 0 ? '+' : '−'}${Math.abs(diff)} % frente ${base.what === 'normal' ? 'a lo normal' : 'al anterior'}`,
    facts,
    unknown: `Por qué pasó. Con un solo día no se puede saber si fue casualidad.`,
    suggestOffer: diff < 0,
  };
}

/** «martes en la tarde»: la casilla que menos vende entre las que sí venden. Con pocos datos no dice nada. */
export function quietSlot(heat: number[][]): string | null {
  let low = Infinity;
  let at: [number, number] | null = null;
  let filled = 0;
  heat.forEach((row, d) =>
    row.forEach((v, f) => {
      if (v <= 0) return;
      filled++;
      if (v < low) {
        low = v;
        at = [d, f];
      }
    }),
  );
  if (!at || filled < 6) return null;
  const [d, f] = at as [number, number];
  return `${WEEKDAYS[d]} ${FRANJA[f]}`;
}

interface ProductCost {
  name: string;
  qty: number;
  revenue: number;
  costed_revenue?: number;
  profit: number | null;
}

/** Lo que cuesta una unidad según lo vendido; null si no tiene costo. */
function unitCost(p: ProductCost): number | null {
  if (p.profit === null || !(p.qty > 0)) return null;
  const base = p.costed_revenue ?? p.revenue;
  return (base - p.profit) / p.qty;
}

/** Lo que costó lo elegido, sumado; null si a alguno le falta el costo. */
export function chosenCost(names: string[], products: ProductCost[]): number | null {
  if (names.length === 0) return null;
  let total = 0;
  for (const n of names) {
    const p = products.find((x) => x.name === n);
    const c = p ? unitCost(p) : null;
    if (c === null) return null;
    total += c;
  }
  return total;
}

/** Cuánto deja el precio especial: si pierde, lo avisa; sin costo no dice nada. */
export function priceVerdict(cost: number | null, price: number | null | undefined): { text: string; warn: boolean } | null {
  if (cost === null || price === null || price === undefined) return null;
  const left = Math.round(price - cost);
  if (left < 0) return { text: `Con este precio perderías ${pesos(left)} en cada venta: te cuesta ${pesos(cost)}.`, warn: true };
  if (left === 0) return { text: `Con este precio no ganas nada: te cuesta ${pesos(cost)}.`, warn: true };
  return { text: `Con este precio te quedan ${pesos(left)} por venta.`, warn: false };
}

/** Un precio con ahorro que aún deja algo: 20 % menos, sin bajar del costo más 15 %. Redondeado a mil. */
export function suggestedPrice(cost: number | null, reference: number | null): number | null {
  if (reference === null || !(reference > 0)) return null;
  const off = reference * 0.8;
  const target = cost === null ? off : Math.max(off, cost * 1.15);
  const price = Math.ceil(target / 1000) * 1000;
  return price < reference ? price : null;
}

/** Títulos listos, sin llamar a ningún modelo. Solo dicen lo que la oferta ya es. */
export function offerTitleIdeas(names: string[], special: number | null | undefined, reference: number | null): string[] {
  if (names.length === 0) return [];
  const what = names.join(' + ');
  const out: string[] = [];
  if (special !== null && special !== undefined && special > 0) out.push(`${what} a ${pesos(special)}`);
  if (reference && special && special < reference) out.push(`${what} con ${Math.round(((reference - special) / reference) * 100)} % menos`);
  out.push(`${what} solo por hoy`);
  return out.slice(0, 3);
}

// ---- Los espacios de Finanzas ----

export interface Reading<K extends string> {
  kind: K;
  title: string;
  sub: string;
}

/** Lo que dice la plata del periodo: su mejor parte, lo comprado a crédito y contra el periodo anterior. */
export function plataReadings(
  series: { start: string; left: number }[],
  bucket: string,
  credit: number,
  delta: string | null,
): Reading<'best' | 'credit' | 'delta'>[] {
  const out: Reading<'best' | 'credit' | 'delta'>[] = [];
  const active = series.filter((p) => p.left !== 0);
  if (bucket === 'day' && active.length >= 2) {
    const best = active.reduce((a, b) => (b.left > a.left ? b : a));
    if (best.left > 0) out.push({ kind: 'best', title: `El ${WEEKDAYS[weekdayOf(best.start)]} fue tu mejor día`, sub: `Te quedaron ${pesos(best.left)}` });
  }
  if (credit > 0) out.push({ kind: 'credit', title: `Compraste ${pesos(credit)} a crédito`, sub: 'Saldrán cuando pagues: ya están en «Debes»' });
  if (delta) out.push({ kind: 'delta', title: `Te quedó ${delta.charAt(0).toLowerCase()}${delta.slice(1)}`, sub: 'Sin contar lo que sigue fiado' });
  return out;
}

const daysAgo = (iso: string | undefined, now: Date) => (iso ? Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 86400000)) : 0);

/** Qué cobrar primero: lo más antiguo. Si también se debe, cuánto de eso cubrirían los cobros. */
export function cuentasReadings(
  owedToYou: { name: string; balance: number; oldest_at?: string }[],
  youOwe: number,
  now: Date = new Date(),
): Reading<'first' | 'cover'>[] {
  const out: Reading<'first' | 'cover'>[] = [];
  if (owedToYou.length === 0) return out;
  const oldest = [...owedToYou].sort((a, b) => (a.oldest_at ?? '9').localeCompare(b.oldest_at ?? '9'))[0];
  const days = daysAgo(oldest.oldest_at, now);
  out.push({ kind: 'first', title: `Empieza por ${oldest.name}: ${pesos(oldest.balance)}`, sub: days > 0 ? `Es lo más antiguo: ${days === 1 ? '1 día' : `${days} días`}` : 'Es lo primero que quedó pendiente' });
  const owed = owedToYou.reduce((s, p) => s + p.balance, 0);
  if (youOwe > 0) {
    const pct = Math.round((owed / youOwe) * 100);
    out.push({ kind: 'cover', title: pct >= 100 ? 'Si cobras todo, cubres lo que debes' : `Si cobras todo, cubres lo que debes en un ${pct} %`, sub: `Te deben ${pesos(owed)} · debes ${pesos(youOwe)}` });
  }
  return out;
}

/** Qué revisar: lo que casi no deja y lo que aún no tiene costo. No propone precios. */
export function rentaReadings(
  products: { name: string; margin_pct: number | null; profit: number | null }[],
  uncostedCount: number,
  uncostedRevenue: number,
): Reading<'low' | 'cost'>[] {
  const out: Reading<'low' | 'cost'>[] = [];
  const low = products.filter((p) => p.margin_pct !== null && p.margin_pct < 10).sort((a, b) => (a.margin_pct ?? 0) - (b.margin_pct ?? 0))[0];
  if (low) {
    const pct = Math.round(low.margin_pct ?? 0);
    out.push({ kind: 'low', title: pct < 0 ? `${low.name} te hace perder` : `${low.name} casi no te deja: ${pct} %`, sub: (low.profit ?? 0) < 0 ? `Perdiste ${pesos(low.profit ?? 0)}. Revisa su precio o su costo` : 'Revisa su precio o su costo' });
  }
  if (uncostedCount > 0) {
    out.push({ kind: 'cost', title: uncostedCount === 1 ? 'Ponle costo a 1 producto' : `Ponles costo a ${uncostedCount} productos`, sub: `Sin costo, ${pesos(uncostedRevenue)} de tus ventas no se cuentan` });
  }
  return out;
}
