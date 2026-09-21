import type { useRouter } from 'expo-router';

type AppRouter = ReturnType<typeof useRouter>;

/** Cierra el flujo de autenticación: vuelve a donde estaba el usuario, o al inicio. */
export function finishAuth(router: AppRouter) {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}
