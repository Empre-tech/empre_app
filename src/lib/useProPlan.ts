import { useQueries, useQuery } from '@tanstack/react-query';
import { paymentsApi } from '@/api/endpoints';
import { isProSubscription } from '@/lib/proPlan';

/** La misma consulta que Mi negocio > Suscripción: al pagar ahí, lo cerrado se abre solo en toda la app. */
export function subscriptionQuery(entityId: string) {
  return { queryKey: ['subscription', entityId], queryFn: () => paymentsApi.getSubscription(entityId), staleTime: 5 * 60_000 };
}

/**
 * El plan de un negocio. Mientras no se sabe (`known` en falso) nada se muestra cerrado: si algo de Pro llega igual,
 * el servidor responde 402 y la pantalla ofrece pasarse a Pro.
 */
export function useEntityPlan(entityId?: string | null, enabled = true) {
  const q = useQuery({ ...subscriptionQuery(entityId ?? ''), enabled: enabled && Boolean(entityId) });
  const known = q.isSuccess;
  const pro = isProSubscription(q.data?.subscription);
  return { known, pro, base: known && !pro };
}

/** Los planes de varios negocios (el botón Empre): cuáles son Pro y si todos están en Base. */
export function usePlans(ids: string[], enabled = true) {
  const qs = useQueries({ queries: ids.map((id) => ({ ...subscriptionQuery(id), enabled })) });
  const proIds = ids.filter((_, i) => isProSubscription(qs[i]?.data?.subscription));
  const known = ids.length > 0 && qs.every((q) => q.isSuccess);
  return { proIds, known, allBase: known && proIds.length === 0 };
}
