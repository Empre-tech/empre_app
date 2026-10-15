import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';
import { useReduceMotion } from '@/lib/useReduceMotion';

/**
 * Destacados como hoja emergente con cuatro anclajes:
 * - hidden: solo una píldora «N destacados cerca» (cuando se busca o se arrastra el mapa).
 * - peek: asa y título (reposo con resultados).
 * - medium: una fila de tarjetas.
 * - full: lista vertical (~60 % del contenido).
 */
export type FeaturedAnchor = 'hidden' | 'peek' | 'medium' | 'full';

export const FEATURED_PEEK = 64;
export const FEATURED_MEDIUM = 190;
/** Mínimo de la altura completa, por si todavía no se midió el contenido. */
const FEATURED_FULL_MIN = FEATURED_MEDIUM + 80;

function heightFor(anchor: FeaturedAnchor, full: number): number {
  switch (anchor) {
    case 'hidden':
      return 0;
    case 'peek':
      return FEATURED_PEEK;
    case 'medium':
      return FEATURED_MEDIUM;
    default:
      return full;
  }
}

/** Anclaje más cercano a una altura (con la inercia del gesto ya aplicada). */
function nearestAnchor(value: number, full: number): FeaturedAnchor {
  const anchors: FeaturedAnchor[] = ['hidden', 'peek', 'medium', 'full'];
  let best: FeaturedAnchor = 'peek';
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const distance = Math.abs(value - heightFor(anchor, full));
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Estado y gesto de la hoja de Destacados. Un solo Animated.Value controla el
 * alto de la hoja y, recortado a `medium`, la posición de los botones
 * flotantes, así nunca quedan desincronizados ni la hoja los tapa.
 *
 * @param fullHeight alto del anclaje «full» (p. ej. el 60 % del contenido).
 */
export function useFeaturedSheet(fullHeight: number) {
  const full = Math.max(fullHeight, FEATURED_FULL_MIN);
  const [anchor, setAnchor] = useState<FeaturedAnchor>('peek');
  const [height] = useState(() => new Animated.Value(FEATURED_PEEK));

  const anchorRef = useRef<FeaturedAnchor>('peek');
  const valueRef = useRef(FEATURED_PEEK);
  const fullRef = useRef(full);
  const reduceRef = useRef(false);
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    reduceRef.current = reduceMotion;
  }, [reduceMotion]);
  useEffect(() => {
    fullRef.current = full;
  }, [full]);
  useEffect(() => {
    const id = height.addListener(({ value }) => {
      valueRef.current = value;
    });
    return () => height.removeListener(id);
  }, [height]);

  const snapTo = useCallback(
    (next: FeaturedAnchor) => {
      anchorRef.current = next;
      setAnchor(next);
      const target = heightFor(next, fullRef.current);
      // Con «Reducir movimiento» la hoja salta al anclaje, sin resorte.
      if (reduceRef.current) height.setValue(target);
      else Animated.spring(height, { toValue: target, useNativeDriver: false, bounciness: 4 }).start();
    },
    [height],
  );

  // Arrastrar el asa mueve la hoja en vivo; al soltar encaja en el anclaje más
  // cercano, con la inercia del dedo (un gesto rápido llega más lejos).
  // eslint-disable-next-line react-hooks/refs -- los callbacks del gesto corren por eventos del dedo, nunca durante el render
  const [panResponder] = useState(() => {
    let startValue = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        height.stopAnimation();
        startValue = valueRef.current;
      },
      onPanResponderMove: (_, g) => {
        height.setValue(Math.min(fullRef.current, Math.max(0, startValue - g.dy)));
      },
      onPanResponderRelease: (_, g) => snapTo(nearestAnchor(valueRef.current - g.vy * 120, fullRef.current)),
      onPanResponderTerminate: () => snapTo(nearestAnchor(valueRef.current, fullRef.current)),
    });
  });

  // Posición base de los botones flotantes: sigue a la hoja hasta `medium` y no
  // sube más, para que con la hoja completa no queden flotando a media pantalla.
  const buttonsBase = useMemo(
    () =>
      height.interpolate({
        inputRange: [0, FEATURED_MEDIUM, FEATURED_MEDIUM + 1],
        outputRange: [0, FEATURED_MEDIUM, FEATURED_MEDIUM],
        extrapolate: 'clamp',
      }),
    [height],
  );

  /** Anclaje actual sin provocar un render (para temporizadores). */
  const getAnchor = useCallback(() => anchorRef.current, []);

  return { anchor, height, buttonsBase, snapTo, getAnchor, panHandlers: panResponder.panHandlers };
}

export type FeaturedSheetState = ReturnType<typeof useFeaturedSheet>;
