// Los avisos de Productos e inventario: lo que se acabó, lo que se acaba pronto, los platos en riesgo y lo que aún no
// lleva control. Lógica pura (sin imports) para probarla con `node --test` (ver alerts.test.ts).

type Status = 'ok' | 'low' | 'out' | 'unknown' | 'none';

export interface AlertSource {
  ref: string;
  item_id?: string;
  name: string;
  kind: 'product' | 'supply';
  mode: string;
  status: Status;
  qty: number;
  unit: string;
  days_left: number | null;
  sold_28: number;
  is_service?: boolean;
  variants?: number;
  servings?: number | null;
  limit?: string;
  ingredients?: { name: string; status: Status }[];
  used_in?: { name: string }[];
  group?: string;
}

export interface Alert<T extends AlertSource = AlertSource> {
  item: T;
  text: string;
}

export interface Alerts<T extends AlertSource = AlertSource> {
  out: Alert<T>[];
  soon: Alert<T>[];
  risk: Alert<T>[];
  /** Productos que aún no llevan control (no cuentan en el total de avisos). */
  unset: number;
  total: number;
}

const qtyText = (q: number) => String(Math.round(q * 1000) / 1000).replace('.', ',');
const perDay = (sold28: number) => Math.max(1, Math.round(sold28 / 28));

export function inventoryAlerts<T extends AlertSource>(items: T[]): Alerts<T> {
  const tracked = (i: T) => (i.mode === 'light' || i.mode === 'exact') && !i.is_service && !(i.variants && i.variants > 0);
  const out: Alert<T>[] = [];
  const soon: Alert<T>[] = [];
  const risk: Alert<T>[] = [];
  let unset = 0;
  for (const i of items) {
    if (i.kind === 'product' && !i.is_service && !(i.variants && i.variants > 0) && i.mode === 'unset') unset++;
    if (tracked(i) && i.status === 'out') {
      const users = i.used_in?.length ?? 0;
      const text =
        i.kind === 'supply'
          ? i.group?.trim() || (users > 0 ? `Lo ${users === 1 ? 'usa 1 producto' : `usan ${users}`}` : 'Insumo')
          : i.sold_28 > 0
            ? `Vendías ~${perDay(i.sold_28)} al día · lo ven agotado`
            : 'Tus clientes lo ven agotado';
      out.push({ item: i, text });
      continue;
    }
    if (tracked(i) && i.status === 'low') {
      let text = 'Queda poco';
      if (i.mode === 'exact') {
        const d = i.days_left;
        text = `Quedan ${qtyText(i.qty)}${d !== null && d !== undefined ? ` · alcanza ~${Math.max(1, Math.floor(d))} ${Math.max(1, Math.floor(d)) === 1 ? 'día' : 'días'}` : ''}`;
      }
      soon.push({ item: i, text });
    }
    if (i.kind === 'product' && !i.is_service && i.status !== 'out') {
      const missing = (i.ingredients ?? []).filter((g) => g.status === 'out').map((g) => g.name);
      if (missing.length > 0) risk.push({ item: i, text: `Falta ${missing.join(', ')}` });
      else if (i.servings !== null && i.servings !== undefined && i.servings < perDay(i.sold_28))
        risk.push({ item: i, text: `Alcanza para ${qtyText(i.servings)}${i.limit ? ` · limita: ${i.limit}` : ''}` });
    }
  }
  out.sort((a, b) => b.item.sold_28 - a.item.sold_28 || a.item.name.localeCompare(b.item.name, 'es'));
  soon.sort((a, b) => (a.item.days_left ?? 999) - (b.item.days_left ?? 999) || a.item.name.localeCompare(b.item.name, 'es'));
  risk.sort((a, b) => a.item.name.localeCompare(b.item.name, 'es'));
  return { out, soon, risk, unset, total: out.length + soon.length + risk.length };
}

/** Separa los avisos en lo que se vende (con los platos en riesgo) y los insumos. */
export function splitAlerts<T extends AlertSource>(a: Alerts<T>): { sell: Alerts<T>; supplies: Alerts<T> } {
  const pick = (sup: boolean) => {
    const out = a.out.filter((x) => (x.item.kind === 'supply') === sup);
    const soon = a.soon.filter((x) => (x.item.kind === 'supply') === sup);
    const risk = sup ? [] : a.risk;
    return { out, soon, risk, unset: sup ? 0 : a.unset, total: out.length + soon.length + risk.length };
  };
  return { sell: pick(false), supplies: pick(true) };
}

/** La pestaña que abre primero: la que tiene algo agotado (si las dos, lo que vendes); si no, la que tenga avisos. */
export function firstTab(s: { sell: Alerts; supplies: Alerts }): 'sell' | 'supplies' {
  if (s.sell.out.length > 0) return 'sell';
  if (s.supplies.out.length > 0) return 'supplies';
  return s.sell.total > 0 || s.supplies.total === 0 ? 'sell' : 'supplies';
}

/** «2 se acabaron · 3 se acaban pronto · 1 plato en riesgo» (por tipo, sin nombrar productos). */
export function alertsLine(a: Alerts, one = 'plato', plural = 'platos'): string {
  return [
    a.out.length ? (a.out.length === 1 ? '1 se acabó' : `${a.out.length} se acabaron`) : null,
    a.soon.length ? (a.soon.length === 1 ? '1 se acaba pronto' : `${a.soon.length} se acaban pronto`) : null,
    a.risk.length ? `${a.risk.length} ${a.risk.length === 1 ? one : plural} en riesgo` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** La lista de compras para mandar por WhatsApp: lo que se acabó y lo que se acaba. */
export function shoppingList(a: Alerts, business?: string): string {
  const lines = [...a.out.map((x) => `• ${x.item.name} (se acabó)`), ...a.soon.map((x) => `• ${x.item.name} (${x.item.mode === 'exact' ? `quedan ${qtyText(x.item.qty)}` : 'queda poco'})`)];
  return [`Lista de compras${business ? ` · ${business}` : ''}`, '', ...lines].join('\n');
}
