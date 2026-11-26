// Empre Pro por dueño, con niveles (2026-11-26, opción A): se compra en Google Play o en la App Store (RevenueCat).
// «Pro 1 negocio», «Pro 2 negocios», «Pro 3 negocios»: el primero vale $39.900 y cada uno más, la mitad. El dueño elige
// qué negocios cubre. Sin imports de la app: corre con `node --test`.

export const MAX_PRO_TIER = 3;
export const PRO_BASE_COP = 39900;
export const PRO_EXTRA_COP = PRO_BASE_COP / 2;

/** El id base de cada nivel en las tiendas (igual que el servidor). En Play puede llegar «empre_pro_1:mensual». */
export const PRO_TIER_PRODUCT: Record<number, string> = { 1: 'empre_pro_1', 2: 'empre_pro_2', 3: 'empre_pro_3' };

export function productBase(id: string): string {
  return id.trim().toLowerCase().split(':')[0];
}

/** El nivel de un producto de la tienda, o 0 si no es de Pro. */
export function tierOfProduct(id: string | null | undefined): number {
  if (!id) return 0;
  const base = productBase(id);
  const hit = Object.entries(PRO_TIER_PRODUCT).find(([, p]) => p === base);
  return hit ? Number(hit[0]) : 0;
}

/** El precio de referencia de un nivel (el real lo muestra la tienda). */
export function tierPriceCOP(tier: number): number {
  return tier < 1 ? 0 : PRO_BASE_COP + (tier - 1) * PRO_EXTRA_COP;
}

export function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CO').replace(/,/g, '.')}`;
}

export function tierTitle(tier: number): string {
  return tier === 1 ? 'Pro · 1 negocio' : `Pro · ${tier} negocios`;
}

/** El nivel que le sirve a quien tiene `businesses` negocios (al menos 1, máximo el más grande). */
export function suggestedTier(businesses: number): number {
  return Math.min(MAX_PRO_TIER, Math.max(1, businesses));
}

/** Cómo cambia el plan al elegir otro nivel: comprar, subir (inmediato), bajar (al renovar) o nada. */
export type TierChange = 'buy' | 'upgrade' | 'downgrade' | 'same';
export function tierChange(current: number, next: number, active: boolean): TierChange {
  if (!active || current < 1) return 'buy';
  if (next === current) return 'same';
  return next > current ? 'upgrade' : 'downgrade';
}

/**
 * Marcar o desmarcar un negocio en la lista de los que cubre el plan. Si ya cubre tantos como su nivel, marcar uno
 * nuevo quita el primero que eligió (así nunca queda en un estado inválido).
 */
export function toggleCoverage(covered: string[], id: string, tier: number): string[] {
  if (covered.includes(id)) return covered.filter((c) => c !== id);
  const next = [...covered, id];
  return next.length > Math.max(1, tier) ? next.slice(next.length - Math.max(1, tier)) : next;
}

/** La línea de estado de un negocio en la pantalla de Pro. */
export function coverageLine(o: { active: boolean; tier: number; covered: boolean; legacy: boolean; periodEnd?: string | null }): string {
  if (o.legacy) return 'Este negocio tiene Empre Pro pagado aparte.';
  if (o.active && o.covered) return `Este negocio está en tu plan ${tierTitle(o.tier)}.`;
  if (o.active) return `Tu plan ${tierTitle(o.tier)} cubre otros negocios. Cámbialo abajo o sube de plan.`;
  return 'Este negocio está en Base · gratis.';
}
