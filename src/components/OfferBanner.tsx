import { useQuery } from '@tanstack/react-query';
import { offersApi } from '@/api/offers';

/**
 * Ofertas vigentes y con cupos del negocio (público), la que termina antes primero.
 * Las usan la ficha de ofertas del perfil, «Lo último» y el anillo del avatar.
 */
export function useActiveOffers(entityId: string, enabled = true) {
  return useQuery({
    queryKey: ['offers-active', entityId],
    queryFn: () => offersApi.activeList(entityId),
    enabled: enabled && Boolean(entityId),
  });
}
