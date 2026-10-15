// Lógica pura de Novedades (negocios que sigues): franja de una fila y lista
// agrupada por día. Sin React para poder probarla con Node.

export interface NovedadItem {
  kind: 'post' | 'offer';
  id: string;
  entity_id: string;
  entity_name: string;
  entity_profile_url?: string;
  at: string;
  title: string;
  unseen: boolean;
}

export interface StripEntry {
  entityId: string;
  name: string;
  profileUrl?: string;
  /** Aro: ámbar = oferta nueva, azul = publicación nueva, ninguno = visto. */
  ring: 'offer' | 'post' | 'none';
  latestAt: string;
}

/** Un círculo por negocio: primero los que tienen algo sin ver (ofertas antes que publicaciones), luego los vistos. */
export function stripEntries(items: NovedadItem[]): StripEntry[] {
  const byEntity = new Map<string, StripEntry>();
  for (const item of items) {
    const ring: StripEntry['ring'] = item.unseen ? item.kind : 'none';
    const current = byEntity.get(item.entity_id);
    if (!current) {
      byEntity.set(item.entity_id, { entityId: item.entity_id, name: item.entity_name, profileUrl: item.entity_profile_url, ring, latestAt: item.at });
      continue;
    }
    // Un negocio con una oferta sin ver gana a uno con solo publicaciones sin ver.
    if (rank(ring) > rank(current.ring)) current.ring = ring;
    if (Date.parse(item.at) > Date.parse(current.latestAt)) current.latestAt = item.at;
  }
  return [...byEntity.values()].sort((a, b) => rank(b.ring) - rank(a.ring) || Date.parse(b.latestAt) - Date.parse(a.latestAt));
}

function rank(ring: StripEntry['ring']): number {
  return ring === 'offer' ? 2 : ring === 'post' ? 1 : 0;
}

export interface DaySection {
  label: string;
  items: NovedadItem[];
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** «Hoy», «Ayer» o «12 oct», de lo más nuevo a lo más viejo. */
export function dayLabel(iso: string, now: number): string {
  const day = startOfDay(Date.parse(iso));
  const today = startOfDay(now);
  const diff = Math.round((today - day) / 86_400_000);
  if (diff <= 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  const d = new Date(Date.parse(iso));
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function groupByDay(items: NovedadItem[], now: number): DaySection[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const sections: DaySection[] = [];
  for (const item of sorted) {
    const label = dayLabel(item.at, now);
    const last = sections[sections.length - 1];
    if (last && last.label === label) last.items.push(item);
    else sections.push({ label, items: [item] });
  }
  return sections;
}

export function novedadText(item: NovedadItem): string {
  if (item.kind === 'offer') return `Nueva oferta: ${item.title}`;
  return item.title.trim() ? `Nueva publicación: ${item.title.trim()}` : 'Nueva publicación';
}

export function unseenCount(items: NovedadItem[]): number {
  return items.filter((i) => i.unseen).length;
}
