// Cada peso por su ruta (3.53): importar del paquete completo metía en el bundle los 18 pesos de cada familia
// (~2,4 MB de Nunito) aunque se usan 8.
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initHealth, reportAppStart } from '@/analytics/health';
import { initAnalytics } from '@/analytics/track';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { ChatProvider } from '@/chat/ChatProvider';
import { FinanceHost } from '@/finance/FinanceHost';
import { useFinanceQuickAction } from '@/finance/quickActions';
import { OfflineBanner } from '@/components/OfflineBanner';
import { usePushNotifications } from '@/notifications/usePushNotifications';
import { UploadCapsule } from '@/upload/UploadCapsule';
import { initUploads } from '@/upload/uploadStore';
import { flushLedger, initLedgerOutbox } from '@/ledger/ledgerStore';
import { colors } from '@/theme';

// Si la app se abre directo en una ruta (empre://finance), debajo queda Explorar: así cerrar no deja la pantalla vacía.
export const unstable_settings = { initialRouteName: '(tabs)' };

// Cuándo empezó a correr el código de la app (este archivo se carga de los primeros). En Hermes, performance.now() no
// cuenta desde el arranque del JS, así que se usa esta marca para medir hasta la primera pantalla (3.53).
const JS_STARTED_AT = Date.now();

// Si una pantalla falla al dibujarse, en vez de quedar en blanco se ofrece reintentar (3.53).
export { AppErrorBoundary as ErrorBoundary } from '@/components/AppErrorBoundary';

// Se mantiene la splash nativa visible hasta que Nunito y Manrope estén
// listas, así se evita el "parpadeo" de la tipografía del sistema al abrir.
void SplashScreen.preventAutoHideAsync().catch(() => {});

function AppStack() {
  const { status } = useAuth();
  // Registra el token push (si ya hay sesión) y navega al tocar una
  // notificación; vive aquí porque necesita el router y el estado de sesión.
  usePushNotifications();
  // Acceso rápido del ícono (mantener pulsado → «Empre Finance»).
  useFinanceQuickAction();

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
      {/* empre://finance: solo abre la capa de Finance (FinanceHost) y vuelve; transparente para que no parpadee. */}
      <Stack.Screen name="finance" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
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

  // Medición anónima: lee (o crea) el identificador y la preferencia; no bloquea nada. Con ella, la salud de la app
  // (3.53): peticiones lentas o fallidas y errores que no atrapa ninguna pantalla.
  useEffect(() => {
    void initAnalytics();
    initHealth();
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
    if (!fontsLoaded && !fontError) return;
    void SplashScreen.hideAsync();
    // Arranque: desde que empezó el código de la app hasta la primera pantalla (fuentes listas, splash fuera).
    reportAppStart(Date.now() - JS_STARTED_AT);
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
            {/* Empre Finance es una capa sobre la navegación (3.46 F3): así su vidrio desenfoca la app también en Android. */}
            <FinanceHost>
              <AppStack />
            </FinanceHost>
            <UploadCapsule />
            <OfflineBanner />
          </ChatProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
