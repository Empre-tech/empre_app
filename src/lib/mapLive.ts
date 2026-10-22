// Mapa vivo (3.41, mockup mapa_vivo.html): el tema del mapa y el pulso de las ofertas nuevas, con datos reales
// (GET /api/zones/activity); nada simula ventas ni afluencia. Sin React para probarlo con Node. El brillo de zonas se
// quitó después de verlo en el teléfono: sobre el mapa real de Google eran manchas que ensuciaban los pines.

export type MapTheme = 'day' | 'night';
export type MapThemePref = MapTheme | 'auto';

export interface ZoneActivity {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  businesses: number;
  has_offers: boolean;
  growing: boolean;
}

export interface FreshOffer {
  offer_id: string;
  entity_id: string;
  latitude: number;
  longitude: number;
  published_at: string;
}

/** «Automático»: noche de 6 p. m. a 6 a. m. (en Santa Marta oscurece hacia las 6). La app está fijada en modo claro,
 * así que no se puede seguir el modo del teléfono sin cambiar toda la interfaz. */
export function resolveTheme(pref: MapThemePref, hour: number): MapTheme {
  if (pref !== 'auto') return pref;
  return hour >= 18 || hour < 6 ? 'night' : 'day';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const PULSE_MS = 1600; // un anillo
export const PULSE_TIMES = 2; // y se detiene
export const PULSE_MAX = 3; // nunca más de tantos a la vez

/** Ofertas que deben hacer pulso ahora: dentro de lo que se ve, que no lo hayan hecho ya, y como mucho 3. */
export function pulseTargets(
  fresh: FreshOffer[],
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
  seen: Set<string>,
): FreshOffer[] {
  const inside = (f: FreshOffer) =>
    Math.abs(f.latitude - region.latitude) <= region.latitudeDelta / 2 && Math.abs(f.longitude - region.longitude) <= region.longitudeDelta / 2;
  return fresh.filter((f) => !seen.has(f.offer_id) && inside(f)).slice(0, PULSE_MAX);
}

/** Un cuadro del pulso a los `t` ms: el anillo crece y se desvanece; después de 2 anillos, null (terminó). */
export function pulseFrame(t: number): { scale: number; alpha: number } | null {
  if (!(t >= 0) || t >= PULSE_MS * PULSE_TIMES) return null;
  const p = (t % PULSE_MS) / PULSE_MS;
  const eased = 1 - Math.pow(1 - p, 3);
  return { scale: 0.4 + 1.6 * eased, alpha: round2(0.85 * (1 - Math.min(1, p / 0.85))) };
}
