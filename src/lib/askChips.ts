import type { AskFilters } from '@/api/ask';

/** Los atajos grandes del inicio: lo que más se busca en un barrio. */
export const QUICK_ASKS = ['Almorzar cerca', 'Algo en oferta', 'Cortarme el pelo', 'Una droguería', 'Arreglar la moto'] as const;

type IdeaIcon = 'cafe-outline' | 'medkit-outline' | 'copy-outline' | 'restaurant-outline' | 'ice-cream-outline' | 'phone-portrait-outline' | 'cut-outline' | 'gift-outline' | 'school-outline' | 'moon-outline' | 'fast-food-outline';

/** Tres ideas para la hora del día (Colombia): cada una abre la búsqueda con esas palabras. */
export function hourIdeas(hour: number): { name: string; label: string; icon: IdeaIcon; ask: string }[] {
  if (hour < 11) return [{ name: 'MAÑANA', label: 'Tinto y desayuno', icon: 'cafe-outline', ask: 'tinto y desayuno' }, { name: 'MAÑANA', label: 'Droguería abierta', icon: 'medkit-outline', ask: 'droguería abierta' }, { name: 'MAÑANA', label: 'Copias', icon: 'copy-outline', ask: 'copias' }];
  if (hour < 15) return [{ name: 'MEDIODÍA', label: 'Corrientazo', icon: 'restaurant-outline', ask: 'corrientazo' }, { name: 'MEDIODÍA', label: 'Algo dulce', icon: 'ice-cream-outline', ask: 'postres' }, { name: 'MEDIODÍA', label: 'Recargas', icon: 'phone-portrait-outline', ask: 'recargas' }];
  if (hour < 19) return [{ name: 'TARDE', label: 'Un corte', icon: 'cut-outline', ask: 'corte de pelo' }, { name: 'TARDE', label: 'Decoración', icon: 'gift-outline', ask: 'decoración para fiestas' }, { name: 'TARDE', label: 'Clases', icon: 'school-outline', ask: 'clases' }];
  return [{ name: 'NOCHE', label: 'Abierto ahora', icon: 'moon-outline', ask: 'abierto ahora' }, { name: 'NOCHE', label: 'Comida rápida', icon: 'fast-food-outline', ask: 'comida rápida' }, { name: 'NOCHE', label: 'Droguería', icon: 'medkit-outline', ask: 'droguería abierta' }];
}

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
