// Caché de los últimos pines: al abrir la app salen al instante y se actualizan en cuanto llega la
// respuesta del servidor. Sin React ni archivos para poder probarlo con Node.

/** Cambia si cambia la forma de lo guardado: un archivo de otra versión se ignora. */
export const PINS_CACHE_VERSION = 1;
/** Lo guardado más viejo que esto no se muestra (el estado «abierto» y las ofertas cambian). */
export const PINS_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Tope de negocios guardados. */
export const PINS_CACHE_MAX_ITEMS = 60;

interface CachedPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface PinsCacheFile<T> {
  v: number;
  savedAt: number;
  items: T[];
}

/** Lo que se guarda: los primeros negocios con ubicación, en el orden recibido. */
export function packPins<T extends CachedPin>(items: T[], now: number): string {
  const withPlace = items.filter((i) => !(i.latitude === 0 && i.longitude === 0));
  const file: PinsCacheFile<T> = { v: PINS_CACHE_VERSION, savedAt: now, items: withPlace.slice(0, PINS_CACHE_MAX_ITEMS) };
  return JSON.stringify(file);
}

function isPin(value: unknown): value is CachedPin {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.latitude === 'number' &&
    typeof p.longitude === 'number' &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    !(p.latitude === 0 && p.longitude === 0)
  );
}

/**
 * Negocios guardados, o null si no hay nada utilizable: sin archivo, JSON dañado, otra versión,
 * demasiado viejo o con fecha futura (el reloj cambió). Los elementos inválidos se descartan.
 */
export function unpackPins<T extends CachedPin>(raw: string | null, now: number): T[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const f = parsed as Record<string, unknown>;
  if (f.v !== PINS_CACHE_VERSION || typeof f.savedAt !== 'number' || !Array.isArray(f.items)) return null;
  const age = now - f.savedAt;
  if (age < 0 || age > PINS_CACHE_MAX_AGE_MS) return null;
  const items = f.items.filter(isPin) as T[];
  return items.length > 0 ? items.slice(0, PINS_CACHE_MAX_ITEMS) : null;
}

/** ¿Cambió lo que se guardaría? Evita reescribir el archivo con los mismos negocios. */
export function sameIds(a: { id: string }[], b: { id: string }[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i]?.id);
}
