import * as FileSystem from 'expo-file-system/legacy';

const FILE = `${FileSystem.documentDirectory ?? ''}search-recents.json`;
const MAX = 6;

/** Lo último que buscaste, solo en este teléfono. */
export async function loadRecents(): Promise<string[]> {
  if (!FileSystem.documentDirectory) return [];
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return [];
    const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** La lista con esta búsqueda de primera; también la guarda. */
export function addRecent(list: string[], q: string): string[] {
  const clean = q.trim();
  if (!clean) return list;
  const next = [clean, ...list.filter((x) => x.toLowerCase() !== clean.toLowerCase())].slice(0, MAX);
  saveRecents(next);
  return next;
}

export function saveRecents(list: string[]) {
  if (FileSystem.documentDirectory) void FileSystem.writeAsStringAsync(FILE, JSON.stringify(list)).catch(() => undefined);
}
