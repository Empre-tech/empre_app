/**
 * Estado de la conexión (2026-11-22). Sin un módulo nativo de red: lo deciden las propias llamadas a la API.
 * - Una llamada que no llega al servidor (fetch falla) avisa con `reportNetworkFailure()`; una que sí llega,
 *   aunque responda error, avisa con `reportReachable()`.
 * - Mientras no haya conexión, `probeConnectivity()` intenta cada pocos segundos: primero el backend; si no
 *   responde, una dirección de Google para saber si es el internet del celular («offline») o Empre («server»).
 * Este archivo no importa nada de React Native para poder probarlo con node --test.
 */

export type Connectivity = 'online' | 'offline' | 'server';

type Listener = (c: Connectivity) => void;

let current: Connectivity = 'online';
const listeners = new Set<Listener>();

export function getConnectivity(): Connectivity {
  return current;
}

export function setConnectivity(next: Connectivity): void {
  if (next === current) return;
  current = next;
  for (const l of listeners) l(next);
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Una llamada no pudo salir del celular o no llegó al servidor. Se confirma con la prueba antes de mostrar nada. */
export function reportNetworkFailure(): void {
  if (current === 'online') setConnectivity('offline');
}

/** El servidor respondió (con lo que sea): hay conexión. */
export function reportReachable(): void {
  setConnectivity('online');
}

type Fetcher = (url: string, init?: { method?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

/** Dirección que Google responde con 204 y sin contenido: sirve para saber si el celular tiene internet. */
export const INTERNET_PROBE_URL = 'https://clients3.google.com/generate_204';

async function reachable(fetcher: Fetcher, url: string, timeoutMs: number): Promise<boolean> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetcher(url, { method: 'GET', signal: controller?.signal });
    return res.status > 0;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Comprueba la conexión ahora y deja el estado al día. Devuelve el estado resultante.
 * `apiHealthUrl`: el /health del backend.
 */
export async function probeConnectivity(apiHealthUrl: string, fetcher: Fetcher = fetch as unknown as Fetcher, timeoutMs = 5000): Promise<Connectivity> {
  if (await reachable(fetcher, apiHealthUrl, timeoutMs)) {
    setConnectivity('online');
    return 'online';
  }
  const internet = await reachable(fetcher, INTERNET_PROBE_URL, timeoutMs);
  const next: Connectivity = internet ? 'server' : 'offline';
  setConnectivity(next);
  return next;
}

/** Pantallas que funcionan sin conexión (la caja de Mi negocio guarda y sincroniza después; el QR del canje está guardado). */
export function worksOffline(pathname: string): boolean {
  return /^\/(business\/ledger|claims|offer\/claim)(\/|$)/.test(pathname);
}

/** Textos de la pantalla sin conexión. */
export function offlineCopy(c: Connectivity): { title: string; body: string } | null {
  if (c === 'offline') {
    return {
      title: 'Sin conexión a internet',
      body: 'Revisa tus datos móviles o el wifi. Cuando vuelva la conexión, Empre carga solo.',
    };
  }
  if (c === 'server') {
    return {
      title: 'No pudimos conectar con Empre',
      body: 'Tu internet funciona, pero Empre no responde en este momento. Intentamos de nuevo en unos segundos.',
    };
  }
  return null;
}
