// Ayuda para decidir al publicar una oferta, a partir de las estadísticas que da el servidor (solo el dueño).
// Lógica pura, sin React, para probarla con Node. Las reglas y los mínimos viven en el servidor: aquí solo se
// eligen y se redactan las pistas para cada campo, siempre en pasado y sin rellenar nada solas.

interface StatLike {
  offer_id: string;
  title: string;
  type: string;
  ended: boolean;
  views: number;
  claims: number;
  redeemed: number;
  filled_minutes?: number;
  total_slots: number;
  hour: number;
  weekday: number;
  duration_minutes: number;
  special_price?: number;
}

interface SummaryLike {
  enough: boolean;
  best_offer_id?: string;
  prefer_band?: string;
  prefer_short: boolean;
  insights: { kind: string; text: string }[];
}

export interface Hint {
  text: string;
  /** true: invita a cambiar lo elegido; false: confirma o informa. */
  warn: boolean;
}

/** Hasta cuánto dura una oferta corta (igual que el servidor). */
export const SHORT_MINUTES = 120;

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** La franja del día de una hora (igual que el servidor). */
export function band(hour: number): 'mañana' | 'tarde' | 'noche' {
  return hour < 12 ? 'mañana' : hour < 19 ? 'tarde' : 'noche';
}

/** La mejor oferta terminada, si el servidor la eligió (solo con datos suficientes). */
export function bestOffer<T extends StatLike>(stats: T[], summary: SummaryLike | undefined): T | null {
  if (!summary?.enough || !summary.best_offer_id) return null;
  return stats.find((s) => s.offer_id === summary.best_offer_id && s.ended) ?? null;
}

/** Las mejores terminadas (para «Tus mejores ofertas»): más canjes primero; hasta 3 y solo con datos suficientes. */
export function topOffers<T extends StatLike>(stats: T[], summary: SummaryLike | undefined, max = 3): T[] {
  if (!summary?.enough) return [];
  return stats
    .filter((s) => s.ended && s.redeemed > 0)
    .sort((a, b) => b.redeemed - a.redeemed || b.views - a.views)
    .slice(0, max);
}

/** Pista para la duración elegida (minutos), solo si las cortas agotaron más cupos. */
export function durationHint(summary: SummaryLike | undefined, minutes: number): Hint | null {
  if (!summary?.enough || !summary.prefer_short) return null;
  const text = summary.insights.find((i) => i.kind === 'duration')?.text;
  if (minutes > SHORT_MINUTES) return { text: `${text ?? 'Las de 2 h o menos agotaron más cupos.'} Puedes probar 2 h.`, warn: true };
  return text ? { text, warn: false } : null;
}

/** Pista para los cupos: compara con los reclamos de la mejor oferta. */
export function slotsHint(best: StatLike | null, slots: number): Hint | null {
  if (!best) return null;
  if (slots > best.claims + 4) return { text: `Tu mejor oferta tuvo ${best.claims} reclamos; con ${slots} cupos quizá sobren.`, warn: true };
  if (best.filled_minutes !== undefined && slots <= best.total_slots) return { text: `Tu mejor oferta agotó sus ${best.total_slots} cupos en ${best.filled_minutes} min.`, warn: false };
  return { text: `Tu mejor oferta tuvo ${best.claims} reclamos.`, warn: false };
}

/** Pista para la hora: las ofertas empiezan al publicar; se dice qué franja funcionó mejor. */
export function bandHint(summary: SummaryLike | undefined, nowHour: number): Hint | null {
  if (!summary?.enough || !summary.prefer_band) return null;
  const now = band(nowHour);
  if (now === summary.prefer_band) return { text: `Buen momento: en tus ofertas pasadas funcionó mejor la ${summary.prefer_band}.`, warn: false };
  return { text: `Empieza ahora (${now}). En tus ofertas pasadas funcionó mejor la ${summary.prefer_band}.`, warn: true };
}

/** Cupos sugeridos (la ★): los reclamos de la mejor oferta, redondeados hacia arriba a 5. */
export function suggestedSlots(best: StatLike | null): number | null {
  if (!best || best.claims <= 0) return null;
  return Math.max(5, Math.ceil(best.claims / 5) * 5);
}

export type Trend = 'up' | 'down' | 'same';

/** Compara un valor con el promedio propio: más del 15 % arriba o abajo cuenta; si no, «igual». */
export function trend(value: number, average: number): Trend {
  if (average <= 0) return value > 0 ? 'up' : 'same';
  const r = value / average;
  return r > 1.15 ? 'up' : r < 0.85 ? 'down' : 'same';
}

/** Promedios de las terminadas (canjes por oferta y reclamos por vista). */
export function averages(stats: StatLike[]): { redeemed: number; claimRate: number } {
  const done = stats.filter((s) => s.ended);
  if (done.length === 0) return { redeemed: 0, claimRate: 0 };
  const views = done.reduce((a, s) => a + s.views, 0);
  const claims = done.reduce((a, s) => a + s.claims, 0);
  return { redeemed: done.reduce((a, s) => a + s.redeemed, 0) / done.length, claimRate: views ? claims / views : 0 };
}

/** De la vista al canje, en porcentajes: reclamos por vista y canjes por reclamo (0 si no hay base). */
export function funnel(s: StatLike): { claimRate: number; redeemRate: number } {
  return { claimRate: s.views ? Math.round((s.claims / s.views) * 100) : 0, redeemRate: s.claims ? Math.round((s.redeemed / s.claims) * 100) : 0 };
}

/** Una idea para la próxima vez, según cómo le fue a esta oferta. */
export function nextTimeIdea(s: StatLike, summary: SummaryLike | undefined): string {
  if (!summary?.enough) return 'Cuando tengas 3 ofertas terminadas podremos compararlas.';
  if (s.filled_minutes !== undefined) return `Se agotó en ${s.filled_minutes} min: puedes probar con más cupos o repetirla a la misma hora (${DAYS[s.weekday]} a las ${s.hour}:00).`;
  if (s.claims < s.total_slots / 2) {
    if (summary.prefer_band && band(s.hour) !== summary.prefer_band) return `Sobraron cupos. En tus ofertas pasadas funcionó mejor la ${summary.prefer_band}.`;
    if (summary.prefer_short && s.duration_minutes > SHORT_MINUTES) return 'Sobraron cupos. En tus ofertas pasadas, las de 2 h o menos agotaron más.';
    return 'Sobraron cupos: puedes probar con menos cupos o un título más claro.';
  }
  return 'Le fue cerca de tu promedio.';
}
