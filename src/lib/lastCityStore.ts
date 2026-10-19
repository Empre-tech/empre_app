import * as FileSystem from 'expo-file-system/legacy';

// Última ciudad de la vitrina de ofertas (3.39), guardada en el teléfono. Solo se usa sin ubicación: así la pestaña
// muestra la ciudad donde estuviste la última vez en lugar de ninguna (y nunca una ciudad por defecto).
const FILE = `${FileSystem.documentDirectory ?? ''}last_city.json`;

export async function loadLastCity(): Promise<string> {
  if (!FileSystem.documentDirectory) return '';
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return '';
    const city = JSON.parse(await FileSystem.readAsStringAsync(FILE))?.city;
    return typeof city === 'string' ? city : '';
  } catch {
    return '';
  }
}

export async function saveLastCity(city: string): Promise<void> {
  if (!FileSystem.documentDirectory || !city.trim()) return;
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify({ city: city.trim() }));
  } catch {
    // Si no se puede guardar, sin ubicación se verán todas las ciudades: no es grave.
  }
}
