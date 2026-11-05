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
