import type { AskFilters } from '@/api/ask';

/** Los atajos grandes del inicio: lo que más se busca en un barrio. */
export const QUICK_ASKS = ['Almorzar cerca', 'Algo en oferta', 'Cortarme el pelo', 'Una droguería', 'Arreglar la moto'] as const;

export type SuggestionAction =
  | { kind: 'filter'; filter: keyof AskFilters }
  | { kind: 'map' }
  | { kind: 'categories' }
  | { kind: 'ask'; text: string };

/** Qué hace cada sugerencia que devuelve el servidor. */
export function suggestionAction(label: string): SuggestionAction {
  switch (label) {
    case 'Solo abiertos':
      return { kind: 'filter', filter: 'open_now' };
    case 'Solo con oferta':
      return { kind: 'filter', filter: 'with_offer' };
    case 'Que tenga domicilio':
      return { kind: 'filter', filter: 'delivery' };
    case 'El más barato':
      return { kind: 'filter', filter: 'cheapest' };
    case 'Verlos en el mapa':
      return { kind: 'map' };
    case 'Ver categorías':
      return { kind: 'categories' };
    default:
      return { kind: 'ask', text: label };
  }
}

/** Las condiciones activas como fichas que se quitan con un toque («abierto ×»). */
export function filterChips(f: AskFilters): { key: keyof AskFilters; label: string }[] {
  const out: { key: keyof AskFilters; label: string }[] = [];
  if (f.open_now) out.push({ key: 'open_now', label: 'abierto' });
  if (f.with_offer) out.push({ key: 'with_offer', label: 'con oferta' });
  if (f.delivery) out.push({ key: 'delivery', label: 'a domicilio' });
  if (f.cheapest) out.push({ key: 'cheapest', label: 'lo más barato' });
  return out;
}

/** «a 3 min», «a 1,2 km» (a pie hasta 20 minutos; si no, en km). */
export function howFar(minutes: number, km: number): string {
  if (minutes <= 20) return `a ${minutes} min`;
  return `a ${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}
