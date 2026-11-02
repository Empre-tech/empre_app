import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export interface Coords {
  latitude: number;
  longitude: number;
}

/**
 * La ubicación del teléfono para «cerca de ti»: la última conocida si ya hay permiso (al instante); si no, pide
 * permiso una vez. Sin permiso o sin señal queda en null y las búsquedas usan el centro de Cartagena (lo pone el servidor).
 */
export function useCoords(ask = true): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' && ask) status = (await Location.requestForegroundPermissionsAsync()).status;
        if (status !== 'granted') return;
        const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (alive && pos) setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        // sin ubicación: se busca desde el centro de la ciudad
      }
    })();
    return () => {
      alive = false;
    };
  }, [ask]);
  return coords;
}
