// El aviso de Inventario cuando Empre Finance cambia tus existencias. Lógica pura, para probarla con Node.

export interface NewsSale {
  id: string;
  status: string;
  occurred_at: string;
  lines?: { item_id?: string; name: string; qty: number }[] | null;
}

export interface TrackedItem {
  ids: string[];
  name: string;
  qty: number;
}

export interface StockNews {
  /** La venta más reciente que tocó el inventario: sirve para no repetir el aviso. */
  id: string;
  text: string;
}

/**
 * Lo vendido hoy que descontó existencias y cuánto queda. Solo cuenta lo que se lleva en inventario; los servicios y lo
 * que no se cuenta no cambian nada. Sin novedades desde `seenId`, no hay aviso.
 */
export function stockNews(sales: NewsSale[], tracked: TrackedItem[], seenId: string | null): StockNews | null {
  const byId = new Map<string, TrackedItem>();
  for (const t of tracked) for (const id of t.ids) byId.set(id, t);
  const active = sales.filter((s) => s.status !== 'voided').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const touching = active.filter((s) => (s.lines ?? []).some((l) => l.item_id && byId.has(l.item_id)));
  if (touching.length === 0 || touching[0].id === seenId) return null;
  const sold = new Map<TrackedItem, number>();
  for (const s of touching) {
    if (s.id === seenId) break;
    for (const l of s.lines ?? []) {
      const t = l.item_id ? byId.get(l.item_id) : undefined;
      if (t) sold.set(t, (sold.get(t) ?? 0) + l.qty);
    }
  }
  const parts = [...sold.entries()].map(([t, n]) => `${n} ${t.name} (${t.qty <= 0 ? 'ya no quedan' : t.qty === 1 ? 'queda 1' : `quedan ${t.qty}`})`);
  const shown = parts.slice(0, 2).join(', ');
  const rest = parts.length - 2;
  return { id: touching[0].id, text: `Vendiste ${shown}${rest > 0 ? ` y ${rest} más` : ''}.` };
}
