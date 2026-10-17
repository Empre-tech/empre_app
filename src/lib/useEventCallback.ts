import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Una función con identidad estable que siempre llama a la versión más reciente de `fn` (el patrón «evento»). Sirve
 * para pasar manejadores a un componente memorizado sin que se vuelva a dibujar en cada render y sin cierres viejos:
 * la referencia se actualiza después de cada render, antes de que el usuario pueda tocar nada.
 * Solo para manejadores de eventos: no llamarla durante el render.
 */
export function useEventCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
