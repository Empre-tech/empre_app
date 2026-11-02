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
}

export interface AskParams {
  q: string;
  lat?: number;
  long?: number;
  open?: boolean;
  offer?: boolean;
  delivery?: boolean;
  cheap?: boolean;
}

export const askApi = {
  /** GET /api/ask: negocios reales cerca para lo que el cliente pide (público). */
  ask: async (p: AskParams): Promise<AskResponse> => {
    const res = await request<AskResponse>('/api/ask', {
      auth: false,
      query: {
        q: p.q,
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
