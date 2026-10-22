import { memo } from 'react';
import { Marker } from 'react-native-maps';
import type { Cluster } from '@/lib/cluster';
import { stackLabel } from '@/lib/markerLabels';
import { BusinessStack } from './BusinessStack';
import type { WithDistance } from './FeaturedCard';
import { useMarkerTracking } from './useMarkerTracking';

interface Props {
  cluster: Cluster<WithDistance>;
  tier: 'far' | 'mid' | 'near';
  onPress: () => void;
}

/**
 * Marcador de una pila de negocios. El mapa dibuja los marcadores como imagen:
 * se rastrean los cambios solo mientras cargan las miniaturas y después se
 * congelan, que es lo que evita la imagen cortada y el marcador lento. Al
 * cambiar de nivel de zoom se redibuja sin desmontarse (3.29).
 */
function StackMarkerView({ cluster, tier, onPress }: Props) {
  const { tracking, ready, onLayout, onImageSettled, markerRef } = useMarkerTracking();

  return (
    <Marker
      ref={markerRef}
      coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
      anchor={STACK_TOP_CENTER}
      opacity={ready ? 1 : 0}
      tracksViewChanges={tracking}
      accessibilityRole="button"
      accessibilityLabel={stackLabel(cluster.items)}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      <BusinessStack items={cluster.items} tier={tier} onImageLoad={onImageSettled} onLayout={onLayout} />
    </Marker>
  );
}

/** Centro de la miniatura de arriba dentro de la imagen de la pila (74 × 72 con el margen de 8; ver BusinessStack). */
const STACK_TOP_CENTER = { x: 49 / 74, y: 25 / 72 };

/** Igual que el pin: una consulta nueva con los mismos negocios no redibuja la pila. */
export const StackMarker = memo(StackMarkerView, (a, b) =>
  a.tier === b.tier &&
  a.cluster.key === b.cluster.key &&
  a.cluster.latitude === b.cluster.latitude &&
  a.cluster.longitude === b.cluster.longitude &&
  a.cluster.items.every((it, i) => {
    const o = b.cluster.items[i];
    return o && it.id === o.id && it.profile_url === o.profile_url && it.has_active_offer === o.has_active_offer;
  }),
);
