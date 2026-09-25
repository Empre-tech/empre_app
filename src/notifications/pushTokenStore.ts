/**
 * Recuerda el token push que ya registramos en el backend para esta sesión,
 * en memoria (no persiste entre reinicios de la app). Sirve para poder
 * des-registrarlo en el logout ANTES de borrar los tokens de sesión: una vez
 * borrados, el cliente ya no puede autenticar esa llamada.
 */
let currentToken: string | null = null;

export function setRegisteredPushToken(token: string | null) {
  currentToken = token;
}

export function getRegisteredPushToken(): string | null {
  return currentToken;
}
