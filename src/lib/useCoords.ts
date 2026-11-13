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
  return useLocation(ask).coords;
}

export interface LocationState {
  coords: Coords | null;
  /** La persona dijo que no (o el teléfono no deja preguntar): se elige el barrio a mano. */
  denied: boolean;
  /** El sistema ya no deja preguntar otra vez: hay que ir a los ajustes del teléfono. */
  settingsOnly: boolean;
  /** Vuelve a pedir el permiso (tablero «Estados», teléfono 5: «Usar mi ubicación»). */
  retry: () => void;
}

/** Como useCoords, pero dice si se negó el permiso, para ofrecer elegir el barrio en vez de quedarse en blanco. */
export function useLocation(ask = true): LocationState {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [denied, setDenied] = useState(false);
  const [settingsOnly, setSettingsOnly] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted' && (ask || round > 0)) perm = await Location.requestForegroundPermissionsAsync();
        if (!alive) return;
        if (perm.status !== 'granted') {
          setDenied(true);
          setSettingsOnly(perm.canAskAgain === false);
          return;
        }
        setDenied(false);
        const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (alive && pos) setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        // sin ubicación: se busca desde el centro de la ciudad
      }
    })();
    return () => {
      alive = false;
    };
  }, [ask, round]);
  return { coords, denied, settingsOnly, retry: () => setRound((r) => r + 1) };
}
