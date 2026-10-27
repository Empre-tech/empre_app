// Cuentas abiertas (fase 8), sin React: cómo se ve la lista de cuentas sumando lo que todavía no sale del teléfono.
// Se prueba con `node --test` (ver tabs.test.ts).

export interface TabLineLike {
  id: string;
  item_id?: string | null;
  name: string;
  qty: number;
  unit_price: number;
  removed: boolean;
}

export interface TabLike {
  id: string;
  name: string;
  status: string;
  opened_at: string;
  lines: TabLineLike[];
  total: number;
  /** Abierta o cambiada en el teléfono y todavía sin enviar. */
  pending?: boolean;
}

interface QueueLike {
  entityId: string;
  kind: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'failed';
  createdAt: number;
}

/** Total de una cuenta: lo pedido que no se quitó. */
export function tabTotal(lines: TabLineLike[]): number {
  return lines.reduce((s, l) => (l.removed ? s : s + Math.round(l.qty * l.unit_price)), 0);
}

/**
 * Las cuentas como las ve el dueño: las del servidor más lo que hizo sin señal (abrir, agregar, quitar, cobrar o
 * cancelar), en el orden en que lo hizo. Lo que el servidor rechazó no se aplica.
 */
export function projectTabs(server: TabLike[], queue: QueueLike[], entityId: string): TabLike[] {
  const tabs = new Map<string, TabLike>(server.map((t) => [t.id, { ...t, lines: t.lines.map((l) => ({ ...l })) }]));
  const ops = queue.filter((q) => q.entityId === entityId && q.status === 'pending' && q.kind.startsWith('tab_')).sort((a, b) => a.createdAt - b.createdAt);
  for (const op of ops) {
    const p = op.payload;
    const tabId = String(op.kind === 'tab_open' ? p.id : p.tab_id);
    const tab = tabs.get(tabId);
    switch (op.kind) {
      case 'tab_open':
        if (!tab) tabs.set(tabId, { id: tabId, name: String(p.name ?? ''), status: 'open', opened_at: new Date(op.createdAt).toISOString(), lines: [], total: 0, pending: true });
        break;
      case 'tab_add':
        if (tab) {
          for (const l of (p.lines as TabLineLike[] | undefined) ?? []) {
            if (!tab.lines.some((x) => x.id === l.id)) tab.lines.push({ ...l, removed: false });
          }
          tab.pending = true;
        }
        break;
      case 'tab_remove':
        if (tab) {
          tab.lines = tab.lines.map((l) => (l.id === p.line_id ? { ...l, removed: true } : l));
          tab.pending = true;
        }
        break;
      case 'tab_pay':
      case 'tab_cancel':
        tabs.delete(tabId);
        break;
    }
  }
  return [...tabs.values()]
    .filter((t) => t.status === 'open')
    .map((t) => ({ ...t, total: tabTotal(t.lines) }))
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at));
}

/** «hace 25 min», «hace 2 h»: cuánto lleva abierta una cuenta. */
export function openedAgo(openedAt: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(openedAt)) / 60000));
  if (min < 1) return 'recién abierta';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h${min % 60 >= 10 ? ` ${min % 60} min` : ''}`;
}

/** La siguiente mesa libre para sugerir: «Mesa 4» si están abiertas la 1, 2 y 3. */
export function nextTableName(open: { name: string }[], word = 'Mesa'): string {
  const used = new Set(open.map((t) => t.name.trim().toLowerCase()));
  for (let n = 1; n < 500; n++) if (!used.has(`${word.toLowerCase()} ${n}`)) return `${word} ${n}`;
  return word;
}
