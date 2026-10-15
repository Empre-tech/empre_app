// Lógica pura del perfil del negocio: chips de estado, franja «Lo último» y
// barras de reseñas. Sin React para poder probarla con Node.

export const LATEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const LATEST_MAX = 3;
/** Debajo de este número de canjes, «N canjes esta semana» no convence a nadie. */
export const ACTIVITY_MIN = 3;

export interface StatusChip {
  key: 'open' | 'closed' | 'availability' | 'activity';
  label: string;
}

export function activityLabel(count: number): string | null {
  if (!Number.isFinite(count) || count < ACTIVITY_MIN) return null;
  return `${count} canjes esta semana`;
}

/** Abierto/cerrado (solo si hay horario), disponibilidad vigente y prueba social. */
export function statusChips(input: {
  hasHours: boolean;
  isOpen: boolean;
  availability?: string | null;
  weekRedemptions?: number;
}): StatusChip[] {
  const chips: StatusChip[] = [];
  if (input.hasHours) chips.push({ key: input.isOpen ? 'open' : 'closed', label: input.isOpen ? 'Abierto ahora' : 'Cerrado ahora' });
  const availability = input.availability?.trim();
  if (availability) chips.push({ key: 'availability', label: availability });
  const activity = activityLabel(input.weekRedemptions ?? 0);
  if (activity) chips.push({ key: 'activity', label: activity });
  return chips;
}

export interface LatestItem {
  key: string;
  kind: 'post' | 'offer' | 'review';
  at: string;
  title: string;
  imageUrl?: string;
}

interface LatestInput {
  photos: { id: string; url: string; caption?: string; created_at?: string }[];
  offers: { id: string; title: string; starts_at: string }[];
  reviews: { id: string; comment: string; created_at: string; verified?: boolean; user: { name: string } }[];
  now: number;
}

/** Lo que cambió en los últimos 7 días, lo más nuevo primero, hasta 3. Vacío = la franja no se dibuja. */
export function buildLatest({ photos, offers, reviews, now }: LatestInput): LatestItem[] {
  const items: LatestItem[] = [];
  const fresh = (iso?: string) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t <= now && now - t <= LATEST_WINDOW_MS;
  };
  for (const p of photos) {
    if (fresh(p.created_at)) items.push({ key: `post-${p.id}`, kind: 'post', at: p.created_at!, title: p.caption?.trim() || 'Nueva publicación', imageUrl: p.url });
  }
  for (const o of offers) {
    if (fresh(o.starts_at)) items.push({ key: `offer-${o.id}`, kind: 'offer', at: o.starts_at, title: o.title });
  }
  for (const r of reviews) {
    if (r.verified && fresh(r.created_at)) {
      items.push({ key: `review-${r.id}`, kind: 'review', at: r.created_at, title: r.comment.trim() || `Reseña de ${r.user.name}` });
    }
  }
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return items.slice(0, LATEST_MAX);
}

export interface RatingBar {
  stars: number;
  count: number;
  /** 0..1 respecto a la calificación más repetida. */
  ratio: number;
}

/** De 5 a 1 estrellas. `distribution[0]` es 1 estrella. Sin datos devuelve []. */
export function ratingBars(distribution?: number[] | null): RatingBar[] {
  if (!distribution || distribution.length !== 5) return [];
  const max = Math.max(...distribution);
  if (max <= 0) return [];
  return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: distribution[stars - 1], ratio: distribution[stars - 1] / max }));
}

export function verifiedLabel(verified: number, total: number): string | null {
  if (verified <= 0 || total <= 0) return null;
  return verified === 1 ? '1 reseña con canje verificado' : `${verified} reseñas con canje verificado`;
}
