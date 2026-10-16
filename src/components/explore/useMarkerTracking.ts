import { useCallback, useEffect, useRef, useState } from 'react';

/** Espera tras el último aviso (layout o foto) antes de congelar el marcador. */
const SETTLE_MS = 450;
/** Respaldo: si nada avisa, se congela igual para no rastrear para siempre. */
const FALLBACK_MS = 4000;

/**
 * Cuándo dejar de rastrear los cambios de un marcador del mapa.
 *
 * El mapa dibuja cada marcador como una imagen que toma de su vista. Si se deja
 * de rastrear antes de que la vista esté dibujada y sus fotos cargadas, el
 * mapa se queda con el pin rojo por defecto (pasa cuando salen muchos marcadores
 * a la vez, p. ej. al buscar). Por eso el temporizador ya no corre desde el
 * montaje: empieza cuando la vista se dibujó (`onLayout`) y se reinicia con cada
 * foto que termina de cargar (o falla). Un respaldo evita rastrear sin fin.
 */
export function useMarkerTracking() {
  const [tracking, setTracking] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTracking(false), SETTLE_MS);
  }, []);

  useEffect(() => {
    const fallback = setTimeout(() => setTracking(false), FALLBACK_MS);
    return () => {
      clearTimeout(fallback);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /** La vista del marcador ya se dibujó: desde aquí corre la espera. */
  const onLayout = useCallback(() => {
    setTracking(true);
    settle();
  }, [settle]);

  /** Una foto terminó de cargar o falló: el marcador se vuelve a dibujar y se reinicia la espera. */
  const onImageSettled = useCallback(() => {
    setTracking(true);
    settle();
  }, [settle]);

  return { tracking, onLayout, onImageSettled };
}
