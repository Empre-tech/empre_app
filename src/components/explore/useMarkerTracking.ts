import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { MapMarker } from 'react-native-maps';

/** Espera tras el último aviso (layout o foto) antes de congelar el marcador. */
const SETTLE_MS = 450;
/** Respaldo: si nada avisa, se congela igual para no rastrear para siempre. */
const FALLBACK_MS = 4000;
/**
 * Cuándo volver a dibujar el marcador a mano tras un aviso. Una foto que ya cargó se pinta un
 * poco después de `onLoad` (y el icono, después de la fuente), así que se pide dos veces: una
 * enseguida y otra por si la decodificación fue lenta.
 */
const REDRAW_AT_MS = [80, 400];

/**
 * Cuándo dejar de rastrear los cambios de un marcador del mapa.
 *
 * El mapa dibuja cada marcador como una imagen que toma de su vista. En Android el mapa solo
 * vuelve a tomar esa imagen mientras llegan avisos de layout: si la foto se pinta después del
 * último aviso (porque `onLoad` llega con el rastreo ya sin avisos pendientes), el marcador se
 * queda con el círculo vacío aunque la foto ya esté cargada. Por eso, además de rastrear, cada
 * aviso de layout o de foto pide un `redraw()` del marcador (Android) un instante después.
 * El temporizador no corre desde el montaje: empieza cuando la vista se dibujó (`onLayout`) y se
 * reinicia con cada foto que termina de cargar (o falla). Un respaldo evita rastrear sin fin.
 *
 * Quien lo usa pasa `markerRef` al `<Marker ref={…}>`.
 *
 * `look` resume lo que cambia el aspecto del marcador (nivel de zoom, elegido, oferta…). Antes iba en la `key` y, al
 * cambiar de nivel, todos los marcadores se desmontaban y volvían a crear a la vez (3.29); ahora el marcador sigue
 * montado y solo vuelve a rastrear un momento para tomar la imagen nueva.
 *
 * `ready` (auditoría del 22 oct): en Android, si el mapa crea el marcador antes de que su vista esté dibujada, muestra
 * su pin rojo por defecto hasta tomar la imagen. Quien lo usa pone `opacity={ready ? … : 0}`: el marcador existe desde
 * el principio pero no se ve hasta el primer redibujo después del layout.
 */
export function useMarkerTracking(look = '') {
  const [tracking, setTracking] = useState(true);
  const [ready, setReady] = useState(false);
  const [seenLook, setSeenLook] = useState(look);
  if (look !== seenLook) {
    // Estado derivado durante el render (patrón de React): cambió el aspecto, se vuelve a rastrear.
    setSeenLook(look);
    setTracking(true);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redraws = useRef<ReturnType<typeof setTimeout>[]>([]);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markerRef = useRef<MapMarker>(null);

  const settle = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTracking(false), SETTLE_MS);
  }, []);

  const redrawSoon = useCallback(() => {
    if (Platform.OS !== 'android') return;
    for (const t of redraws.current) clearTimeout(t);
    redraws.current = REDRAW_AT_MS.map((ms) => setTimeout(() => markerRef.current?.redraw(), ms));
  }, []);

  // Mientras se rastrea (al montar o al cambiar de aspecto) corre la espera y en Android se pide redibujar.
  useEffect(() => {
    if (!tracking) return;
    settle();
    redrawSoon();
  }, [tracking, seenLook, settle, redrawSoon]);

  useEffect(() => {
    const fallback = setTimeout(() => {
      setTracking(false);
      setReady(true);
    }, FALLBACK_MS);
    return () => {
      clearTimeout(fallback);
      if (timer.current) clearTimeout(timer.current);
      if (readyTimer.current) clearTimeout(readyTimer.current);
      for (const t of redraws.current) clearTimeout(t);
    };
  }, []);

  /** La vista del marcador ya se dibujó: desde aquí corre la espera. */
  const onLayout = useCallback(() => {
    setTracking(true);
    settle();
    redrawSoon();
    // Se muestra después del primer redibujo (80 ms): para entonces el mapa ya tomó la imagen del marcador.
    if (!readyTimer.current) readyTimer.current = setTimeout(() => setReady(true), REDRAW_AT_MS[0] + 40);
  }, [settle, redrawSoon]);

  /** Una foto terminó de cargar o falló: el marcador se vuelve a dibujar y se reinicia la espera. */
  const onImageSettled = useCallback(() => {
    setTracking(true);
    settle();
    redrawSoon();
  }, [settle, redrawSoon]);

  return { tracking, ready, onLayout, onImageSettled, markerRef };
}
