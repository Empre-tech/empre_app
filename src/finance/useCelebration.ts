import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { fin } from '@/finance/tokens';

// Lo que pasa al registrar (3.45): el monto vuela desde la pieza y arriba aparece «Registrado… · Deshacer» durante
// unos segundos. Aquí solo el estado y el reloj; las animaciones viven en Celebration.tsx.

export type Done = { kind: 'sale' | 'expense'; id: string };
export type Toast = { n: number; text: string; done: Done[] };
export type Fly = { n: number; amount: number };

export function useCelebration() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const celebrate = (amount: number, text: string, done: Done[]) => {
    const n = Date.now();
    setFly({ n, amount });
    setToast({ n, text, done });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), fin.motion.undoMs);
    AccessibilityInfo.announceForAccessibility(`${text}. Puedes deshacer durante 5 segundos.`);
  };

  /** Quita el aviso y devuelve lo que se había registrado (para anularlo). */
  const take = (): Done[] => {
    const done = toast?.done ?? [];
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
    return done;
  };

  return { toast, fly, celebrate, take, flyDone: () => setFly(null) };
}
