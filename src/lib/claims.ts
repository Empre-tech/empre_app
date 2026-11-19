import type { ClaimStatus, OfferClaim } from '@/api/types';

/**
 * Estado que ve el usuario: un reclamo abierto cuya ventana ya pasó es EXPIRADO,
 * aunque el servidor todavía no lo haya marcado (o no haya conexión para saberlo).
 */
export function effectiveClaimStatus(claim: Pick<OfferClaim, 'status' | 'expires_at'>, now: number): ClaimStatus {
  if (claim.status === 'RECLAMADO' && new Date(claim.expires_at).getTime() <= now) return 'EXPIRADO';
  return claim.status;
}

/**
 * Une los reclamos del servidor con los guardados en el teléfono. Si un reclamo
 * está en los dos, manda el del servidor (es el que sabe si ya se canjeó).
 * El resultado va del más nuevo al más viejo.
 */
export function mergeClaims(remote: OfferClaim[], local: OfferClaim[]): OfferClaim[] {
  const byId = new Map<string, OfferClaim>();
  for (const claim of local) byId.set(claim.id, claim);
  for (const claim of remote) byId.set(claim.id, claim);
  return [...byId.values()].sort((a, b) => Date.parse(b.claimed_at) - Date.parse(a.claimed_at));
}

/**
 * El reclamo que hay que mostrar al volver a entrar a una oferta: el más
 * reciente que no se canceló. Un reclamo cancelado no cuenta: la persona
 * liberó el cupo a propósito y puede empezar de nuevo.
 */
export function claimToShowForOffer(claims: OfferClaim[], offerId: string): OfferClaim | undefined {
  return claims
    .filter((c) => c.offer_id === offerId && c.status !== 'CANCELADO')
    .sort((a, b) => Date.parse(b.claimed_at) - Date.parse(a.claimed_at))[0];
}

/** Cuándo cuenta un canje: cuando se canjeó, o cuando se reclamó si aún no. */
export const claimDate = (c: OfferClaim): string => c.redeemed_at ?? c.claimed_at;

/** Lo que se ahorró en un canje: solo si la oferta trae los dos precios. */
export function savedIn(c: OfferClaim): number {
  const { reference_price: was, special_price: now } = c.offer ?? {};
  return was && now && was > now ? was - now : 0;
}

/** Lo del mes (tablero «Para el cliente»): cuántas salidas canjeadas y cuánto ahorró desde el día 1. */
export function monthSummary(claims: OfferClaim[], now: number): { outings: number; saved: number } {
  const month = monthClaims(claims, now);
  return { outings: month.length, saved: month.reduce((s, c) => s + savedIn(c), 0) };
}

/** Los canjes de este mes (desde el día 1): los hechos detrás de «salidas este mes» y «ahorrados». */
export function monthClaims(claims: OfferClaim[], now: number): OfferClaim[] {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return claims.filter((c) => effectiveClaimStatus(c, now) === 'CANJEADO' && Date.parse(claimDate(c)) >= start.getTime());
}
