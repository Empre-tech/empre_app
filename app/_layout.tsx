import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initAnalytics } from '@/analytics/track';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ChatProvider } from '@/chat/ChatProvider';
import { usePushNotifications } from '@/notifications/usePushNotifications';
import { UploadCapsule } from '@/upload/UploadCapsule';
import { initUploads } from '@/upload/uploadStore';
import { NoticeHost } from '@/components/Notice';
import { flushLedger, initLedgerOutbox } from '@/ledger/ledgerStore';
import { colors } from '@/theme';
import { GlobalEmpreButton } from '@/components/GlobalEmpreButton';
import { OfflineGate } from '@/components/system/OfflineGate';

// Se mantiene la splash nativa visible hasta que Inter esté
// lista, así se evita el "parpadeo" de la tipografía del sistema al abrir.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function AppStack() {
  const { status } = useAuth();
  // Registra el token push (si ya hay sesión) y navega al tocar una
  // notificación; vive aquí porque necesita el router y el estado de sesión.
  usePushNotifications();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
      {/* Al mapa se entra abriendo la puerta Explorar del inicio (3.60): un fundido corto, no el deslizamiento lateral. */}
      <Stack.Screen name="map" options={{ animation: 'fade', animationDuration: 180 }} />
      <Stack.Screen name="business/[id]" />
      {/* El producto se abre como hoja sobre lo que estabas viendo (2026-11-14), no como página entera. */}
      <Stack.Screen name="business/product" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="chat/[entityId]" />
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
      }),
  );

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Medición anónima: lee (o crea) el identificador y la preferencia; no bloquea nada.
  useEffect(() => {
    void initAnalytics();
  }, []);

  // Cola de subidas: se conecta con la caché (para mostrar lo publicado al instante) y recupera lo que quedó sin subir.
  useEffect(() => {
    void initUploads(queryClient);
  }, [queryClient]);

  // «Mi negocio»: registros guardados sin señal. Se envían al abrir la app y cada vez que vuelve al primer plano.
  useEffect(() => {
    void initLedgerOutbox(queryClient);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void flushLedger();
    });
    return () => sub.remove();
  }, [queryClient]);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Si algo falla al cargar las fuentes, seguimos igual: RN cae de vuelta a
  // la fuente del sistema en vez de dejar la app en blanco.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ChatProvider>
            <StatusBar style="dark" />
            <AppStack />
            <GlobalEmpreButton />
            <UploadCapsule />
            <NoticeHost />
            <OfflineGate />
          </ChatProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
