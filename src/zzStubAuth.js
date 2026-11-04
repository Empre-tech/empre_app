import React from 'react';
const iso = (m) => new Date(Date.now() - m * 60000).toISOString();
const ends = (m) => new Date(Date.now() + m * 60000).toISOString();
const off = (id, eid, biz, title, s, r, m, icon, d, lat, lng) => ({ id, entity_id: eid, title, type: 'descuento', price: String(s), normal_price: String(r), ends_at: ends(m), starts_at: iso(600), special_price: s, reference_price: r, saving: r - s, total_slots: 10, used_slots: 3, slots_left: 7, radius_meters: 2000, repeat_policy: 'once', conditions: 'Válido de lunes a sábado. No se acumula con otras promociones.', claim_window_minutes: 120, entity_name: biz, category_name: 'Restaurante', category_icon: icon, distance_meters: d, kind: 'offer', latitude: lat, longitude: lng, open_now: true, items: [{ name: title, price: r }] });
const O = [off('o1', 'b1', 'Casa Canoas', 'Almuerzo típico 2 × 1', 14000, 28000, 120, 'restaurant-outline', 150, 11.24, -74.21), off('o2', 'b2', 'Café Quinta de San Pedro', '2 × 1 en capuchino', 8000, 16000, 40, 'cafe-outline', 180, 11.241, -74.211), off('o3', 'b3', 'Almacén El Faro', 'Camisas de lino', 45000, 60000, 300, 'shirt-outline', 260, 11.242, -74.212)];
const route = { theme: 'zone', level: 'walk', zone: 'Centro Histórico', stops: O, times: [ends(30), ends(90), ends(150)], saving: 37000, walk_meters: 200, total_price: 67000, distance_from_you: 150 };
if (typeof window !== 'undefined') window.__zzPlan = JSON.stringify(route);
const market = { has_location: true, city: 'Santa Marta', zone: 'Centro Histórico', zones: [{ id: 'z1', name: 'Centro Histórico', distance_meters: 0, here: true, latitude: 11.24, longitude: -74.21, looks: [] }], featured: O[0], near: O, searched: { terms: [], term: '', items: [] }, trending: [], for_you: { top_rated: false, items: [] }, routes: [route] };
const cat = { id: 'c1', name: 'Barbería', icon: 'cut-outline', color: '#0E2346' };
const hours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, weekday: d, open_time: '09:00', close_time: '20:00', opens_at: '09:00', closes_at: '20:00', is_closed: d === 0, closed: d === 0 }));
const entity = (id) => ({ id, name: id === 'b1' ? 'Casa Canoas' : 'Barbería El Prado', description: 'Cortes clásicos y arreglo de barba en el corazón de El Prado. Atendemos con cita o por orden de llegada.', category: cat, category_id: 'c1', subcategories: [{ id: 's', name: 'Barbería' }], address: 'Calle 22 # 3-41, El Prado', city: 'Santa Marta', contact_info: '3001234567', banner_url: '', profile_url: '', latitude: 11.24, longitude: -74.21, verification_status: 'verified', is_verified: true, owner_id: 'owner', created_at: iso(90000), photos: [], avg_rating: 4.7, review_count: 128, is_favorite: false, service_mode: 'both', hours, is_open_now: true, business_profile: 'service', closes_at: '20:00' });
const claim = (id, st, title, biz, mins, oo) => ({ id, offer_id: oo.id, status: st, token: 'tok' + id, short_code: 'EMP-4821', claimed_at: iso(mins + 30), expires_at: st === 'RECLAMADO' ? ends(mins) : iso(mins), redeemed_at: st === 'CANJEADO' ? iso(mins) : undefined, offer: { ...oo, title }, entity_name: biz });
const claims = [claim('k1', 'RECLAMADO', 'Almuerzo típico 2 × 1', 'Casa Canoas', 90, O[0]), claim('k2', 'CANJEADO', 'Corte + arreglo de barba', 'Barbería El Prado', 1500, O[1]), claim('k3', 'EXPIRADO', 'Café de la tarde 2 × 1', 'Café Taganga', 3000, O[1]), claim('k4', 'CANCELADO', 'Semana de prueba', 'Gimnasio Fit Beach', 4500, O[2])];
const svc = [{ id: 's1', entity_id: 'b2', name: 'Arreglo de barba', duration_min: 30, active: true }, { id: 's2', entity_id: 'b2', name: 'Corte', duration_min: 40, active: true }];
const appts = [{ id: 'a1', entity_id: 'b2', kind: 'booking', service_id: 's1', status: 'completed', starts_at: iso(9000), ends_at: iso(8970), created_at: iso(9100), service: svc[0], entity: { id: 'b2', name: 'Barbería El Prado', owner_id: 'owner' }, cancelled_late: false }, { id: 'a2', entity_id: 'b2', kind: 'booking', service_id: 's2', status: 'confirmed', starts_at: ends(180), ends_at: ends(220), created_at: iso(60), service: svc[1], entity: { id: 'b2', name: 'Barbería El Prado', owner_id: 'owner' }, cancelled_late: false }];
const catalog = { data: [{ id: 'i1', entity_id: 'b2', name: 'Corte clásico', price: 22000, price_from: false, kind: 'service', section: 'Cortes', duration_min: 40, photos: [], active: true }, { id: 'i2', entity_id: 'b2', name: 'Arreglo de barba', price: 18000, price_from: false, kind: 'service', section: 'Barba', duration_min: 30, photos: [], active: true }, { id: 'i3', entity_id: 'b2', name: 'Corte + barba', price: 35000, price_from: false, kind: 'service', section: 'Cortes', duration_min: 60, photos: [], active: true }] };
const routes = [
  [/offers\/market\/all/, { items: O, next_cursor: '' }],
  [/offers\/market/, market],
  [/claims/, { data: claims }],
  [/agenda\/summary/, { enabled: true, next_slot: ends(200), slot_minutes: 30, horizon_days: 7, services: svc, intake_mode: 'auto' }],
  [/agenda\/availability/, { slots: [ends(240), ends(300), ends(360)] }],
  [/appointments\/mine/, { data: appts }],
  [/novedades/, { data: [] }],
  [/favorites/, { data: [] }],
  [/\/offers(\/active)?(\?|$)/, { data: O }],
  [/catalog/, catalog],
  [/reviews/, { data: [{ id: 'r1', rating: 5, comment: 'Excelente atención, muy puntuales.', created_at: iso(3000), user: { id: 'u9', name: 'Mario P.' } }], meta: { total: 1, page: 1, page_size: 10 } }],
  [/\/status/, { status: 'normal', message: '' }],
  [/entities\/(b\d)(\?|$)/, null],
  [/zones/, { data: [{ id: 'z1', name: 'Centro Histórico', latitude: 11.24, longitude: -74.21 }] }],
  [/categories/, { data: [cat] }],
  [/discover/, { items: [], next_cursor: '' }],
];
if (typeof window !== 'undefined' && !window.__zz) {
  window.__zz = true;
  const real = window.fetch;
  window.fetch = async (u, o) => {
    const s = String(u);
    if (s.includes('/api/')) {
      const hit = routes.find(([re]) => re.test(s));
      window.__zzLog = (window.__zzLog || []).concat(s.replace(/^.*\/api/, ''));
      const m = s.match(/entities\/(b\d)(\?|$)/);
      const body = m ? entity(m[1]) : hit ? hit[1] : { data: [] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return real(u, o);
  };
}
const value = { status: 'signedIn', user: { id: 'u1', name: 'Laura Pérez', email: 'x@y.z' }, signIn: async () => {}, signUp: async () => {}, signOut: async () => {}, refreshUser: async () => {} };
export function AuthProvider({ children }) {
  return <>{children}</>;
}
export function useAuth() {
  return value;
}
