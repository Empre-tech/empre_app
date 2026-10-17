import { agoLabel } from '@/lib/discover';

/** Desde cuántas reseñas se muestra la nota: con 1 o 2, un 5,0 de una sola persona engaña. */
export const SCORE_MIN_REVIEWS = 3;

/** «★ 4,8 (31)» desde 3 reseñas; con 1 o 2, solo la cantidad; sin reseñas, «Aún sin reseñas» (nunca 0,0). */
export function featuredRating(avg: number | null | undefined, count: number | null | undefined): { text: string; hasScore: boolean } {
  const n = count ?? 0;
  if (n >= SCORE_MIN_REVIEWS && typeof avg === 'number' && avg > 0) return { text: `★ ${avg.toFixed(1).replace('.', ',')} (${n})`, hasScore: true };
  if (n > 0) return { text: n === 1 ? '1 reseña' : `${n} reseñas`, hasScore: false };
  return { text: 'Aún sin reseñas', hasScore: false };
}

/** Lo que devuelve GET /api/discovery/review-snippets por negocio. */
export interface ReviewSnippetData {
  text: string;
  rating: number;
  created_at: string;
  author: string;
  verified: boolean;
}

/** La cita y su firma: «Tardaron…» / «María P. · ★ 2 · Reseña verificada · hace 3 d». */
export function snippetLines(s: ReviewSnippetData, now: number): { quote: string; byline: string } {
  const byline = [s.author, `★ ${s.rating}`, s.verified ? 'Reseña verificada' : 'Reseña', agoLabel(s.created_at, now)].filter(Boolean).join(' · ');
  return { quote: `“${s.text.trim()}”`, byline };
}
