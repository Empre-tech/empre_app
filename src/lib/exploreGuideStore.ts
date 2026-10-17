import * as FileSystem from 'expo-file-system/legacy';

// Si la guía de Explorar ya se vio (se guarda en el teléfono, como la cola de subidas).
const FILE = `${FileSystem.documentDirectory ?? ''}explore_guide.json`;

/** true si ya se vio; false si no; si no se puede leer, true (mejor no insistir que repetirla). */
export async function loadGuideSeen(): Promise<boolean> {
  if (!FileSystem.documentDirectory) return true;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return false;
    return Boolean(JSON.parse(await FileSystem.readAsStringAsync(FILE))?.seen);
  } catch {
    return true;
  }
}

export async function saveGuideSeen(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify({ seen: true }));
  } catch {
    // Si no se puede guardar, la guía volverá a salir la próxima vez: no es grave.
  }
}
