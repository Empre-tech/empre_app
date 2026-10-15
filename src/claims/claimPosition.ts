import * as Location from 'expo-location';

export interface ClaimPosition {
  latitude: number;
  longitude: number;
}

/**
 * Ubicación para reclamar: el servidor comprueba que la persona esté cerca del
 * negocio. Pide el permiso en este momento (cuando se entiende para qué) y,
 * si no se concede o no llega a tiempo, devuelve null: el reclamo sigue
 * adelante, pero sin poder comprobar la distancia.
 */
export async function getClaimPosition(): Promise<ClaimPosition | null> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return null;

    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 200 });
    const position =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
      ]));
    return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null;
  } catch {
    return null;
  }
}
