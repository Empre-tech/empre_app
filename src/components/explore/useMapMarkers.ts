import { useMemo } from 'react';
import type { Region } from 'react-native-maps';

import { clusterByScreenDistance, type Cluster } from '@/lib/cluster';
import { hasLocation } from '@/lib/geo';
import { emphasize, type EmphasisTier } from '@/lib/proximity';
import { formatFeaturedDistance, type WithDistance } from './FeaturedCard';

export type ZoomTier = 'far' | 'mid' | 'near';

/** Nivel de zoom según el delta de latitud de la región visible del mapa.
 * La imagen del negocio solo aparece de cerca; al alejarte se reduce a un
 * punto de color que no estorba (con muchos negocios, las imágenes grandes
 * serían un estorbo). */
export function zoomTier(region: Region): ZoomTier {
  if (region.latitudeDelta < 0.012) return 'near';
  if (region.latitudeDelta < 0.05) return 'mid';
  return 'far';
}

/** Lo que el mapa dibuja: un negocio o una pila de negocios muy juntos. */
export type MarkerModel =
  | {
      kind: 'business';
      key: string;
      entity: WithDistance;
      coordinate: { latitude: number; longitude: number };
      selected: boolean;
      mine: boolean;
      /** Solo en búsqueda (F11): qué tan destacado va según su cercanía. */
      emphasis?: EmphasisTier;
      /** Distancia que lleva escrita el pin grande. */
      distanceLabel?: string | null;
    }
  | { kind: 'stack'; key: string; cluster: Cluster<WithDistance> };

type Args = {
  /** Negocios conocidos (pines acumulados o resultados de búsqueda). */
  known: WithDistance[];
  region: Region;
  mapSize: { width: number; height: number };
  selectedId: string | null;
  myEntityIds: Set<string>;
  /** Con búsqueda los resultados no se agrupan: se destacan por cercanía (F11). */
  searching: boolean;
};

/**
 * Qué marcadores dibuja el mapa. Aquí vive la decisión de pines y pilas para que la
 * pantalla solo los pinte; los niveles por zoom (F10) y el énfasis por cercanía
 * (F11) se añaden aquí sin tocar la pantalla.
 */
export function useMapMarkers({ known, region, mapSize, selectedId, myEntityIds, searching }: Args) {
  const mapped = useMemo(() => known.filter(hasLocation), [known]);
  const tier = zoomTier(region);
  // Lejos los pines son puntos de 18 pt; de cerca, portales de ~44 pt: el umbral
  // de agrupación acompaña. Al acercar el zoom los negocios se alejan en pantalla
  // y la pila se abre sola.
  const clusterPx = tier === 'far' ? 22 : 44;
  const clusters = useMemo(
    () => clusterByScreenDistance(mapped, region, mapSize, clusterPx),
    [mapped, region, mapSize, clusterPx],
  );

  // Búsqueda (F11): un pin por resultado, el más cercano primero. Los lejanos salen tenues.
  const emphasized = useMemo(() => (searching ? emphasize(mapped) : null), [searching, mapped]);

  const markers = useMemo<MarkerModel[]>(
    () => {
      if (emphasized) {
        return emphasized.map(({ item, tier: emphasis }): MarkerModel => {
          const selected = item.id === selectedId;
          return {
            kind: 'business',
            key: `${item.id}-e${emphasis}-${selected ? 's' : ''}-${item.has_active_offer ? 'o' : ''}-${item.is_open_now ? 'a' : 'c'}`,
            entity: item,
            coordinate: { latitude: item.latitude, longitude: item.longitude },
            selected,
            mine: myEntityIds.has(item.id),
            emphasis,
            distanceLabel: emphasis === 'big' ? formatFeaturedDistance(item.distanceKm) : null,
          };
        });
      }
      return clusters.map((cluster): MarkerModel => {
        const [only] = cluster.items;
        if (cluster.items.length === 1 && only) {
          const selected = only.id === selectedId;
          return {
            kind: 'business',
            // Lo que cambia el aspecto del pin va en la key: así se vuelve a dibujar solo cuando hace falta.
            key: `${cluster.key}-${tier}-${selected ? 's' : ''}-${only.has_active_offer ? 'o' : ''}`,
            entity: only,
            coordinate: { latitude: cluster.latitude, longitude: cluster.longitude },
            selected,
            mine: myEntityIds.has(only.id),
          };
        }
        // Varios negocios muy juntos: pila de miniaturas, nunca un número. El
        // nivel de zoom va en la key para que el marcador se vuelva a dibujar.
        return { kind: 'stack', key: `${cluster.key}-${tier}`, cluster };
      });
    },
    [emphasized, clusters, tier, selectedId, myEntityIds],
  );

  return { tier, markers };
}
