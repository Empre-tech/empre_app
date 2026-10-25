import * as FileSystem from 'expo-file-system/legacy';

import type { MarketRoute } from './offerBarrio';

// Rutas guardadas en el teléfono (3.50): la ruta tal como se vio, con lo que ya se reclamó y lo que la persona dijo
// «ahora no». Al abrir Ofertas cerca de una parada pendiente, aparece el aviso «Llegaste a…». Sirven el mismo día:
// las de días anteriores se borran solas.

export interface SavedRoute {
  key: string;
  title: string;
  route: MarketRoute;
  savedAt: number;
  /** Ids de oferta ya reclamadas desde la ruta o desde el aviso. */
  claimed: string[];
  /** Ids de oferta con «Ahora no» (no se vuelve a avisar por ellas). */
  dismissed: string[];
}

const FILE = `${FileSystem.documentDirectory ?? ''}saved_routes.json`;
const MAX_AGE_MS = 18 * 3_600_000;

export const routeKey = (r: MarketRoute) => r.stops.map((s) => s.id).join('|');

export async function loadRoutes(now = Date.now()): Promise<SavedRoute[]> {
  if (!FileSystem.documentDirectory) return [];
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return [];
    const list = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    return Array.isArray(list) ? (list as SavedRoute[]).filter((r) => now - r.savedAt < MAX_AGE_MS) : [];
  } catch {
    return [];
  }
}

async function write(list: SavedRoute[]): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(list));
  } catch {
    // Sin guardar, solo se pierde el aviso al llegar: la ruta sigue en Ofertas.
  }
}

export async function saveRoute(route: MarketRoute, title: string, claimed: string[] = []): Promise<SavedRoute[]> {
  const list = await loadRoutes();
  const key = routeKey(route);
  const old = list.find((r) => r.key === key);
  const next: SavedRoute = { key, title, route, savedAt: Date.now(), claimed: [...new Set([...(old?.claimed ?? []), ...claimed])], dismissed: old?.dismissed ?? [] };
  const out = [next, ...list.filter((r) => r.key !== key)].slice(0, 5);
  await write(out);
  return out;
}

export async function updateRoute(key: string, change: { claimed?: string; dismissed?: string }): Promise<SavedRoute[]> {
  const list = await loadRoutes();
  const out = list.map((r) =>
    r.key !== key
      ? r
      : {
          ...r,
          claimed: change.claimed ? [...new Set([...r.claimed, change.claimed])] : r.claimed,
          dismissed: change.dismissed ? [...new Set([...r.dismissed, change.dismissed])] : r.dismissed,
        },
  );
  await write(out);
  return out;
}

export async function removeRoute(key: string): Promise<SavedRoute[]> {
  const out = (await loadRoutes()).filter((r) => r.key !== key);
  await write(out);
  return out;
}
