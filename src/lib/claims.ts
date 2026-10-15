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
