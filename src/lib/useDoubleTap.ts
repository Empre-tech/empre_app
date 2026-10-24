import { useEffect, useState } from 'react';
import { createTapGate, type TapGate } from './doubleTap';
import { useEventCallback } from './useEventCallback';

/** Un botón con dos acciones: `onSingle` al tocar una vez y `onDouble` al tocar dos veces rápido. Devuelve el `onPress`. */
export function useDoubleTap(onSingle: () => void, onDouble: () => void): () => void {
  const single = useEventCallback(onSingle);
  const double = useEventCallback(onDouble);
  const [gate] = useState<TapGate>(() => createTapGate({ onSingle: () => single(), onDouble: () => double() }));
  useEffect(() => () => gate.cancel(), [gate]);
  return gate.tap;
}
