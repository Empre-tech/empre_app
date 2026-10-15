import { useEffect, useState } from 'react';

/**
 * Hora actual que se refresca cada `intervalMs`, para cuentas regresivas.
 * Con ofertas lejanas basta cada 30 s; en la última hora conviene cada segundo.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
