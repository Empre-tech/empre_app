/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * «Continuar con Google» con @react-native-google-signin/google-signin. El paquete se carga de forma opcional: en
 * Expo Go o en un build sin el módulo nativo, `googleAvailable()` devuelve false y el botón no aparece.
 * El id_token que entrega Google va al backend (POST /api/auth/google), que lo verifica y abre la sesión.
 */

let mod: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('@react-native-google-signin/google-signin');
} catch {
  mod = null;
}

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let configured = false;

function signin(): any {
  return mod?.GoogleSignin ?? null;
}

export function googleAvailable(): boolean {
  try {
    return Boolean(signin() && WEB_CLIENT_ID);
  } catch {
    return false;
  }
}

/** Abre el selector de cuentas de Google y devuelve el id_token, o null si la persona canceló. */
export async function googleIdToken(): Promise<string | null> {
  const GoogleSignin = signin();
  if (!GoogleSignin || !WEB_CLIENT_ID) throw new Error('El inicio de sesión con Google no está disponible en esta versión.');
  if (!configured) {
    // webClientId: el token sale dirigido al cliente web, que es el que el backend acepta en Android y en iOS.
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID, scopes: ['email', 'profile'] });
    configured = true;
  }
  try {
    await GoogleSignin.hasPlayServices?.({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res?.type === 'cancelled') return null;
    const token: string | undefined = res?.data?.idToken ?? res?.idToken;
    if (!token) throw new Error('Google no devolvió la identificación de tu cuenta. Intenta de nuevo.');
    return token;
  } catch (e: any) {
    const codes = mod?.statusCodes ?? {};
    if (e?.code && (e.code === codes.SIGN_IN_CANCELLED || e.code === codes.IN_PROGRESS)) return null;
    if (e?.code && e.code === codes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Tu celular no tiene los servicios de Google Play actualizados.');
    }
    throw e;
  }
}

/** Al cerrar sesión en Empre: la próxima vez Google vuelve a preguntar con qué cuenta entrar. */
export async function googleSignOut(): Promise<void> {
  try {
    await signin()?.signOut?.();
  } catch {
    // sin módulo o sin sesión de Google: nada que cerrar
  }
}
