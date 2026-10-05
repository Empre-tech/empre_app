import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { agendaApi } from '@/api/agenda';
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
  type?:
    | 'chat'
    | 'review'
    | 'favorite'
    | 'verification'
    | 'subscription'
    | 'appointment_request'
    | 'appointment_confirmed'
    | 'appointment_declined'
    | 'appointment_cancelled'
    | 'appointment_expired'
    | 'appointment_reminder'
    | 'appointment_closing';
  entity_id?: string;
  user_id?: string;
  appointment_id?: string;
};

/**
 * Botones de la notificación de nueva solicitud. IMPORTANTE (por validar en un
 * Android real): que "Aceptar" funcione SIN abrir la app depende de que el
 * sistema ejecute JS en segundo plano al tocar el botón, algo que Android no
 * garantiza con la app cerrada. Mientras no se pruebe, el botón abre la app y
 * acepta la cita al abrir (un toque, sin buscar la solicitud). Cambiar a
 * `true` solo después de comprobarlo.
 */
const ACCEPT_WITHOUT_OPENING = false;
const REQUEST_CATEGORY = 'appointment_request';
const ACTION_ACCEPT = 'accept';
const ACTION_DECLINE = 'decline';

void Notifications.setNotificationCategoryAsync(REQUEST_CATEGORY, [
  { identifier: ACTION_ACCEPT, buttonTitle: 'Aceptar', options: { opensAppToForeground: !ACCEPT_WITHOUT_OPENING } },
  { identifier: ACTION_DECLINE, buttonTitle: 'Rechazar', options: { opensAppToForeground: true } },
]).catch(() => {});

/**
 * Registra el token de notificaciones push de este dispositivo mientras haya
 * sesión iniciada, y navega a la pantalla correspondiente cuando el usuario
 * toca una notificación (mensaje de chat, reseña nueva, favorito, verificación).
 */
export function usePushNotifications() {
  const { status } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Acciones de botón recibidas antes de que la sesión esté lista (app que
  // estaba cerrada): se aplican cuando hay sesión.
  const pendingAccept = useRef<string | null>(null);
  const handled = useRef(new Set<string>());

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

  const lastResponse = Notifications.useLastNotificationResponse();

  // Citas: tocar la notificación abre la cita; el botón Aceptar la acepta.
  // useLastNotificationResponse también cubre la app que arrancó desde la notificación.
  useEffect(() => {
    if (!lastResponse) return;
    const data = lastResponse.notification.request.content.data as NotificationData;
    if (!data?.type?.startsWith('appointment_') || !data.appointment_id) return;
    const key = `${lastResponse.notification.request.identifier}:${lastResponse.actionIdentifier}`;
    if (handled.current.has(key)) return;
    handled.current.add(key);

    const appointmentId = data.appointment_id;
    if (lastResponse.actionIdentifier === ACTION_ACCEPT) {
      pendingAccept.current = appointmentId;
    } else if (lastResponse.actionIdentifier === ACTION_DECLINE) {
      router.push({ pathname: '/appointment/decline/[id]', params: { id: appointmentId } });
    } else {
      router.push({ pathname: '/appointment/[id]', params: { id: appointmentId } });
    }
  }, [lastResponse, router]);

  useEffect(() => {
    if (status !== 'signedIn' || !pendingAccept.current) return;
    const appointmentId = pendingAccept.current;
    pendingAccept.current = null;
    agendaApi
      .accept(appointmentId)
      .catch(() => {
        // Ya venció, la tomó otro dispositivo, etc.: la pantalla de la cita muestra el estado real.
      })
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
        void queryClient.invalidateQueries({ queryKey: ['agenda'] });
        router.push({ pathname: '/appointment/[id]', params: { id: appointmentId } });
      });
  }, [status, lastResponse, queryClient, router]);

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
        case 'subscription':
          if (data.entity_id) {
            router.push({ pathname: '/business/subscription/[id]', params: { id: data.entity_id } });
          }
          break;
        default:
          break;
      }
    });
    return () => subscription.remove();
  }, [router]);
}
