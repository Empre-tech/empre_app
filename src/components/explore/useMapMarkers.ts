import { useMemo, useState } from 'react';
import type { Region } from 'react-native-maps';

import { CLUSTER_PX, clusterByScreenDistance, type Cluster } from '@/lib/cluster';
import type { ApiCell } from '@/api/offers';
import { hasLocation } from '@/lib/geo';
import { levelOf, MAX_DRAWN, type MapLevel } from '@/lib/mapLevels';
import { pickPins } from '@/lib/mapMarkers';
import { emphasize, type EmphasisTier } from '@/lib/proximity';
import { zoneAt, type Zone } from '@/lib/zoneName';
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

/** Nivel del mapa según el zoom, con holgura para que no salte en el límite entre dos niveles (F10). */
export function useMapLevel(latitudeDelta: number): MapLevel {
  const [level, setLevel] = useState<MapLevel>(() => levelOf(latitudeDelta, null));
  const next = levelOf(latitudeDelta, level);
  if (next !== level) setLevel(next);
  return next;
}

/** Lo que el mapa dibuja: un negocio, una pila de negocios muy juntos o una burbuja con conteo. */
export type MarkerModel =
  | {
      kind: 'bubble';
      key: string;
      latitude: number;
      longitude: number;
      count: number;
      hasOffer: boolean;
      categoryId?: string;
      /** Nombre de la zona (nivel 1) cuando el centro de la burbuja cae en una. */
      label: string | null;
    }
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
  /** Nivel del mapa por zoom (F10). Sin búsqueda, en los niveles 1 y 2 se dibujan burbujas. */
  level: MapLevel;
  /** Casillas del servidor para los niveles 1 y 2 (null mientras no llegan o en otro nivel). */
  cells: ApiCell[] | null;
  zones: Zone[];
};

/**
 * Qué marcadores dibuja el mapa. Aquí vive la decisión de pines y pilas para que la
 * pantalla solo los pinte; los niveles por zoom (F10) y el énfasis por cercanía
 * (F11) se añaden aquí sin tocar la pantalla.
 */
export function useMapMarkers({ known, region, mapSize, selectedId, myEntityIds, searching, level, cells, zones }: Args) {
  const mapped = useMemo(() => known.filter(hasLocation), [known]);
  // Como mucho 60 (3.29): primero lo que se ve (+10 %), con prioridad al elegido, a las ofertas y a los abiertos, y con
  // lo que sobra, un anillo de media pantalla alrededor (3.30) para que al arrastrar el borde que entra ya tenga pines.
  // Lo guardado más lejos sigue en memoria pero no se pinta (antes ~150 marcadores para ~42 visibles).
  const visible = useMemo(() => pickPins(mapped, region, selectedId), [mapped, region, selectedId]);
  const tier = zoomTier(region);
  // El umbral de agrupación es el diámetro del pin más un hueco (3.31): dos marcadores nunca se pisan. Al acercar el
  // zoom los negocios se alejan en pantalla y el grupo se abre solo.
  const clusterPx = CLUSTER_PX[tier];
  const clusters = useMemo(
    () => clusterByScreenDistance(visible, region, mapSize, clusterPx),
    [visible, region, mapSize, clusterPx],
  );

  // Búsqueda (F11): un pin por resultado, el más cercano primero. Los lejanos salen tenues.
  // El énfasis se calcula con todos los resultados (es un ranking) y después se dibuja solo lo visible.
  const emphasized = useMemo(() => {
    if (!searching) return null;
    const ids = new Set(pickPins(mapped, region, selectedId).map((e) => e.id));
    return emphasize(mapped).filter((p) => ids.has(p.item.id));
  }, [searching, mapped, region, selectedId]);

  // Niveles 1 y 2 (sin búsqueda): burbujas con el conteo de cada casilla, las más pobladas primero y
  // nunca más de MAX_DRAWN. El nivel 1 nombra la burbuja cuyo centro cae en una zona configurada.
  const bubbles = useMemo<MarkerModel[] | null>(() => {
    if (searching || level > 2 || cells === null) return null;
    return [...cells]
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_DRAWN)
      .map((c): MarkerModel => {
        const label = level === 1 ? zoneAt(zones, c)?.zone.name ?? null : null;
        return {
          kind: 'bubble',
          key: `b${level}-${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}-${c.count}-${c.has_offer ? 'o' : ''}-${label ?? ''}`,
          latitude: c.latitude,
          longitude: c.longitude,
          count: c.count,
          hasOffer: c.has_offer,
          categoryId: c.category_id,
          label,
        };
      });
  }, [searching, level, cells, zones]);

  const markers = useMemo<MarkerModel[]>(
    () => {
      if (bubbles) return bubbles;
      if (emphasized) {
        return emphasized.map(({ item, tier: emphasis }): MarkerModel => {
          const selected = item.id === selectedId;
          return {
            kind: 'business',
            // Lo que cambia el aspecto va en la llave (3.31): el marcador se vuelve a crear. Redibujarlo montado dejaba en
            // Android imágenes viejas o el pin rojo por defecto del mapa.
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
            // Lo que cambia el aspecto va en la llave (3.31), como en la búsqueda.
            key: `${only.id}-${tier}-${selected ? 's' : ''}-${only.has_active_offer ? 'o' : ''}-${only.is_open_now ? 'a' : 'c'}`,
            entity: only,
            coordinate: { latitude: cluster.latitude, longitude: cluster.longitude },
            selected,
            mine: myEntityIds.has(only.id),
          };
        }
        // Varios negocios muy juntos: un solo círculo con cuántos hay (3.31). El nivel va en la llave.
        return { kind: 'stack', key: `${cluster.key}-${tier}`, cluster };
      });
    },
    [bubbles, emphasized, clusters, selectedId, myEntityIds, tier],
  );

  return { tier, markers };
}
