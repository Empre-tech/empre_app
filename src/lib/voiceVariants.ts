import { sameNameItem } from './voiceNewItem.ts';

/** Lo mínimo de un producto del inventario para saber si tiene tallas (o sabores) y cuáles. */
export interface VariantSource {
  ref: string;
  name: string;
  kind: 'product' | 'supply';
  price: number | null;
  status?: string;
  qty?: number;
  counted?: boolean;
  mode?: string;
  parent_id?: string;
  variant_label?: string;
  variants?: number;
}

export interface VariantOption {
  ref: string;
  label: string;
  name: string;
  price: number | null;
  out: boolean;
  /** Cuántas quedan, solo si se cuentan exacto; «low» si queda poco. */
  left: number | null;
  low: boolean;
}

export interface LineWithChoice {
  name: string;
  qty: number;
  unit_price?: number | null;
  item_id?: string;
  from_catalog?: boolean;
  /** Solo en el teléfono: el producto tiene variantes y hay que elegir cuál se vendió. */
  choose?: VariantOption[];
  /** El renglón salió de elegir talla: guarda la elección para poder cambiarla. */
  variant_of?: { key: string; name: string; qty: number; unit_price?: number | null; choose: VariantOption[] };
}

/**
 * «Vendí un top» cuando «Top» tiene tallas (2026-11-24): un producto con variantes no se vende solo (el servidor lo
 * rechaza), así que el renglón queda con sus opciones para que el dueño toque la talla. Si ya dijo una, no se pregunta.
 */
export function withVariantChoices<L extends LineWithChoice>(lines: L[], items: VariantSource[]): L[] {
  return lines.map((l) => {
    const byId = l.item_id ? items.find((i) => i.ref === l.item_id) : undefined;
    if (byId?.parent_id) return l;
    const parent: VariantSource | null = byId ?? sameNameItem(l.name, items.filter((i) => i.kind === 'product' && !i.parent_id));
    if (!parent) return l;
    const kids = items.filter((i) => i.parent_id === parent.ref);
    if (kids.length === 0) return l;
    const choose = sortVariants(
      kids.map((k) => {
        const exact = k.mode === 'exact' && k.counted === true && typeof k.qty === 'number';
        return {
          ref: k.ref,
          label: k.variant_label || k.name,
          name: k.name,
          price: k.price ?? parent.price,
          out: k.status === 'out' || (exact && (k.qty ?? 0) <= 0),
          left: exact ? Math.max(0, k.qty ?? 0) : null,
          low: k.status === 'low',
        };
      }),
    );
    return { ...l, choose };
  });
}

/** El renglón con la variante elegida: su nombre, su id y su precio (o el del producto). */
export function pickVariant<L extends LineWithChoice>(line: L, opt: VariantOption, key = newKey()): L {
  const { choose, ...rest } = line;
  const variant_of = { key, name: line.name, qty: line.qty, unit_price: line.unit_price, choose: choose ?? [] };
  return { ...(rest as L), name: opt.name, item_id: opt.ref, unit_price: opt.price ?? line.unit_price ?? null, from_catalog: opt.price != null || line.from_catalog, variant_of };
}

const newKey = () => Math.random().toString(36).slice(2, 10);

/** «Cambiar tallas»: los renglones de esa elección vuelven a ser uno, con sus tallas para elegir otra vez. */
export function reopenVariants<L extends LineWithChoice>(lines: L[], key: string): L[] {
  const at = lines.findIndex((l) => l.variant_of?.key === key);
  if (at < 0) return lines;
  const v = lines[at].variant_of!;
  const back = { ...lines[at], name: v.name, qty: v.qty, unit_price: v.unit_price ?? null, item_id: undefined, from_catalog: undefined, choose: v.choose, variant_of: undefined } as L;
  return lines.flatMap((l, i) => (i === at ? [back] : l.variant_of?.key === key ? [] : [l]));
}

const SIZE_ORDER = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl', '4xl'];

/** El orden en que se leen las tallas: XS, S, M, L, XL; los números de menor a mayor; lo demás, como estaba. */
export function sortVariants<T extends { label: string }>(list: T[]): T[] {
  const key = (label: string): [number, number] => {
    const t = label.toLowerCase().replace(/^talla\s*/, '').trim();
    const size = SIZE_ORDER.indexOf(t);
    if (size >= 0) return [0, size];
    const n = Number(t.replace(',', '.'));
    if (Number.isFinite(n) && t !== '') return [1, n];
    return [2, 0];
  };
  return list
    .map((v, i) => ({ v, i, k: key(v.label) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i)
    .map((x) => x.v);
}

/** Cuántas mostrar de entrada: las que hay, hasta 6; las agotadas y el resto quedan detrás de «Ver todas». */
export const VARIANTS_AT_FIRST = 6;
export function visibleVariants<T extends { out: boolean }>(list: T[], all: boolean): { shown: T[]; hidden: number } {
  if (all) return { shown: list, hidden: 0 };
  const available = list.filter((v) => !v.out);
  const shown = (available.length > 0 ? available : list).slice(0, VARIANTS_AT_FIRST);
  return { shown, hidden: list.length - shown.length };
}

/**
 * «Vendí 3 tops»: 1 S y 2 M (2026-11-24). Reparte el renglón en uno por talla, con su precio. Las tallas en 0 no van.
 */
export function splitByVariants<L extends LineWithChoice>(line: L, counts: Record<string, number>): L[] {
  const opts = line.choose ?? [];
  const key = newKey();
  return opts.filter((o) => (counts[o.ref] ?? 0) > 0).map((o) => ({ ...pickVariant(line, o, key), qty: counts[o.ref] }));
}

/** El total de los renglones si todos tienen precio; si falta alguno, null (el total lo pone el dueño). */
export function linesTotal(lines: { qty: number; unit_price?: number | null; choose?: unknown[] }[]): number | null {
  if (lines.length === 0 || lines.some((l) => l.unit_price == null || (l.choose && l.choose.length > 0))) return null;
  return lines.reduce((sum, l) => sum + (l.unit_price ?? 0) * l.qty, 0);
}
