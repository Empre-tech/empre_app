/**
 * «¿Me recomiendas algún negocio?» (3.67): cuando la pregunta pide una recomendación sin decir de qué, Empre AI no
 * busca la palabra «negocio»: recomienda de lo que hay cerca, con reglas y sin IA, y dice por qué. Si la pregunta sí
 * nombra algo («recomiéndame una barbería»), es una búsqueda normal. Sin React para probarlo con Node.
 */

const plain = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ASKS = /\b(recomi\w*|recomend\w*|sugier\w*|sugerenc\w*|que hay (bueno|cerca|por aqui)|que me (recomiendas|sugieres)|a donde (voy|puedo ir)|que hago|algo bueno|algo rico)\b/;

/** Palabras que no dicen qué se busca: si solo quedan estas, se recomienda de lo cercano. */
const VAGUE = new Set(
  'me te le nos podes puedes podrias podria por favor algun alguno alguna algunos algunas un una unos unas el la los las lo de del en a al y o que cual cuales donde hay para mi bueno buena buenos buenas rico rica cerca aqui aca por sitio sitios lugar lugares negocio negocios local locales opcion opciones cosa cosas algo nada hoy ahora esta este zona barrio porfa recomiendas recomienda recomiendame recomendarme recomendar recomendacion recomendaciones sugieres sugiere sugerencia sugerencias sugerirme hago voy ir puedo quiero'.split(' '),
);

export function isRecommendAsk(text: string): boolean {
  const t = plain(text);
  if (!ASKS.test(t)) return false;
  return t.split(' ').every((w) => VAGUE.has(w) || w.length <= 2 || ASKS.test(w));
}

export interface RecPlace {
  id: string;
  name: string;
  category_name: string;
  distance_meters: number;
  is_open_now: boolean;
  has_hours?: boolean;
  has_active_offer: boolean;
  active_offer_title?: string;
  avg_rating?: number;
  review_count?: number;
  is_verified?: boolean;
}

export interface Recommendation<T extends RecPlace> {
  place: T;
  /** Por qué lo recomienda, en frases cortas y verdaderas («Abierto ahora», «a 4 min a pie»). */
  reasons: string[];
}

const walkMin = (m: number) => Math.max(1, Math.round(m / 80));

/**
 * Hasta `max` lugares cercanos: abiertos primero, luego cercanía, oferta y buena calificación (con reseñas). Uno por
 * categoría, para que no sean tres panaderías. Nadie paga por subir.
 */
export function pickRecommendations<T extends RecPlace>(places: T[], max = 3): Recommendation<T>[] {
  const score = (p: T) => {
    let s = 0;
    if (p.is_open_now) s += 3;
    if (p.distance_meters > 0 && p.distance_meters <= 400) s += 2;
    else if (p.distance_meters > 0 && p.distance_meters <= 800) s += 1.5;
    else if (p.distance_meters > 0 && p.distance_meters <= 1600) s += 0.5;
    if (p.has_active_offer) s += 1.5;
    if ((p.review_count ?? 0) > 0 && (p.avg_rating ?? 0) >= 4.5) s += 1;
    if (p.is_verified) s += 0.5;
    return s;
  };
  const ranked = places.map((p, i) => ({ p, s: score(p), i })).sort((a, b) => b.s - a.s || a.p.distance_meters - b.p.distance_meters || a.i - b.i);
  const cats = new Set<string>();
  const out: Recommendation<T>[] = [];
  for (const { p } of ranked) {
    if (out.length >= max) break;
    if (cats.has(p.category_name)) continue;
    cats.add(p.category_name);
    const reasons: string[] = [];
    if (p.is_open_now) reasons.push('Abierto ahora');
    if (p.distance_meters > 0) reasons.push(p.distance_meters <= 1600 ? `a ${walkMin(p.distance_meters)} min a pie` : `a ${(p.distance_meters / 1000).toFixed(1).replace('.', ',')} km`);
    if (p.has_active_offer) reasons.push(p.active_offer_title ? `Oferta: ${p.active_offer_title}` : 'Tiene oferta hoy');
    if ((p.review_count ?? 0) > 0 && (p.avg_rating ?? 0) >= 4.5) reasons.push(`★ ${(p.avg_rating ?? 0).toFixed(1).replace('.', ',')}`);
    out.push({ place: p, reasons });
  }
  return out;
}

/** La frase de Empre AI antes de las recomendaciones: dice con qué criterio eligió, sin prometer de más. */
export function recommendLead<T extends RecPlace>(recs: Recommendation<T>[]): string {
  if (!recs.length) return 'Todavía no hay negocios cerca de ti en Empre. Dime qué necesitas y lo busco más lejos.';
  const open = recs.filter((r) => r.place.is_open_now).length;
  if (open === recs.length) return recs.length === 1 ? 'Abierto ahora y cerca de ti, te recomiendo este:' : `Abiertos ahora y cerca de ti, te recomiendo estos ${recs.length}:`;
  if (open === 0) return 'Ahora no hay nada abierto cerca. Estos son los más cercanos para cuando abran:';
  return 'Cerca de ti, empezando por lo que está abierto ahora:';
}
