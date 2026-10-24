// Toque o doble toque sobre un mismo botón (3.45): el toque sencillo espera una ventana corta por si llega el segundo.
// Un segundo toque dentro de la ventana cancela el sencillo y dispara el doble UNA vez; los toques que llegan justo
// después (un triple toque) se ignoran para no abrir dos veces. Lógica pura, sin React, para probarla con Node.

export const DOUBLE_TAP_WINDOW_MS = 280;
export const DOUBLE_TAP_COOLDOWN_MS = 600;

export interface TapGateOptions {
  onSingle: () => void;
  onDouble: () => void;
  windowMs?: number;
  cooldownMs?: number;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  clear?: (handle: unknown) => void;
}

export interface TapGate {
  tap: () => void;
  cancel: () => void;
}

export function createTapGate(o: TapGateOptions): TapGate {
  const windowMs = o.windowMs ?? DOUBLE_TAP_WINDOW_MS;
  const cooldownMs = o.cooldownMs ?? DOUBLE_TAP_COOLDOWN_MS;
  const now = o.now ?? Date.now;
  const schedule = o.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const clear = o.clear ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let pending: unknown = null;
  let lastDouble = -Infinity;

  const cancel = () => {
    if (pending !== null) clear(pending);
    pending = null;
  };

  return {
    tap() {
      const t = now();
      if (t - lastDouble < cooldownMs) return;
      if (pending !== null) {
        cancel();
        lastDouble = t;
        o.onDouble();
        return;
      }
      pending = schedule(() => {
        pending = null;
        o.onSingle();
      }, windowMs);
    },
    cancel,
  };
}
