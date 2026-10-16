// Nombre de la zona que muestra el panel (F11). Sin React para poder probarlo con Node.
// La tabla de decisión sale del mockup `docs/mockups/busqueda_cercania.html`.
//
// Orden: zona configurada → barrio del teléfono → ciudad. Las zonas son datos por ciudad
// (llegan del servidor); una ciudad sin zonas funciona igual, solo sin «Explora por zona».

import { distanceKm, type Coords } from './geo';

export interface Zone extends Coords {
  id: string;
  name: string;
  /** Ciudad a la que pertenece la zona. */
  city?: string;
  /** Radio de la zona en metros (v1: círculo). */
  radius_m: number;
}

/** Lo que dice el geocodificador del teléfono (`reverseGeocodeAsync`) para un punto. */
export interface GeoName {
  district?: string | null;
  city?: string | null;
}

/** Una zona nueva debe estar al menos un 15 % más cerca que la actual para reemplazarla. */
export const ZONE_HYSTERESIS = 0.85;
/** El mapa «está en ti» si su centro queda a menos de esto de la persona. */
export const NEAR_ME_M = 1000;

export type ZoneReason = 'inside' | 'held' | 'district' | 'no-permission' | 'view-away' | 'other-city';

export interface ZoneName {
  title: string;
  /** Ciudad que acompaña al título; null si el título ya es la ciudad. */
  city: string | null;
  sub: string;
  reason: ZoneReason;
  /** Zona configurada que da el nombre (para recordarla como «anterior»); null si no hay. */
  zone: Zone | null;
  /** Solo hay «Explora por zona» donde hay zonas configuradas para la ciudad. */
  zoneExplore: boolean;
}

export interface ZoneInput {
  /** Zonas de la ciudad y la ciudad a la que pertenecen (null si no hay). */
  zones: Zone[];
  zoneCity: string | null;
  /** Ubicación de la persona; null si no dio permiso. */
  user: Coords | null;
  /** Centro del mapa. */
  view: Coords;
  geo: GeoName;
  /** Zona que dio el nombre la última vez (para no parpadear en el límite). */
  prevZoneId?: string | null;
}

const meters = (a: Coords, b: Coords) => distanceKm(a, b) * 1000;

const sameCity = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

function kmLabel(m: number): string {
  const km = m / 1000;
  if (km < 1) return `${Math.round(m)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Zona que contiene el punto. Con `prevId` se queda en ella salvo que otra esté mucho más cerca. */
export function zoneAt(zones: Zone[], p: Coords, prevId?: string | null): { zone: Zone; held: boolean; other?: Zone } | null {
  const inside = zones
    .map((zone) => ({ zone, d: meters(p, zone) }))
    .filter(({ zone, d }) => d <= zone.radius_m)
    .sort((a, b) => a.d - b.d);
  const best = inside[0];
  if (!best) return null;
  const keep = prevId ? inside.find(({ zone }) => zone.id === prevId) : undefined;
  if (keep && keep.zone.id !== best.zone.id && best.d > keep.d * ZONE_HYSTERESIS) {
    return { zone: keep.zone, held: true, other: best.zone };
  }
  return { zone: best.zone, held: false };
}

/** Radio máximo para considerar que alguien está en una ciudad con zonas. */
const CITY_REACH_KM = 50;

/**
 * De todas las zonas que llegan del servidor, las de la ciudad donde está el punto: la ciudad de
 * la zona más cercana si queda a menos de 50 km; si no, ninguna (otra ciudad o sin zonas).
 */
export function pickCityZones(all: Zone[], point: Coords): { zones: Zone[]; city: string | null } {
  let nearest: Zone | null = null;
  let best = Infinity;
  for (const z of all) {
    if (!z.city) continue;
    const d = distanceKm(point, z);
    if (d < best) {
      best = d;
      nearest = z;
    }
  }
  if (!nearest || best > CITY_REACH_KM) return { zones: [], city: null };
  const city = nearest.city as string;
  return { zones: all.filter((z) => z.city === city), city };
}

/** El título y subtítulo del panel según dónde está la persona y qué mira el mapa. */
export function resolveZoneName(input: ZoneInput): ZoneName {
  const { zones, zoneCity, user, view, geo, prevZoneId } = input;
  const district = geo.district?.trim() || null;
  const city = geo.city?.trim() || null;
  const hasZones = zones.length > 0 && !!zoneCity;
  // En otra ciudad (o una sin zonas) no se inventan zonas: se dice la ciudad del teléfono.
  const otherCity = !hasZones || (!!city && !sameCity(city, zoneCity));
  const near = !!user && meters(user, view) < NEAR_ME_M;

  if (otherCity) {
    return {
      title: city ?? district ?? 'Cerca de ti',
      city: null,
      sub: user ? (near ? 'Cerca de ti' : 'En esta zona') : 'En esta zona',
      reason: 'other-city',
      zone: null,
      zoneExplore: false,
    };
  }

  const ownCity = zoneCity as string;
  const fallback = district ?? ownCity;

  if (!user) {
    const z = zoneAt(zones, view);
    return {
      title: z ? z.zone.name : fallback,
      city: ownCity,
      sub: 'En esta zona · activa tu ubicación para ver distancias',
      reason: 'no-permission',
      zone: z ? z.zone : null,
      zoneExplore: true,
    };
  }

  if (!near) {
    const z = zoneAt(zones, view, prevZoneId);
    return {
      title: z ? z.zone.name : fallback,
      city: ownCity,
      sub: `En esta zona · a ${kmLabel(meters(user, view))} de ti`,
      reason: 'view-away',
      zone: z ? z.zone : null,
      zoneExplore: true,
    };
  }

  const z = zoneAt(zones, user, prevZoneId);
  if (z) {
    return { title: z.zone.name, city: ownCity, sub: 'Cerca de ti', reason: z.held ? 'held' : 'inside', zone: z.zone, zoneExplore: true };
  }
  return { title: fallback, city: ownCity, sub: 'Cerca de ti', reason: 'district', zone: null, zoneExplore: true };
}
