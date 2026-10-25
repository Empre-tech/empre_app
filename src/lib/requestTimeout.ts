// Límite de tiempo para una petición (3.53), sin React ni red para probarlo con Node. Antes `request()` no tenía
// ninguno: con una conexión colgada, una pantalla podía quedarse cargando para siempre y la cola de Finance no
// reintentaba. Une el límite con la señal de quien llama (si cancela, se cancela igual) y dice si fue por tiempo.

/** Tiempo máximo de una petición normal. Las subidas de archivos van aparte. */
export const REQUEST_TIMEOUT_MS = 15_000;

export interface TimedSignal {
  signal: AbortSignal;
  /** true si se cortó por tiempo (y no porque quien llamó canceló). */
  timedOut: () => boolean;
  /** Quitar el reloj cuando la petición termina. */
  clear: () => void;
}

export function withTimeout(outer: AbortSignal | undefined, ms: number = REQUEST_TIMEOUT_MS): TimedSignal {
  const ctrl = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    ctrl.abort();
  }, ms);
  const onOuter = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', onOuter, { once: true });
  }
  return {
    signal: ctrl.signal,
    timedOut: () => expired,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    },
  };
}
