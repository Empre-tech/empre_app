/**
 * Cómo se dice si un negocio está abierto, igual en Inicio y en Empre Finder (2026-11-16): «Abierto · cierra 8 pm»,
 * «Cierra en 40 min» (cuando falta una hora o menos; va en rojo de texto), «Abierto 24 h» o «Cerrado». Antes Inicio
 * decía «Cierra 10 pm» y Finder «Abierto · hasta las 8:00 pm».
 */

export interface OpenStatus {
  text: string;
  /** Cierra en una hora o menos. */
  soon: boolean;
  open: boolean;
}

/** «20:00» → «8 pm»; «20:30» → «8:30 pm». */
export function shortClock(hhmm: string): string | null {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  const mm = Number.isFinite(m) ? m : 0;
  const suffix = h % 24 >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

/** El estado de un negocio ahora. `open` null = sin horario: no se dice nada. */
export function openStatus(open: boolean | null | undefined, closesAt: string | null | undefined, now: number): OpenStatus | null {
  if (open === null || open === undefined) return null;
  if (!open) return { text: 'Cerrado', soon: false, open: false };
  if (closesAt === '24h') return { text: 'Abierto 24 h', soon: false, open: true };
  if (!closesAt) return { text: 'Abierto', soon: false, open: true };
  const clock = shortClock(closesAt);
  if (!clock) return { text: 'Abierto', soon: false, open: true };
  const [h, m] = closesAt.split(':').map(Number);
  const d = new Date(now);
  let left = h * 60 + (m || 0) - (d.getHours() * 60 + d.getMinutes());
  if (left <= 0) left += 24 * 60; // cierra pasada la medianoche
  if (left <= 60) return { text: `Cierra en ${left} min`, soon: true, open: true };
  return { text: `Abierto · cierra ${clock}`, soon: false, open: true };
}
