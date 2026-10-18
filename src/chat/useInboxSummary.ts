import { useQuery } from '@tanstack/react-query';

import { inboxApi } from '@/api/inbox';
import { useAuth } from '@/auth/AuthContext';
import { inboxCounts } from '@/lib/inbox';

/**
 * Lo pendiente del usuario para las insignias. Se refresca solo con cada mensaje o cambio de cita que llega por el
 * WebSocket (ChatProvider invalida ['inbox-summary']) y, por si el socket está caído, cada minuto.
 */
export function useInboxSummary() {
  const { status } = useAuth();
  const q = useQuery({
    queryKey: ['inbox-summary'],
    queryFn: inboxApi.summary,
    enabled: status === 'signedIn',
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  return inboxCounts(status === 'signedIn' ? q.data : null);
}
