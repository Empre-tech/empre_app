import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BACKEND_PORT = 8080;

/**
 * En desarrollo con Expo Go, Metro sirve la app desde tu PC: usamos ese mismo equipo
 * (puerto 8080) como backend, así no hay que escribir la IP a mano en cada PC o red.
 * En modo túnel el host es un dominio de Expo, no tu PC, y aquí devolvemos null.
 */
function detectDevBackend(): string | null {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host) return null;
  const isLanIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  return isLanIp || host === 'localhost' ? `http://${host}:${BACKEND_PORT}` : null;
}

const emulatorFallback =
  Platform.OS === 'android' ? `http://10.0.2.2:${BACKEND_PORT}` : `http://localhost:${BACKEND_PORT}`;

/**
 * URL base del backend, sin "/" final. Orden de prioridad:
 * 1. EXPO_PUBLIC_API_URL (obligatoria en builds de producción, o si usas un túnel).
 * 2. El equipo que sirve la app en desarrollo (detección automática).
 * 3. Emuladores: 10.0.2.2 en Android, localhost en iOS.
 */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  detectDevBackend() ||
  emulatorFallback
).replace(/\/+$/, '');

/** Mismo host que la API pero con esquema ws(s)://. */
export const WS_URL = API_URL.replace(/^http/, 'ws');

/** Centro histórico de Cartagena: vista inicial del mapa. */
export const CARTAGENA_CENTER = { latitude: 10.4236, longitude: -75.5511 };

export const DEFAULT_REGION = {
  ...CARTAGENA_CENTER,
  latitudeDelta: 0.07,
  longitudeDelta: 0.07,
};

/** Si el usuario está a más de esto (km) de Cartagena, no ordenamos por distancia. */
export const NEARBY_CITY_RADIUS_KM = 60;

/** Máximo de caracteres de un mensaje de chat (el backend rechaza los más largos). */
export const CHAT_MAX_CONTENT_CHARS = 1000;

/**
 * El backend cierra la conexión si un frame supera 4096 bytes. El JSON ya gasta ~140 bytes
 * en ids y claves, y un carácter puede ocupar hasta 4 bytes en UTF-8, así que además del
 * límite de caracteres comprobamos los bytes reales.
 */
export const CHAT_MAX_CONTENT_BYTES = 3500;
