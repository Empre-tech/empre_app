import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initAnalytics } from '@/analytics/track';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ChatProvider } from '@/chat/ChatProvider';
import { usePushNotifications } from '@/notifications/usePushNotifications';
import { UploadCapsule } from '@/upload/UploadCapsule';
import { initUploads } from '@/upload/uploadStore';
import { colors } from '@/theme';

// Se mantiene la splash nativa visible hasta que Nunito y Manrope estén
// listas, así se evita el "parpadeo" de la tipografía del sistema al abrir.
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
      <Stack.Screen name="business/[id]" />
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
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  // Medición anónima: lee (o crea) el identificador y la preferencia; no bloquea nada.
  useEffect(() => {
    void initAnalytics();
  }, []);

  // Cola de subidas: se conecta con la caché (para mostrar lo publicado al instante) y recupera lo que quedó sin subir.
  useEffect(() => {
    void initUploads(queryClient);
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
            <UploadCapsule />
          </ChatProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
