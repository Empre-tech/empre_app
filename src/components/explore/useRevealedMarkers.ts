import { useEffect, useMemo, useState } from 'react';

import type { Coords } from '@/lib/geo';
import { nextReveal, revealOrder, REVEAL_MS } from '@/lib/mapMarkers';
import type { MarkerModel } from './useMapMarkers';

/** Dónde está un marcador (burbuja, pin o pila). */
function pointOf(m: MarkerModel): Coords {
  if (m.kind === 'business') return m.coordinate;
  if (m.kind === 'stack') return { latitude: m.cluster.latitude, longitude: m.cluster.longitude };
  return { latitude: m.latitude, longitude: m.longitude };
}

/** Recuerda como mucho estas llaves ya mostradas (para que la memoria no crezca sin fin). */
const SHOWN_MAX = 400;

/**
 * Los marcadores nuevos no aparecen todos de golpe (3.29): entran en tandas de 8 cada 40 ms, del centro del mapa hacia
 * afuera. Los que ya se mostraron siguen al instante (moverse y volver no los anima otra vez). El elegido siempre está.
 * Con «Reducir movimiento» entran todos juntos.
 */
export function useRevealedMarkers(markers: MarkerModel[], center: Coords, reduce: boolean): MarkerModel[] {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const { latitude, longitude } = center;
  const pending = useMemo(
    () => revealOrder(markers.map((m) => ({ key: m.key, ...pointOf(m) })), shown, { latitude, longitude }),
    [markers, shown, latitude, longitude],
  );

  useEffect(() => {
    if (pending.length === 0) return;
    const batch = nextReveal(pending, reduce);
    const t = setTimeout(
      () =>
        setShown((prev) => {
          const next = new Set(prev.size > SHOWN_MAX ? markers.map((m) => m.key).filter((k) => prev.has(k)) : prev);
          for (const b of batch) next.add(b.key);
          return next;
        }),
      reduce ? 0 : REVEAL_MS,
    );
    return () => clearTimeout(t);
  }, [pending, reduce, markers]);

  return useMemo(() => markers.filter((m) => shown.has(m.key) || (m.kind === 'business' && m.selected)), [markers, shown]);
}
