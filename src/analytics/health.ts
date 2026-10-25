import { observeRequests } from '@/api/client';
import { createThrottle, errorMessage, normalizeRoute, shouldReport } from '@/lib/healthSignals';
import { track } from './track';

// Salud de la app (3.53): peticiones lentas o fallidas, el arranque y los errores de pantalla. Van por la misma
// medición anónima de uso (respetan el interruptor «Medición anónima de uso») y el backend los resume en
// /api/admin/health. Nada de esto identifica a la persona: rutas como plantilla y mensajes sin datos.

const allow = createThrottle();
let started = false;
let installed = false;

/** Mide cada petición y reporta las que son un problema. Se llama una vez al abrir la app. */
export function initHealth(): void {
  if (installed) return;
  installed = true;
  observeRequests(({ method, path, status, ms }) => {
    if (path.startsWith('/api/events')) return; // la medición misma no se mide (sería un bucle)
    if (!shouldReport(status, ms)) return;
    const route = `${method} ${normalizeRoute(path)}`;
    if (!allow(route, Date.now())) return;
    track('api_health', undefined, { route, status, ms: Math.min(Math.round(ms), 100_000) });
  });
  // Errores que no atrapa ninguna pantalla: se reportan y luego sigue el manejo de siempre (la pantalla roja en
  // desarrollo, el cierre en producción).
  const g = globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } };
  const prev = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((error, fatal) => {
    reportJsError(error, fatal ? 'global_fatal' : 'global');
    prev?.(error, fatal);
  });
}

/** Un error de pantalla: solo el mensaje (sin datos de la persona) y dónde pasó. */
export function reportJsError(error: unknown, where: string): void {
  track('js_error', undefined, { message: errorMessage(error), where: where.slice(0, 40) });
}

/** Cuánto tardó la app en mostrar la primera pantalla, una vez por arranque. */
export function reportAppStart(ms: number): void {
  if (started || !(ms > 0)) return;
  started = true;
  track('app_start', undefined, { ms: Math.min(Math.round(ms), 100_000) });
}
