import { useCallback, useState } from 'react';

/**
 * «Tirar para actualizar» (plan de experiencia, fase 0). La rueda solo gira cuando la persona tira de la lista, no en
 * las recargas automáticas de fondo (que no deben mover la pantalla). `refresh` recarga lo que la pantalla necesita.
 */
export function usePullRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refresh()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [refresh]);
  return { refreshing, onRefresh };
}
