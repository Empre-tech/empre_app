// El orden del catálogo al crear una oferta (2026-11-23): primero lo que está quieto (sin ventas, con existencias) y
// después lo que menos se vendió en los últimos 30 días. Una oferta sirve para mover eso. Lo que no tiene datos queda en
// el orden del catálogo. Sin imports de la app: corre con `node --test`.

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function offerOrder<T extends { id: string; name: string }>(items: T[], data?: { idle?: { ref: string; name: string }[]; sold?: { ref: string; name: string; qty: number }[] } | null): { items: T[]; ranked: boolean } {
  if (!data || (!data.idle?.length && !data.sold?.length)) return { items, ranked: false };
  const idle = new Set((data.idle ?? []).flatMap((l) => [l.ref, key(l.name)]));
  const sold = new Map<string, number>();
  for (const p of data.sold ?? []) {
    sold.set(p.ref, p.qty);
    sold.set(key(p.name), p.qty);
  }
  const score = (it: T) => {
    if (idle.has(it.id) || idle.has(key(it.name))) return -1;
    return sold.get(it.id) ?? sold.get(key(it.name)) ?? 0;
  };
  const items2 = items
    .map((it, i) => ({ it, i, s: score(it) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.it);
  return { items: items2, ranked: true };
}
