import * as FileSystem from 'expo-file-system/legacy';

// Negocios que ya completaron «Haz que tu negocio destaque» y vieron la despedida (3.40): la lista no vuelve a
// mostrarse mientras sigan completos. Se guarda en el teléfono, como la guía de Explorar.
const FILE = `${FileSystem.documentDirectory ?? ''}growth_done.json`;

export async function loadCelebrated(): Promise<Set<string>> {
  if (!FileSystem.documentDirectory) return new Set();
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return new Set();
    const ids = JSON.parse(await FileSystem.readAsStringAsync(FILE))?.ids;
    return new Set(Array.isArray(ids) ? ids.filter((x: unknown): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function saveCelebrated(ids: Set<string>): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify({ ids: [...ids] }));
  } catch {
    // Si no se puede guardar, la despedida podría repetirse una vez: no es grave.
  }
}
