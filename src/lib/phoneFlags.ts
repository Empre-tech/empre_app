import * as FileSystem from 'expo-file-system/legacy';

const FILE = `${FileSystem.documentDirectory ?? ''}phone-flags.json`;
type Flags = Record<string, string>;

async function read(): Promise<Flags> {
  if (!FileSystem.documentDirectory) return {};
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return {};
    const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    return raw && typeof raw === 'object' ? (raw as Flags) : {};
  } catch {
    return {};
  }
}

/** Lo que este teléfono recuerda: consejos ya vistos, el negocio activo. Si falla, se comporta como la primera vez. */
export async function getPhoneFlag(key: string): Promise<string | null> {
  return (await read())[key] ?? null;
}

export async function setPhoneFlag(key: string, value: string): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    const flags = await read();
    flags[key] = value;
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(flags));
  } catch {
    // No guardarlo solo hace que el consejo salga otra vez.
  }
}
