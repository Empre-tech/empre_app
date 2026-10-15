import { request } from './client';
import type {
  BusinessStatus,
  DiscoveryItem,
  Offer,
  OfferClaim,
  OfferInput,
  OffersFeed,
  Promotion,
  PromotionInput,
  PromotionStatus,
  QuickAction,
  RedeemResult,
} from './types';

function list<T>(res: { data?: T[] | null }): T[] {
  return res?.data ?? [];
}

export interface DiscoveryParams {
  /** Rectángulo visible del mapa. */
  min_lat?: number;
  max_lat?: number;
  min_lng?: number;
  max_lng?: number;
  /** Ubicación del usuario (referencia para la distancia). */
  lat?: number;
  long?: number;
  category?: string;
  subcategory?: string;
  q?: string;
  /** "", "now", "today", "week" */
  offer?: string;
  limit?: number;
}

export interface DiscoveryResponse {
  items: DiscoveryItem[];
  total: number;
}

export const discoveryApi = {
  /** Negocios rankeados y diversificados para el área visible + total (público). */
  discover: async (params: DiscoveryParams = {}): Promise<DiscoveryResponse> => {
    const res = await request<{ items?: DiscoveryItem[] | null; data?: DiscoveryItem[] | null; total?: number }>(
      '/api/discovery',
      { auth: false, query: { ...params } },
    );
    // Acepta tanto { items } (contrato nuevo) como { data } (contrato anterior),
    // por si el backend todavía no se reinició con el cambio.
    const items = res.items ?? res.data ?? [];
    return { items, total: res.total ?? 0 };
  },
};

export const offersApi = {
  /** Publica una oferta (dueño). */
  publish: (entityId: string, input: OfferInput) =>
    request<Offer>(`/api/entities/${entityId}/offers`, { method: 'POST', body: input }),

  /** Ofertas del negocio (dueño). */
  list: async (entityId: string): Promise<Offer[]> =>
    list(await request<{ data?: Offer[] | null }>(`/api/entities/${entityId}/offers`)),

  /** Oferta activa de un negocio (público). */
  active: (entityId: string) => request<{ data: Offer | null }>(`/api/entities/${entityId}/offer`, { auth: false }),

  /** Acción rápida: extend (minutos), radius (metros) o slots (cantidad a sumar). */
  quickAction: (offerId: string, action: QuickAction, value: number) =>
    request<Offer>(`/api/offers/${offerId}`, { method: 'PATCH', body: { action, value } }),

  /** Clona una oferta como publicación nueva. */
  republish: (offerId: string, input: OfferInput) =>
    request<Offer>(`/api/offers/${offerId}/republish`, { method: 'POST', body: input }),

  /** Pestaña Ofertas: relámpagos y promociones activos (público). */
  feed: async (
    params: { lat?: number; long?: number; category?: string; order?: 'near' | 'trending' } = {},
  ): Promise<OffersFeed> => {
    const res = await request<{
      relampagos?: OffersFeed['relampagos'] | null;
      promotions?: OffersFeed['promotions'] | null;
    }>('/api/offers', { auth: false, query: { ...params } });
    return { relampagos: res.relampagos ?? [], promotions: res.promotions ?? [] };
  },
};

export const claimsApi = {
  /** Reclama una oferta (reserva cupo, devuelve QR). */
  claim: (offerId: string, latitude?: number, longitude?: number) =>
    request<OfferClaim>(`/api/offers/${offerId}/claim`, { method: 'POST', body: { latitude, longitude } }),

  /** Mi reclamo (QR + tiempo restante). */
  get: (claimId: string) => request<OfferClaim>(`/api/claims/${claimId}`),

  /** Libera el cupo. */
  cancel: (claimId: string) => request<{ message: string }>(`/api/claims/${claimId}`, { method: 'DELETE' }),

  /** El negocio escanea por id (token decodificado del QR). */
  redeem: (claimId: string, device?: string) =>
    request<RedeemResult>(`/api/claims/${claimId}/redeem`, { method: 'POST', body: { device } }),

  /** El negocio canjea por código corto. */
  redeemCode: (code: string, device?: string) =>
    request<RedeemResult>('/api/claims/redeem-code', { method: 'POST', body: { code, device } }),

  /** El cliente confirma el canje (antifraude). */
  confirm: (claimId: string) => request<{ message: string }>(`/api/claims/${claimId}/confirm`, { method: 'POST' }),
};

export const statusApi = {
  /** Disponibilidad en tiempo real de un negocio (público). */
  get: (entityId: string) => request<BusinessStatus>(`/api/entities/${entityId}/status`, { auth: false }),

  /** Actualiza la disponibilidad (dueño). */
  update: (entityId: string, availability: string) =>
    request<BusinessStatus>(`/api/entities/${entityId}/status`, { method: 'PATCH', body: { availability } }),
};

export const promotionsApi = {
  /** Publica una promoción (dueño). */
  publish: (entityId: string, input: PromotionInput) =>
    request<Promotion>(`/api/entities/${entityId}/promotions`, { method: 'POST', body: input }),

  /** Promociones del negocio (dueño). */
  list: async (entityId: string): Promise<Promotion[]> =>
    list(await request<{ data?: Promotion[] | null }>(`/api/entities/${entityId}/promotions`)),

  /** Promociones activas de un negocio (público). */
  active: async (entityId: string): Promise<Promotion[]> =>
    list(await request<{ data?: Promotion[] | null }>(`/api/entities/${entityId}/promotions/active`, { auth: false })),

  /** Edita o cambia el estado de una promoción (dueño). */
  update: (promotionId: string, input: Partial<PromotionInput> & { status?: PromotionStatus }) =>
    request<Promotion>(`/api/promotions/${promotionId}`, { method: 'PATCH', body: input }),
};
