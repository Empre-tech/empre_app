// Estado de conexión de la app (plan de experiencia, fase 0), sin módulos nativos: lo deduce de las peticiones al
// servidor. Cualquier respuesta, aunque sea un error, prueba que hay conexión; un `fetch` que falla sin respuesta
// (sin red, servidor inalcanzable) la da por perdida. Sin React para probarlo con Node.

type Listener = (offline: boolean) => void;

let offline = false;
const listeners = new Set<Listener>();

/** El cliente de la API avisa aquí: `true` si llegó una respuesta, `false` si la petición no pudo salir. */
export function reportReachable(reached: boolean): void {
  const next = !reached;
  if (next === offline) return;
  offline = next;
  for (const l of listeners) l(offline);
}

export function isOffline(): boolean {
  return offline;
}

export function subscribeConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Un corte breve no merece aviso: se muestra si sigue sin conexión tras este tiempo. */
export const OFFLINE_NOTICE_DELAY_MS = 1200;

/** Mensaje de error para acciones que fallan sin conexión (en vez del texto técnico del `fetch`). */
export const OFFLINE_MESSAGE = 'Sin conexión. Revisa tu internet y vuelve a intentarlo.';
