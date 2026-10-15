import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker } from 'react-native-maps';
import type { Cluster } from '@/lib/cluster';
import { BusinessStack } from './BusinessStack';
import type { WithDistance } from './FeaturedCard';

interface Props {
  cluster: Cluster<WithDistance>;
  tier: 'far' | 'mid' | 'near';
  onPress: () => void;
}

/**
 * Marcador de una pila de negocios. El mapa dibuja los marcadores como imagen:
 * se rastrean los cambios solo mientras cargan las miniaturas y después se
 * congelan, que es lo que evita la imagen cortada y el marcador lento. Quien
 * lo usa pone en la `key` el nivel de zoom, así un cambio de zoom lo redibuja.
 */
export function StackMarker({ cluster, tier, onPress }: Props) {
  const [tracking, setTracking] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = useCallback((delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTracking(false), delay);
  }, []);

  useEffect(() => {
    settle(800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [settle]);

  const onImageLoad = useCallback(() => {
    setTracking(true);
    settle(200);
  }, [settle]);

  return (
    <Marker
      coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
      tracksViewChanges={tracking}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      <BusinessStack items={cluster.items} tier={tier} onImageLoad={onImageLoad} />
    </Marker>
  );
}
