import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';
import { useReduceMotion } from '@/lib/useReduceMotion';

/**
 * El panel de explorar: una sola hoja con tres anclajes (más «hidden» mientras
 * hay un negocio seleccionado):
 * - peek: compacto, asa y una línea (Descubre o la búsqueda). El mapa manda.
 * - medium: intermedio, una fila de tarjetas.
 * - full: expandido, la lista completa con una franja de mapa arriba.
 */
export type FeaturedAnchor = 'hidden' | 'peek' | 'medium' | 'full';

export const FEATURED_PEEK = 84;
/** Mínimos por si todavía no se midió el contenido. */
const MEDIUM_MIN = 240;
const FULL_MIN = MEDIUM_MIN + 120;

interface Heights {
  medium: number;
  full: number;
}

function heightFor(anchor: FeaturedAnchor, h: Heights): number {
  switch (anchor) {
    case 'hidden':
      return 0;
    case 'peek':
      return FEATURED_PEEK;
    case 'medium':
      return h.medium;
    default:
      return h.full;
  }
}

/** Anclaje más cercano a una altura (con la inercia del gesto ya aplicada). Nunca «hidden»: el usuario no lo esconde arrastrando. */
function nearestAnchor(value: number, h: Heights): FeaturedAnchor {
  const anchors: FeaturedAnchor[] = ['peek', 'medium', 'full'];
  let best: FeaturedAnchor = 'peek';
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const distance = Math.abs(value - heightFor(anchor, h));
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Estado y gesto del panel. Un solo Animated.Value controla el alto y, recortado
 * a `medium`, la posición de los botones flotantes, así nunca quedan
 * desincronizados ni el panel los tapa.
 *
 * @param contentHeight alto del área del mapa (se mide con onLayout).
 */
export function useFeaturedSheet(contentHeight: number) {
  const heights = useMemo<Heights>(() => {
    const medium = Math.max(MEDIUM_MIN, Math.min(Math.round(contentHeight * 0.52), 380));
    // Expandido deja una franja de mapa arriba con el buscador encima.
    const full = Math.max(FULL_MIN, Math.round(contentHeight - 190), medium + 60);
    return { medium, full };
  }, [contentHeight]);

  const [anchor, setAnchor] = useState<FeaturedAnchor>('peek');
  const [height] = useState(() => new Animated.Value(FEATURED_PEEK));

  const anchorRef = useRef<FeaturedAnchor>('peek');
  const valueRef = useRef(FEATURED_PEEK);
  const heightsRef = useRef(heights);
  const reduceRef = useRef(false);
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    reduceRef.current = reduceMotion;
  }, [reduceMotion]);
  useEffect(() => {
    heightsRef.current = heights;
    // Si cambia el tamaño de la pantalla, el anclaje actual se recoloca.
    height.setValue(heightFor(anchorRef.current, heights));
  }, [heights, height]);
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
      const target = heightFor(next, heightsRef.current);
      // Con «Reducir movimiento» la hoja salta al anclaje, sin resorte.
      if (reduceRef.current) height.setValue(target);
      else Animated.spring(height, { toValue: target, useNativeDriver: false, bounciness: 3 }).start();
    },
    [height],
  );

  // Arrastrar el asa mueve la hoja en vivo; al soltar encaja en el anclaje más
  // cercano, con la inercia del dedo. Un toque sin arrastre alterna compacto ⇄ intermedio.
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
        height.setValue(Math.min(heightsRef.current.full, Math.max(FEATURED_PEEK, startValue - g.dy)));
      },
      onPanResponderRelease: (_, g) => snapTo(nearestAnchor(valueRef.current - g.vy * 120, heightsRef.current)),
      onPanResponderTerminate: () => snapTo(nearestAnchor(valueRef.current, heightsRef.current)),
    });
  });

  // Base de los botones flotantes: sigue a la hoja hasta `medium` y no sube más.
  const buttonsBase = useMemo(
    () =>
      height.interpolate({
        inputRange: [0, heights.medium, heights.medium + 1],
        outputRange: [0, heights.medium, heights.medium],
        extrapolate: 'clamp',
      }),
    [height, heights.medium],
  );

  /** Anclaje actual sin provocar un render (para temporizadores y gestos del mapa). */
  const getAnchor = useCallback(() => anchorRef.current, []);

  return { anchor, height, heights, buttonsBase, snapTo, getAnchor, panHandlers: panResponder.panHandlers };
}

export type FeaturedSheetState = ReturnType<typeof useFeaturedSheet>;
