/**
 * Lo que Agent sabe de ti (tablero «Para el cliente», teléfono 4). No hay una memoria aparte: todo sale de tus citas
 * en Empre, se calcula en el teléfono y se puede pausar por negocio u olvidar. Pausar u olvidar no borra tus citas
 * (siguen en Mis citas): Agent deja de usarlas.
 */

export interface PastAppt {
  entity_id: string;
  entity?: { name: string };
  status: string;
  starts_at: string;
  service_id?: string;
  service?: { id: string; name: string };
}

export interface AgentPrefs {
  paused: string[];
  /** Agent ignora lo de antes de esta fecha (ISO). */
  forgetBefore: string | null;
}

export const NO_PREFS: AgentPrefs = { paused: [], forgetBefore: null };

/** Las citas que Agent puede usar: hechas, de negocios no pausados y después de «olvidar». */
export function usable<T extends PastAppt>(appts: T[], prefs: AgentPrefs): T[] {
  return appts.filter(
    (a) => a.status === 'completed' && !prefs.paused.includes(a.entity_id) && (!prefs.forgetBefore || a.starts_at >= prefs.forgetBefore),
  );
}

export interface Usual {
  entityId: string;
  entityName: string;
  service: string;
  times: number;
}

/** «Lo de siempre» en cada negocio: el servicio que más te has hecho ahí (con 1 basta, si es el único). */
export function usualByBusiness(appts: PastAppt[]): Usual[] {
  const by = new Map<string, Map<string, { name: string; n: number }>>();
  const names = new Map<string, string>();
  for (const a of appts) {
    if (!a.service?.name) continue;
    names.set(a.entity_id, a.entity?.name ?? 'Un negocio');
    const m = by.get(a.entity_id) ?? new Map();
    const cur = m.get(a.service.name) ?? { name: a.service.name, n: 0 };
    cur.n += 1;
    m.set(a.service.name, cur);
    by.set(a.entity_id, m);
  }
  return [...by.entries()]
    .map(([entityId, m]) => {
      const top = [...m.values()].sort((x, y) => y.n - x.n)[0];
      return { entityId, entityName: names.get(entityId) ?? '', service: top.name, times: top.n };
    })
    .sort((a, b) => b.times - a.times);
}

/** «Prefieres las tardes»: solo si 3 de cada 4 citas (o más) caen en la misma parte del día, con al menos 3 citas. */
export function preferredPart(appts: PastAppt[]): { part: 'mañanas' | 'tardes' | 'noches'; of: string } | null {
  if (appts.length < 3) return null;
  const parts = appts.map((a) => {
    const h = new Date(a.starts_at).getHours();
    return h < 12 ? 'mañanas' : h < 18 ? 'tardes' : 'noches';
  });
  for (const p of ['mañanas', 'tardes', 'noches'] as const) {
    const n = parts.filter((x) => x === p).length;
    if (n / parts.length >= 0.75) return { part: p, of: `${n} de ${parts.length} citas` };
  }
  return null;
}
