// Lo que de verdad se ve del mapa (3.23 y 3.24, mockups `area_util.html` y `referencias_mapa.html`).
// Sin React para poder probarlo con Node.
//
// El mapa ocupa toda la pantalla, pero arriba lo tapan la franja, el buscador y las categorías, y abajo el panel.
// Descubre lista solo lo que queda a la vista (el «área útil»), así nunca nombra negocios escondidos bajo el panel.

import type { Box } from './mapArea';
import { distanceKm, type Coords } from './geo';

export interface RegionLike {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

const round5 = (n: number) => +n.toFixed(5);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Rectángulo de todo el mapa. */
export function regionBox(r: RegionLike): Box {
  return {
    min_lat: round5(r.latitude - r.latitudeDelta / 2),
    max_lat: round5(r.latitude + r.latitudeDelta / 2),
    min_lng: round5(r.longitude - r.longitudeDelta / 2),
    max_lng: round5(r.longitude + r.longitudeDelta / 2),
  };
}

/**
 * El área útil: el rectángulo del mapa sin los `topPx` de arriba ni los `bottomPx` de abajo (en puntos de pantalla).
 * La latitud se reparte en línea recta por la altura: con los acercamientos de la app (unos pocos km) el error de la
 * proyección es despreciable. Sin medidas todavía devuelve el mapa entero.
 */
export function usefulBox(r: RegionLike, mapH: number, topPx: number, bottomPx: number): Box {
  if (mapH <= 0) return regionBox(r);
  const top = clamp(topPx, 0, mapH - 1);
  const bottom = clamp(bottomPx, 0, mapH - top - 1);
  const maxLat = r.latitude + r.latitudeDelta / 2;
  const perPx = r.latitudeDelta / mapH;
  return {
    min_lat: round5(maxLat - (mapH - bottom) * perPx),
    max_lat: round5(maxLat - top * perPx),
    min_lng: round5(r.longitude - r.longitudeDelta / 2),
    max_lng: round5(r.longitude + r.longitudeDelta / 2),
  };
}

/** Punto de la pantalla donde cae una coordenada (puede quedar fuera). */
export function toScreen(r: RegionLike, size: { width: number; height: number }, p: Coords): { x: number; y: number } {
  const x = ((p.longitude - (r.longitude - r.longitudeDelta / 2)) / r.longitudeDelta) * size.width;
  const y = (((r.latitude + r.latitudeDelta / 2) - p.latitude) / r.latitudeDelta) * size.height;
  return { x, y };
}

export interface ViewWindow {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * ¿Hace falta la referencia «Tú» (3.25, mockup `tu_ligero.html`)? Solo explorando otra zona (la franja dice
 * «Explorando», a más de 1 km) y solo si tu punto azul no se ve: fuera del mapa o tapado por lo de arriba o el panel.
 * Estando sobre ti, basta tu punto azul.
 */
export function showYouDot(exploring: boolean, r: RegionLike, size: { width: number; height: number }, user: Coords, win: ViewWindow): boolean {
  if (!exploring || size.height <= 0) return false;
  const p = toScreen(r, size, user);
  return p.x < win.left || p.x > win.right || p.y < win.top || p.y > win.bottom;
}

/** Ángulo de la flecha que va de un punto de la pantalla a otro (grados; 0 = derecha, 90 = abajo). */
export function pointerAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.round((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);
}

/** ¿Alguno de estos negocios quedaría tapado por un panel de `sheetPx`? (para que el mapa acompañe al subirlo). */
export function anyHiddenBelow(r: RegionLike, size: { width: number; height: number }, points: Coords[], sheetPx: number, margin = 24): boolean {
  const limit = size.height - sheetPx - margin;
  return points.some((p) => toScreen(r, size, p).y > limit);
}

/** Los `n` más cercanos a un punto (para «Ver los más cercanos» cuando no hay nada a la vista). */
export function nearestTo<T extends Coords & { id: string }>(items: T[], center: Coords, n: number): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const it of items) {
    if ((it.latitude === 0 && it.longitude === 0) || seen.has(it.id)) continue;
    seen.add(it.id);
    unique.push(it);
  }
  return unique
    .map((it, order) => ({ it, d: distanceKm(center, it), order }))
    .sort((a, b) => a.d - b.d || a.order - b.order)
    .slice(0, n)
    .map((x) => x.it);
}

/** El centro de un rectángulo. */
export function boxCenter(b: Box): Coords {
  return { latitude: (b.min_lat + b.max_lat) / 2, longitude: (b.min_lng + b.max_lng) / 2 };
}

/** Icono de la tarjeta: «Otros» trae «…», que parece un error; se muestra una tienda. */
export function displayIcon(icon: string | null | undefined): string {
  if (!icon || icon.startsWith('ellipsis')) return 'storefront-outline';
  return icon;
}
