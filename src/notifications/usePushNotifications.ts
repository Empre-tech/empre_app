import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { usersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { getExpoPushToken } from './registerPushToken';
import { setRegisteredPushToken } from './pushTokenStore';

// Con la app abierta también queremos que se vea/suene la notificación (no
// solo cuando está en segundo plano), igual que hace cualquier app de chat.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationData = {
  type?: 'chat' | 'review' | 'favorite' | 'verification';
  entity_id?: string;
  user_id?: string;
};

/**
 * Registra el token de notificaciones push de este dispositivo mientras haya
 * sesión iniciada, y navega a la pantalla correspondiente cuando el usuario
 * toca una notificación (mensaje de chat, reseña nueva, favorito, verificación).
 */
export function usePushNotifications() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'signedIn') return;
    let cancelled = false;
    (async () => {
      const token = await getExpoPushToken();
      if (cancelled || !token) return;
      try {
        await usersApi.registerPushToken(token);
        setRegisteredPushToken(token);
      } catch {
        // Sin conexión o error del servidor: no es crítico, seguimos sin push esta sesión.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationData;
      switch (data?.type) {
        case 'chat':
          if (data.entity_id) {
            router.push({
              pathname: '/chat/[entityId]',
              params: { entityId: data.entity_id, ...(data.user_id ? { userId: data.user_id } : {}) },
            });
          }
          break;
        case 'review':
        case 'favorite':
        case 'verification':
          if (data.entity_id) {
            router.push({ pathname: '/business/[id]', params: { id: data.entity_id } });
          }
          break;
        default:
          break;
      }
    });
    return () => subscription.remove();
  }, [router]);
}
