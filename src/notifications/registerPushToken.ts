import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Pide permiso y devuelve el token de push de Expo para este dispositivo, o
 * `null` si no se pudo (emulador sin Google Play, permiso negado, etc.).
 * No lanza: cualquier fallo aquí no debe romper el login ni el arranque de la app.
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    // Los push de verdad solo llegan a un dispositivo físico; en el emulador
    // getExpoPushTokenAsync falla o devuelve un token que nunca recibirá nada.
    if (!Device.isDevice) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    // En un development build / build de producción, expo-constants trae el
    // projectId de EAS. Sin él, getExpoPushTokenAsync no sabe a qué proyecto
    // asociar el token.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}
