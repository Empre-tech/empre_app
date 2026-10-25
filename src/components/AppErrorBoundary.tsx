import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { reportJsError } from '@/analytics/health';
import { EmptyState } from '@/components/EmptyState';
import { colors, spacing } from '@/theme';

/**
 * Si una pantalla falla al dibujarse (3.53), en vez de quedar en blanco se dice qué pasó y se puede reintentar. El
 * error se reporta (solo el mensaje y la pantalla, sin datos de la persona) por la medición anónima de uso.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportJsError(error, 'render');
  }, [error]);
  return (
    <View style={styles.screen}>
      <EmptyState
        icon="alert-circle-outline"
        title="Algo falló en esta pantalla"
        body="No perdiste nada de lo que registraste. Inténtalo de nuevo; si sigue pasando, vuelve al inicio."
        action={{ title: 'Reintentar', onPress: () => void retry() }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl },
});
