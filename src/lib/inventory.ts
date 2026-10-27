// Lógica pura del inventario (sin React): agrupar, nombrar estados y convertir pacas a unidades.
// Se prueba con `node --test` (ver inventory.test.ts).

export type Mode = 'none' | 'light' | 'exact' | 'unset';
export type Status = 'ok' | 'low' | 'out' | 'unknown' | 'none';

export interface InvLike {
  ref: string;
  name: string;
  kind: 'product' | 'supply';
  mode: Mode;
  status: Status;
  qty: number;
  unit: string;
  days_left: number | null;
  sold_28: number;
  is_service?: boolean;
  section?: string;
  /** Insumos que usa (para avisar si falta alguno). */
  ingredients?: { name: string; status: Status }[];
}

/** Insumos de un plato que se acabaron o se están acabando. */
export function missingIngredients(i: InvLike): { out: string[]; low: string[] } {
  const list = i.ingredients ?? [];
  return { out: list.filter((x) => x.status === 'out').map((x) => x.name), low: list.filter((x) => x.status === 'low').map((x) => x.name) };
}

export const STATUS_LABEL: Record<Status, string> = {
  ok: 'Hay',
  low: 'Queda poco',
  out: 'Se acabó',
  unknown: 'Sin contar',
  none: 'Sin control',
};

export const MODE_LABEL: Record<Exclude<Mode, 'unset'>, string> = {
  none: 'Sin control',
  light: 'Semáforo',
  exact: 'Cantidad exacta',
};

/** Cantidad sin ceros de sobra: 12 → «12», 2.5 → «2,5». */
export function fmtQty(q: number): string {
  if (!Number.isFinite(q)) return '0';
  const r = Math.round(q * 1000) / 1000;
  return String(r).replace('.', ',');
}

/** Texto corto para la fila de un ítem. */
export function itemLine(i: InvLike): string {
  if (i.mode === 'unset' || i.mode === 'none') return 'Sin control';
  if (i.mode === 'light') return STATUS_LABEL[i.status];
  if (i.status === 'unknown') return 'Cuenta cuántos tienes';
  const base = `${fmtQty(i.qty)} ${i.unit || 'unidades'}`;
  if (i.status === 'out') return 'Se acabó';
  if (i.days_left !== null && i.days_left !== undefined && i.days_left <= 7) {
    const d = Math.max(1, Math.round(i.days_left));
    return `${base} · alcanzan para ~${d} ${d === 1 ? 'día' : 'días'}`;
  }
  return base;
}

export interface Groups<T extends InvLike = InvLike> {
  urgent: T[]; // agotado o por agotarse
  rest: T[]; // con control y sin problema
  uncontrolled: T[]; // sin control o sin decidir
}

