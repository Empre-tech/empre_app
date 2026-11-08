/**
 * Cuándo sale la bienvenida completa a Empre Finder (3.60): la primera vez de cada día. Las demás veces solo el logo,
 * mientras el mapa termina de llegar.
 */

/** «2026-11-07» en la hora del teléfono. */
export function dayKey(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function fullWelcomeToday(lastShown: string | null, now: Date): boolean {
  return lastShown !== dayKey(now);
}

/** Lo mínimo que se ve la bienvenida completa aunque el mapa llegue antes: menos que esto parpadea. */
export const FULL_MIN_MS = 1500;
/** Si el mapa no llega, la bienvenida se va igual: nunca deja a nadie esperando detrás de ella. */
export const MAX_WAIT_MS = 7000;

/** ¿Ya puede irse? Cuando el mapa está listo y pasó el mínimo, o cuando se agotó la espera. */
export function canLeave({ ready, elapsedMs, full }: { ready: boolean; elapsedMs: number; full: boolean }): boolean {
  if (elapsedMs >= MAX_WAIT_MS) return true;
  return ready && elapsedMs >= (full ? FULL_MIN_MS : 0);
}

/** «5 abiertos a 5 min a pie», «1 abierto cerca» o nada: solo se dice lo que se sabe. */
export function openLine(walkable: number, open: number): string | null {
  if (walkable > 0) return `${walkable} ${walkable === 1 ? 'abierto' : 'abiertos'} a 5 min a pie`;
  if (open > 0) return `${open} ${open === 1 ? 'abierto' : 'abiertos'} cerca`;
  return null;
}
