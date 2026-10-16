import * as FileSystem from 'expo-file-system/legacy';

import { packPins, unpackPins } from './pinsCache';

// Un archivo en el teléfono con los últimos negocios del mapa (datos públicos, sin usuario).
// Es una comodidad: cualquier fallo se ignora y nunca debe romper el mapa.
function path(): string | null {
  const dir = FileSystem.documentDirectory;
  return dir ? `${dir}pins-cache.json` : null;
}

interface Pin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** Negocios guardados la última vez, o null. */
export async function loadPinsCache<T extends Pin>(): Promise<T[] | null> {
  const file = path();
  if (!file) return null;
  try {
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists) return null;
    return unpackPins<T>(await FileSystem.readAsStringAsync(file), Date.now());
  } catch {
    return null;
  }
}

export async function savePinsCache<T extends Pin>(items: T[]): Promise<void> {
  const file = path();
  if (!file || items.length === 0) return;
  try {
    await FileSystem.writeAsStringAsync(file, packPins(items, Date.now()));
  } catch {
    // Sin espacio o sin permiso: se sigue sin caché.
  }
}
