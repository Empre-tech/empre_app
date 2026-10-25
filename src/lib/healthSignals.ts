// Qué se reporta de la salud de la app (3.53), sin React ni red para probarlo con Node. Solo lo que sirve para ver
// problemas: peticiones lentas o fallidas (la ruta como plantilla, nunca ids ni datos de la persona), con tope por
// ruta para no inundar la medición.

/** Más que esto y la petición cuenta como lenta. */
export const SLOW_MS = 3_000;
/** Como mucho un reporte por ruta en este tiempo. */
export const REPORT_WINDOW_MS = 60_000;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * La ruta como plantilla: los ids (uuid o números) se cambian por «:id» y se quita la consulta. Así
 * «/api/entities/0eee…/ledger/summary?period=day» queda «/api/entities/:id/ledger/summary», igual que en el backend.
 */
export function normalizeRoute(path: string): string {
  const clean = path.split('?')[0] ?? '';
  return clean
    .replace(UUID_RE, ':id')
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) ? ':id' : seg))
    .join('/')
    .slice(0, 80);
}

/** ¿Vale la pena reportarla? Sin respuesta (0), error del servidor (5xx) o lenta. Un 4xx es una respuesta normal. */
export function shouldReport(status: number, ms: number): boolean {
  return status === 0 || status >= 500 || ms >= SLOW_MS;
}

/** Deja pasar un reporte por clave cada `windowMs`. */
export function createThrottle(windowMs: number = REPORT_WINDOW_MS) {
  const last = new Map<string, number>();
  return (key: string, now: number): boolean => {
    const prev = last.get(key);
    if (prev !== undefined && now - prev < windowMs) return false;
    last.set(key, now);
    return true;
  };
}

/** El mensaje de un error, corto y sin cifras largas (un teléfono, un documento) ni correos. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message || error.name : String(error);
  return raw
    .replace(/\S+@\S+/g, '[correo]')
    .replace(/\d{6,}/g, '[número]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
