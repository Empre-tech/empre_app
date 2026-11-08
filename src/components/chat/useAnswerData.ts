import { useQuery } from '@tanstack/react-query';
import { agendaApi } from '@/api/agenda';
import { answersApi } from '@/api/answers';
import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { statusApi } from '@/api/offers';
import { useActiveOffers } from '@/components/OfferBanner';
import { FEATURES } from '@/config';
import type { AnswerData } from '@/lib/answers';
import { catalogCopy } from '@/lib/catalog';

/**
 * Lo que Empre AI necesita para responder por un negocio (3.62): lo que el negocio publicó y nada más. Usa las mismas
 * consultas (y la misma caché) que el perfil, así que abrir el chat desde el perfil no pide nada otra vez. `null`
 * mientras no llega el negocio.
 */
export function useAnswerData(entityId: string | undefined, enabled: boolean, signedIn: boolean): (AnswerData & { aiChatOff: boolean }) | null {
  const id = entityId ?? '';
  const on = enabled && Boolean(entityId);
  const business = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id), enabled: on });
  const catalog = useQuery({ queryKey: ['catalog', id], queryFn: () => catalogApi.list(id), enabled: on, staleTime: 60_000 });
  const offers = useActiveOffers(id, on);
  const status = useQuery({ queryKey: ['status', id], queryFn: () => statusApi.get(id), enabled: on, staleTime: 60_000 });
  const taught = useQuery({ queryKey: ['business-answers', id], queryFn: () => answersApi.list(id), enabled: on, staleTime: 60_000 });
  const agenda = useQuery({ queryKey: ['agenda-summary', id], queryFn: () => agendaApi.summary(id), enabled: on && FEATURES.agenda && signedIn, staleTime: 20_000 });

  const b = business.data;
  if (!b) return null;
  const hasHours = Boolean(b.hours && b.hours.length > 0);
  return {
    name: b.name,
    noun: catalogCopy(b.category?.name, b.business_profile).noun,
    services: catalog.data ?? [],
    offers: (offers.data ?? []).map((o) => ({ id: o.id, title: o.title, conditions: o.conditions, ends_at: o.ends_at, items: o.items })),
    hours: b.hours ?? [],
    isOpenNow: hasHours ? Boolean(b.is_open_now) : null,
    availability: status.data?.availability || null,
    serviceMode: b.service_mode ?? '',
    agendaOn: FEATURES.agenda && Boolean(agenda.data?.enabled),
    taught: taught.data?.data ?? [],
    aiChatOff: taught.data?.ai_chat_off ?? false,
  };
}
