import { useEffect, useState } from 'react';
import { Circle } from 'react-native-maps';

import { pulseFrame, type FreshOffer } from '@/lib/mapLive';

/**
 * Pulso de una oferta recién publicada (3.41): un anillo naranja que crece y se desvanece dos veces y se detiene. Lo
 * mueve JavaScript a ~30 cuadros por segundo durante 3,2 s, y nunca hay más de 3 a la vez. `baseMeters` hace que el
 * anillo se vea del mismo tamaño en pantalla a cualquier acercamiento.
 */
export function PulseRing({ offer, baseMeters, onDone }: { offer: FreshOffer; baseMeters: number; onDone: () => void }) {
  const [frame, setFrame] = useState(() => pulseFrame(0));
  useEffect(() => {
    const start = Date.now();
    let last = 0;
    let raf = 0;
    const tick = () => {
      const t = Date.now() - start;
      const f = pulseFrame(t);
      if (!f) {
        onDone();
        return;
      }
      if (t - last >= 33) {
        last = t;
        setFrame(f);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Un pulso por oferta: no se reinicia si cambia el acercamiento a mitad de camino.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.offer_id]);
  if (!frame) return null;
  return (
    <Circle
      center={{ latitude: offer.latitude, longitude: offer.longitude }}
      radius={Math.max(15, baseMeters * frame.scale)}
      fillColor="rgba(245,130,32,0)"
      strokeColor={`rgba(245,130,32,${frame.alpha})`}
      strokeWidth={3}
      zIndex={1}
    />
  );
}
