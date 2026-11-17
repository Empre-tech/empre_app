// Contar una sección (tablero «Inventario», teléfonos 9–12). Lógica pura, sin imports, para probarla con `node --test`
// (ver inventoryCount.test.ts): qué filas se cuentan, qué no cuadra, qué se manda al servidor y cuándo se contó.

type Status = 'ok' | 'low' | 'out' | 'unknown' | 'none';
type Level = 'ok' | 'low' | 'out';

/** Lo que hace falta de una fila del inventario para contarla. */
export interface CountSource {
  ref: string;
  name: string;
  mode: string;
  status: Status;
  qty: number;
  level?: string;
  unit: string;
  counted: boolean;
  is_service: boolean;
  cost: number | null;
  parent_id?: string;
  variant_label?: string;
  variants?: number;
}

/** Una fila para contar. Expected: lo que había al empezar (null si nunca se ha contado: lo contado es lo que hay). */
export interface CountRow {
  ref: string;
  name: string;
  /** El producto al que pertenece una variante (para agruparlas). */
  group?: string;
  kind: 'exact' | 'light';
  expected: number | null;
  level: Level;
  unit: string;
  cost: number | null;
}

/** Lo que el dueño marcó en una fila: una cantidad o un nivel. */
export type CountEntry = { counted: number } | { level: Level };

/** Motivo de un faltante: un conteo (por defecto) o una pérdida. */
export type CountReason = 'conteo' | 'danado' | 'vencido' | 'perdida';

const asLevel = (l?: string): Level => (l === 'low' || l === 'out' ? l : 'ok');

/**
 * Las filas que se cuentan de una sección: cada producto (o cada variante de uno que las tenga) que no sea un servicio
 * ni lleve «no llevar». El semáforo se cuenta con un nivel; lo demás, con una cantidad (contar un producto sin decidir lo
 * pasa a cantidad exacta).
 */
export function countRows(items: CountSource[], variants: CountSource[]): CountRow[] {
  const kids = new Map<string, CountSource[]>();
  for (const v of variants) if (v.parent_id) kids.set(v.parent_id, [...(kids.get(v.parent_id) ?? []), v]);
  const out: CountRow[] = [];
  const add = (i: CountSource, group?: string) => {
    if (i.is_service || i.mode === 'none') return;
    const light = i.mode === 'light';
    out.push({
      ref: i.ref,
      name: group && i.variant_label ? i.variant_label : i.name,
      group,
      kind: light ? 'light' : 'exact',
      expected: !light && i.mode === 'exact' && i.counted ? i.qty : null,
      level: asLevel(i.level ?? (i.status === 'low' || i.status === 'out' ? i.status : 'ok')),
      unit: i.unit,
      cost: i.cost,
    });
  };
  for (const i of items) {
    const ch = kids.get(i.ref) ?? [];
    if ((i.variants ?? 0) > 0 || ch.length > 0) ch.forEach((c) => add(c, i.name));
    else add(i);
  }
  return out;
}

/** Si lo marcado cuadra con lo que había (un conteo sin cambio, o el mismo nivel). */
export function matches(row: CountRow, entry: CountEntry | undefined): boolean {
  if (!entry) return false;
  if ('level' in entry) return entry.level === row.level;
  return row.expected !== null && entry.counted === row.expected;
}

export interface CountDiff {
  row: CountRow;
  /** Para cantidad: contado − esperado (o lo contado, si era el primer conteo). */
  delta: number;
  counted?: number;
  level?: Level;
  /** Primer conteo: no hay con qué comparar. */
  first: boolean;
}

/** Lo que no cuadra (y los primeros conteos), en el orden de la lista. */
export function countDiffs(rows: CountRow[], entries: Record<string, CountEntry>): CountDiff[] {
  const out: CountDiff[] = [];
  for (const row of rows) {
    const e = entries[row.ref];
    if (!e || matches(row, e)) continue;
    if ('level' in e) out.push({ row, delta: 0, level: e.level, first: false });
    else if (row.expected === null) out.push({ row, delta: e.counted, counted: e.counted, first: true });
    else out.push({ row, delta: Math.round((e.counted - row.expected) * 1000) / 1000, counted: e.counted, first: false });
  }
  return out;
}

export interface CountLinePayload {
  ref: string;
  expected?: number;
  counted?: number;
  level?: Level;
  reason?: CountReason;
}

/** Las filas que se mandan: todas las marcadas (también las que cuadran: así quedan con su fecha de conteo). */
export function countPayload(rows: CountRow[], entries: Record<string, CountEntry>, reasons: Record<string, CountReason>): CountLinePayload[] {
  const out: CountLinePayload[] = [];
  for (const row of rows) {
    const e = entries[row.ref];
    if (!e) continue;
    if ('level' in e) {
      out.push({ ref: row.ref, level: e.level });
      continue;
    }
    const line: CountLinePayload = { ref: row.ref, counted: e.counted };
    if (row.expected !== null) line.expected = row.expected;
    const r = reasons[row.ref];
    if (r && r !== 'conteo' && row.expected !== null && e.counted < row.expected) line.reason = r;
    out.push(line);
  }
  return out;
}

/** «Contada hoy», «hace 1 día», «hace 18 días»; null si nunca. */
export function countedAgo(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const days = Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));
  if (days === 0) return 'contada hoy';
  return days === 1 ? 'contada hace 1 día' : `contada hace ${days} días`;
}

/** La sección que más tiempo lleva sin contarse, si pasa de `days` días (solo las que ya se contaron alguna vez). */
export function staleSection(sections: { name: string; counted_at?: string | null }[], now: number, days = 30): { name: string; days: number } | null {
  let worst: { name: string; days: number } | null = null;
  for (const s of sections) {
    if (!s.counted_at) continue;
    const d = Math.floor((now - Date.parse(s.counted_at)) / 86_400_000);
    if (d > days && (!worst || d > worst.days)) worst = { name: s.name, days: d };
  }
  return worst;
}

/** Lee una cantidad escrita («12», «2,5», «1.000»): null si no es un número válido. */
export function parseCount(text: string): number | null {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return null;
  // «1.000» es mil; «2,5» y «2.5» son dos y medio.
  const normalized = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 1000) / 1000 : null;
}

/** La llave del borrador en el teléfono: uno por negocio (el conteo que tienes a medias). */
export const countDraftKey = (entityId: string) => `inv-count-${entityId}`;

/** El borrador del conteo que el teléfono guarda mientras cuentas (para seguir si te interrumpen). */
export interface CountDraft {
  v: 1;
  clientId: string;
  tab: 'product' | 'supply';
  section: string;
  startedAt: string;
  rows: CountRow[];
  entries: Record<string, CountEntry>;
  reasons: Record<string, CountReason>;
}

export function readDraft(raw: string | null): CountDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<CountDraft>;
    if (d.v !== 1 || !d.clientId || !d.section || !Array.isArray(d.rows) || (d.tab !== 'product' && d.tab !== 'supply')) return null;
    return { v: 1, clientId: d.clientId, tab: d.tab, section: d.section, startedAt: d.startedAt ?? '', rows: d.rows, entries: d.entries ?? {}, reasons: d.reasons ?? {} };
  } catch {
    return null;
  }
}
