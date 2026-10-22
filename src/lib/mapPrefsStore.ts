import * as FileSystem from 'expo-file-system/legacy';

import type { MapThemePref } from './mapLive';

// Preferencias del mapa (3.41): el tema (día, noche o automático) y si se ve el brillo de las zonas. Se guardan en el
// teléfono. Por defecto, el mapa queda como hoy: de día y con el brillo encendido (solo se ve de lejos).
export interface MapPrefs {
  theme: MapThemePref;
  zones: boolean;
}

export const DEFAULT_MAP_PREFS: MapPrefs = { theme: 'day', zones: true };
const FILE = `${FileSystem.documentDirectory ?? ''}map_prefs.json`;

export async function loadMapPrefs(): Promise<MapPrefs> {
  if (!FileSystem.documentDirectory) return DEFAULT_MAP_PREFS;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return DEFAULT_MAP_PREFS;
    const raw = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    const theme: MapThemePref = raw?.theme === 'night' || raw?.theme === 'auto' ? raw.theme : 'day';
    return { theme, zones: raw?.zones !== false };
  } catch {
    return DEFAULT_MAP_PREFS;
  }
}

export async function saveMapPrefs(p: MapPrefs): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(p));
  } catch {
    // Si no se guarda, la próxima vez vuelve a lo de siempre: no es grave.
  }
}
