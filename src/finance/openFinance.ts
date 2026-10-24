import type { useRouter } from 'expo-router';
import { requestFinance } from './FinanceHost';

type Router = ReturnType<typeof useRouter>;

/**
 * Abre la bandeja de Empre Finance (con el negocio, si se conoce). La capa (FinanceHost) ya evita abrir dos a la vez;
 * si todavía no está montada, se pasa por la ruta /finance, que la abre al montarse.
 */
export function openFinance(router: Router, entityId?: string) {
  const params = entityId ? { entity: entityId } : {};
  if (!requestFinance(params)) router.push({ pathname: '/finance', params });
}
