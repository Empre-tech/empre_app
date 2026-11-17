/**
 * Base y Empre Pro (tablero «Base y Empre Pro», 2026-11-17). Empre Pro va por negocio y se paga con Wompi en Mi negocio >
 * Suscripción. Lo de Pro no desaparece en Base: queda en gris con la corona, y al tocarlo sale «Pásate a Empre Pro».
 * El servidor cierra lo mismo (responde 402 «pro_required»), así que esto solo decide cómo se ve.
 */

export const PRO_PRICE_AMOUNT = '$39.900';
export const PRO_PRICE_UNIT = 'COP / mes';

export interface ProSubscription {
  status: string;
  current_period_end?: string;
}

/** Igual que el servidor: activa y sin vencer. Sin suscripción, el negocio está en Base. */
export function isProSubscription(sub: ProSubscription | null | undefined, now: number = Date.now()): boolean {
  if (!sub || sub.status !== 'active') return false;
  if (!sub.current_period_end) return false;
  const end = Date.parse(sub.current_period_end);
  return Number.isFinite(end) && end > now;
}

/** Lo que Pro suma hoy en la app: solo lo que de verdad está cerrado en Base (nunca se promete lo que ya tienes). */
export interface ProPerk {
  key: 'ai' | 'agenda' | 'count';
  title: string;
  sub: string;
}

export function proPerks({ agenda }: { agenda: boolean }): ProPerk[] {
  return [
    { key: 'ai', title: 'Habla con Empre AI', sub: 'Registra, vende y gasta con tu voz. Con un tope al mes: siempre ves cuánto te queda.' },
    ...(agenda ? [{ key: 'agenda' as const, title: 'Agenda', sub: 'Las citas se apartan solas y te avisan.' }] : []),
    { key: 'count', title: 'Conteo por sección', sub: 'Cuentas una sección y Empre ajusta lo que no cuadra.' },
  ];
}

/** El 402 del servidor: eso es de Empre Pro y el negocio está en Base. */
export function isProRequired(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const status = (e as { status?: unknown }).status;
  return status === 402;
}
