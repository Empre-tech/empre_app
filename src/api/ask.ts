import { request } from './client';

/** Condiciones que se apilan en «Pregúntale a Empre». */
export interface AskFilters {
  open_now: boolean;
  with_offer: boolean;
  delivery: boolean;
  cheapest: boolean;
}

export interface AskItem {
  id: string;
  name: string;
  price: number | null;
  price_from: boolean;
  photo?: string;
  section?: string;
  entity_id: string;
  entity_name: string;
  minutes: number;
}

export interface AskBusiness {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  category_icon: string;
  profile_url: string;
  latitude: number;
  longitude: number;
  is_open_now: boolean;
  has_hours: boolean;
  has_active_offer: boolean;
  distance_km: number;
  minutes: number;
  delivery: boolean;
  /** Verificado por Empre (3.66; un backend viejo no lo manda). */
  is_verified?: boolean;
  item?: AskItem;
}

export interface AskResponse {
  /** Texto armado por el servidor con los datos reales (nunca inventado por la IA). */
  reply: string;
  /** Lo que entendió que se busca («almuerzo»). */
  terms: string;
  filters: AskFilters;
  businesses: AskBusiness[];
  items: AskItem[];
  /** No había cerca: se buscó más lejos. */
  widened: boolean;
  suggestions: string[];
  used_ai: boolean;
  /** Cupo del mes de quien pregunta (solo en las preguntas con IA). */
  quota?: AskQuota;
}

/** Preguntas a «Pregúntale a Empre» este mes: 10 gratis, 300 con la suscripción. */
export interface AskQuota {
  used: number;
  limit: number;
  plan: 'free' | 'plus';
  resets_at: string;
}

export interface AskParams {
  q: string;
  lat?: number;
  long?: number;
  open?: boolean;
  offer?: boolean;
  delivery?: boolean;
  cheap?: boolean;
  /** false: búsqueda solo por palabras, sin IA (la caja de Vitrina). Pública y sin gastar el cupo. */
  ai?: boolean;
}

export const askApi = {
  /** GET /api/ask: negocios reales cerca para lo que el cliente pide. Con IA pide sesión y gasta el cupo del mes. */
  ask: async (p: AskParams): Promise<AskResponse> => {
    const withAI = p.ai !== false;
    const res = await request<AskResponse>('/api/ask', {
      auth: withAI,
      query: {
        q: p.q,
        ...(withAI ? {} : { ai: 0 }),
        ...(p.lat !== undefined ? { lat: p.lat, long: p.long } : {}),
        ...(p.open ? { open: 1 } : {}),
        ...(p.offer ? { offer: 1 } : {}),
        ...(p.delivery ? { delivery: 1 } : {}),
        ...(p.cheap ? { cheap: 1 } : {}),
      },
    });
    // Un backend viejo puede mandar null en vez de listas vacías.
    return { ...res, businesses: res.businesses ?? [], items: res.items ?? [], suggestions: res.suggestions ?? [] };
  },
};
