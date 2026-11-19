import type { MarketItem } from './offerMarket';

/**
 * Inicio y Ofertas se pasan la mano (2026-11-14): lo que tocas en el muro de Inicio se abre en Ofertas, con su media
 * hoja («Para decidir», Empre AI). Inicio deja aquí el producto y Ofertas lo toma al enfocarse. Solo en memoria.
 */
let pending: MarketItem | null = null;

export function handOffItem(item: MarketItem): void {
  pending = item;
}

/** Lo que dejó Inicio, una sola vez. */
export function takeHandoff(): MarketItem | null {
  const item = pending;
  pending = null;
  return item;
}
