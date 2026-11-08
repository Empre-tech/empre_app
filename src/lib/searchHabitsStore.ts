import * as FileSystem from 'expo-file-system/legacy';
import { parseHabits, recordSearch, type SearchHabit } from './searchHabits';

const FILE = `${FileSystem.documentDirectory ?? ''}search-habits.json`;

/** Lo que más buscas, solo en este teléfono. Cualquier fallo da una lista vacía. */
export async function loadHabits(): Promise<SearchHabit[]> {
  if (!FileSystem.documentDirectory) return [];
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return [];
    return parseHabits(JSON.parse(await FileSystem.readAsStringAsync(FILE)));
  } catch {
    return [];
  }
}

/** Cuenta una búsqueda más. Guardar es una comodidad: nunca rompe la búsqueda. */
export async function countSearch(q: string): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const next = recordSearch(await loadHabits(), q, Date.now());
  await FileSystem.writeAsStringAsync(FILE, JSON.stringify(next)).catch(() => undefined);
}

/** «Borrar historial» también borra lo que más buscas. */
export function clearHabits() {
  if (FileSystem.documentDirectory) void FileSystem.writeAsStringAsync(FILE, '[]').catch(() => undefined);
}