/** «Se acaba pronto» arriba, el resto después y lo que no se controla al final. Dentro de cada grupo, lo más vendido primero. */
export function groupInventory<T extends InvLike>(items: T[], query = ''): Groups<T> {
  const q = normalize(query);
  const list = q ? items.filter((i) => normalize(i.name).includes(q)) : items;
  const byDemand = (a: T, b: T) => b.sold_28 - a.sold_28 || a.name.localeCompare(b.name, 'es');
  const urgent: T[] = [];
  const rest: T[] = [];
  const uncontrolled: T[] = [];
  for (const i of list) {
    const m = missingIngredients(i);
    if (m.out.length > 0 || m.low.length > 0) urgent.push(i);
    else if (i.mode === 'unset' || i.mode === 'none' || i.is_service) uncontrolled.push(i);
    else if (i.status === 'out' || i.status === 'low') urgent.push(i);
    else rest.push(i);
  }
  const rank = (i: T) => (i.status === 'out' || missingIngredients(i).out.length > 0 ? 0 : 1);
  urgent.sort((a, b) => rank(a) - rank(b) || byDemand(a, b));
  rest.sort(byDemand);
  uncontrolled.sort(byDemand);
  return { urgent, rest, uncontrolled };
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Compré «3 pacas de 12»: son 36 unidades y el costo por unidad sale del precio de la paca.
 * Devuelve null si algo no cuadra (cero o negativo).
 */
export function packToUnits(packs: number, packSize: number, packPrice: number): { qty: number; unitCost: number } | null {
  if (!(packs > 0) || !(packSize > 0) || !(packPrice >= 0)) return null;
  return { qty: Math.round(packs * packSize * 1000) / 1000, unitCost: Math.round(packPrice / packSize) };
}

/** Frase de la recomendación inicial según lo que el servidor sugiere, para el asistente de arranque. */
export function recommendationText(kind: string, category: string): string {
  const where = category ? ` de «${category}»` : '';
  switch (kind) {
    case 'food':
      return `En un negocio${where} lo más cómodo es contar lo que vendes plato por plato y llevar los ingredientes con un semáforo: hay, queda poco, se acabó.`;
    case 'valuable':
      return `En un negocio${where} cada pieza vale, así que lo mejor es llevar la cantidad exacta de cada producto.`;
    case 'service':
      return `En un negocio${where} no hay mucho que contar: te dejo un semáforo solo para los productos que sí se acaban.`;
    case 'shop':
      return `En un negocio${where} lo más cómodo es un semáforo: hay, queda poco, se acabó. Los productos caros o con pocas unidades llevan cantidad exacta.`;
    default:
      return `Te propongo un semáforo (hay, queda poco, se acabó). Si un producto es caro o tienes pocas unidades, lo paso a cantidad exacta.`;
  }
}

/** Para el total del carrito de «Atención rápida». */
export function cartTotal(lines: { price: number; qty: number }[]): number {
  return lines.reduce((s, l) => s + Math.round(l.price * l.qty), 0);
}

export interface Block<T> {
  title: string;
  items: T[];
}

export const NO_SECTION = 'Otros';

/** Agrupa por la sección del catálogo (Almuerzos, Bebidas…), en orden alfabético y con «Otros» al final. */
export function sectionize<T extends { section?: string; name: string }>(items: T[]): Block<T>[] {
  const map = new Map<string, T[]>();
  for (const i of items) {
    const key = (i.section ?? '').trim() || NO_SECTION;
    map.set(key, [...(map.get(key) ?? []), i]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === NO_SECTION ? 1 : b === NO_SECTION ? -1 : a.localeCompare(b, 'es')))
    .map(([title, list]) => ({ title, items: list }));
}

/** Con muchos productos, las secciones arrancan plegadas para que la lista no se haga eterna. */
export const COLLAPSE_OVER = 20;
export const PAGE_SIZE = 30;

export type PillTone = 'ok' | 'low' | 'out' | 'neutral' | 'muted' | 'service';

/** La pastilla de la lista: en una palabra, cómo está cada cosa. */
export function stockPill(i: InvLike & { is_service?: boolean }): { label: string; tone: PillTone } {
  if (i.is_service) return { label: 'Servicio', tone: 'service' };
  if (i.mode === 'unset' || i.mode === 'none') return { label: 'Sin control', tone: 'muted' };
  if (i.mode === 'light') {
    if (i.status === 'out') return { label: 'Se acabó', tone: 'out' };
    if (i.status === 'low') return { label: 'Queda poco', tone: 'low' };
    return { label: 'Hay', tone: 'ok' };
  }
  if (i.status === 'unknown') return { label: 'Sin contar', tone: 'muted' };
  if (i.status === 'out') return { label: 'Agotado', tone: 'out' };
  const unit = !i.unit || i.unit === 'unidad' ? 'und' : i.unit;
  if (i.status === 'low') return { label: `Quedan ${fmtQty(i.qty)}`, tone: 'low' };
  return { label: `${fmtQty(i.qty)} ${unit}`, tone: 'neutral' };
}

/** Las dos pestañas: lo que se vende (productos y servicios) y los insumos (incluye productos que también se usan). */
export function splitTabs<T extends { kind: 'product' | 'supply'; also_supply?: boolean }>(items: T[]): { sell: T[]; supplies: T[] } {
  return { sell: items.filter((i) => i.kind === 'product'), supplies: items.filter((i) => i.kind === 'supply' || Boolean(i.also_supply)) };
}

export interface Nestable extends InvLike {
  parent_id?: string;
  variants?: number;
  variant_label?: string;
}

const STATUS_RANK: Record<Status, number> = { out: 0, low: 1, ok: 2, unknown: 3, none: 4 };

/**
 * Agrupa las variantes bajo su producto. El producto toma el estado de sus variantes: «se acabó» si se acabaron
 * todas, «queda poco» si alguna se acaba; así sube a «se acaba» en la lista sin contarse él mismo.
 */
export function nestVariants<T extends Nestable>(items: T[]): (T & { children: T[] })[] {
  const kids = new Map<string, T[]>();
  for (const i of items) if (i.parent_id) kids.set(i.parent_id, [...(kids.get(i.parent_id) ?? []), i]);
  return items
    .filter((i) => !i.parent_id)
    .map((i) => {
      const children = kids.get(i.ref) ?? [];
      if (children.length === 0) return { ...i, children };
      const controlled = children.filter((c) => c.mode === 'light' || c.mode === 'exact');
      const allOut = controlled.length > 0 && controlled.length === children.length && children.every((c) => c.status === 'out');
      const anyShort = controlled.some((c) => c.status === 'out' || c.status === 'low');
      const status: Status = allOut ? 'out' : anyShort ? 'low' : controlled.length ? 'ok' : 'none';
      return { ...i, children, mode: (controlled.length ? 'light' : 'none') as Mode, status, sold_28: children.reduce((n, c) => n + c.sold_28, 0) };
    });
}

/** La pastilla de un producto con variantes: cuántas tiene o cuántas se acaban. */
export function variantPill(i: { status: Status; children: { status: Status }[] }): { label: string; tone: PillTone } {
  const n = i.children.length;
  if (i.status === 'out') return { label: 'Se acabaron', tone: 'out' };
  const short = i.children.filter((c) => c.status === 'out' || c.status === 'low').length;
  if (short > 0) return { label: short === 1 ? '1 se acaba' : `${short} se acaban`, tone: 'low' };
  return { label: `${n} opciones`, tone: 'neutral' };
}

/** Ordena variantes: primero las que se acaban. */
export function byUrgency<T extends { status: Status; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name, 'es'));
}
