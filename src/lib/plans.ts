import * as FileSystem from 'expo-file-system/legacy';
import type { MarketItem } from '@/lib/offerMarket';

/** Un plan del barrio: lo arma el servidor por cercanía, horario y ofertas de hoy. Ningún negocio paga por salir. */
export interface MarketRoute {
  theme: string;
  level: string;
  zone?: string;
  stops: MarketItem[];
  times: (string | null)[];
  saving: number;
  walk_meters: number;
  total_price: number;
  distance_from_you: number | null;
}

const THEMES: Record<string, string> = {
  pamper: 'Tarde de consentirse',
  errands: 'Día de vueltas',
  active: 'Mañana activa',
  night: 'Noche en el barrio',
  sweet: 'Antojo dulce',
  pet: 'Plan con tu mascota',
};

export function planTitle(r: Pick<MarketRoute, 'theme' | 'zone'>, city?: string): string {
  if (r.theme === 'zone') return `Ruta por ${r.zone || 'tu barrio'}`;
  if (r.theme === 'day') return `Tu día en ${city || 'la ciudad'}`;
  return THEMES[r.theme] ?? 'Plan para hoy';
}

export function planLevel(level: string): string {
  return level === 'walk' ? 'A pie' : level === 'zone' ? 'En tu barrio' : 'Por la ciudad';
}

export const planKey = (r: Pick<MarketRoute, 'stops'>) => r.stops.map((s) => s.id).join('|');

/** Horas de llegada con las paradas en este orden: la primera conserva su hora y las demás van 30 min después más lo caminado. */
export function arrivalTimes(stops: MarketItem[], firstAt: number): number[] {
  const out: number[] = [];
  stops.forEach((s, i) => {
    if (i === 0) {
      out.push(firstAt);
      return;
    }
    const p = stops[i - 1];
    const meters = p.latitude && p.longitude && s.latitude && s.longitude ? metersBetween(p.latitude, p.longitude, s.latitude, s.longitude) : 400;
    out.push(out[i - 1] + (30 + Math.ceil(meters / 80)) * 60_000);
  });
  return out;
}

export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

/** Quién se pasa de su hora: su oferta termina antes de que llegues. */
export function lateStops(stops: MarketItem[], times: number[]): boolean[] {
  return stops.map((s, i) => Date.parse(s.ends_at) < times[i]);
}

export function routeUrl(stops: MarketItem[]): string {
  const at = stops.filter((s) => s.latitude && s.longitude).map((s) => `${s.latitude},${s.longitude}`);
  const dest = at[at.length - 1] ?? '';
  const way = at.slice(0, -1).join('|');
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${encodeURIComponent(dest)}${way ? `&waypoints=${encodeURIComponent(way)}` : ''}`;
}

// ---------- Guardados: solo en este teléfono ----------

const FILE = `${FileSystem.documentDirectory ?? ''}saved-plans.json`;

export async function loadSavedPlans(): Promise<MarketRoute[]> {
  if (!FileSystem.documentDirectory) return [];
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return [];
    const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    return Array.isArray(raw) ? (raw as MarketRoute[]) : [];
  } catch {
    return [];
  }
}

export async function writeSavedPlans(list: MarketRoute[]): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(list));
  } catch {
    // Sin poder guardar, el plan sigue a la vista mientras la pantalla esté abierta.
  }
}
