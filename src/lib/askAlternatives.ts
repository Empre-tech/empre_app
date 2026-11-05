// Búsqueda sin resultados: qué es parecido a lo que se pidió. Es una tabla de reglas, sin modelo de lenguaje, y lo parecido
// siempre se presenta como parecido: nunca se da a entender que el negocio vende lo que se buscó. Sin imports: corre igual
// con `node --test`.

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .trim();

const COMIDA = ['restaurantes', 'cafeterias, panaderias y postres'];
const BELLEZA = ['belleza y peluqueria'];
const TIENDAS = ['tiendas y comercio'];
const HOGAR = ['servicios del hogar'];
const CARRO = ['automotriz'];
const SALUD = ['salud y bienestar'];

interface Rule {
  /** Empieza así, sin tildes. */
  stem: string;
  /** Cómo se dice en «Aún no hay … cerca». */
  plural: string;
  /** Cómo se llama lo parecido en «Otras opciones de …». */
  family: string;
  categories: string[];
}

const rule = (family: string, categories: string[], list: [string, string][]): Rule[] => list.map(([stem, plural]) => ({ stem, plural, family, categories }));

const RULES: Rule[] = [
  ...rule('comida', COMIDA, [['pizz', 'pizzerías'], ['hamburg', 'hamburguesas'], ['perro caliente', 'perros calientes'], ['sushi', 'sushi'], ['arepa', 'arepas'], ['empanada', 'empanadas'], ['pollo', 'pollo asado'], ['asado', 'asados'], ['mariscos', 'mariscos'], ['pescado', 'pescado']]),
  ...rule('café y dulces', COMIDA, [['panad', 'panaderías'], ['pasteler', 'pastelerías'], ['helad', 'heladerías'], ['torta', 'tortas']]),
  ...rule('belleza', BELLEZA, [['barber', 'barberías'], ['peluquer', 'peluquerías'], ['salon de belleza', 'salones de belleza'], ['manicure', 'manicure'], ['unas', 'salones de uñas'], ['maquillaje', 'maquillaje']]),
  ...rule('tiendas', TIENDAS, [['supermercado', 'supermercados'], ['ferreter', 'ferreterías'], ['zapater', 'zapaterías'], ['calzado', 'calzado'], ['boutique', 'boutiques'], ['papeler', 'papelerías'], ['licorera', 'licoreras']]),
  ...rule('servicios del hogar', HOGAR, [['plomer', 'plomeros'], ['electricista', 'electricistas'], ['cerrajer', 'cerrajeros'], ['pintor', 'pintores'], ['lavanderia', 'lavanderías']]),
  ...rule('servicios para tu carro o moto', CARRO, [['taller', 'talleres'], ['mecanic', 'mecánicos'], ['lavadero', 'lavaderos'], ['montallanta', 'montallantas']]),
  ...rule('salud', SALUD, [['odontolog', 'odontólogos'], ['dentista', 'dentistas'], ['medico', 'médicos'], ['psicolog', 'psicólogos'], ['optica', 'ópticas'], ['fisioterap', 'fisioterapeutas']]),
];

export interface AltFamily {
  plural: string;
  family: string;
  categories: string[];
}

/** La familia parecida a lo que se buscó; null si no hay regla: mejor no mostrar negocios sin relación. */
export function familyFor(terms: string): AltFamily | null {
  const words = norm(terms);
  const r = RULES.find((x) => (` ${words}`).includes(` ${x.stem}`));
  return r ? { plural: r.plural, family: r.family, categories: r.categories } : null;
}

export function noneTitle(terms: string, family: AltFamily | null): string {
  return family ? `Aún no hay ${family.plural} cerca` : `Aún no hay «${terms}» cerca`;
}

interface AltItem {
  category_name?: string;
  is_open_now?: boolean;
  has_active_offer?: boolean;
  distance_meters?: number;
}

export interface AltLists<T> {
  offers: T[];
  rest: T[];
}

/**
 * Los parecidos: de la familia y que cumplan lo pedido, con oferta aparte y primero lo abierto y lo más cerca. El orden no
 * se puede comprar: solo mira si está abierto y la distancia.
 */
export function pickAlternatives<T extends AltItem>(items: T[], family: AltFamily, filters: { open_now: boolean; with_offer: boolean }, limit = 5): AltLists<T> {
  const fit = items
    .filter((i) => family.categories.includes(norm(i.category_name ?? '')) && (!filters.open_now || i.is_open_now) && (!filters.with_offer || i.has_active_offer))
    .sort((a, b) => Number(Boolean(b.is_open_now)) - Number(Boolean(a.is_open_now)) || (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity))
    .slice(0, limit);
  return { offers: fit.filter((i) => i.has_active_offer), rest: fit.filter((i) => !i.has_active_offer) };
}

/** Un rectángulo de unos 3 km alrededor de la persona, para pedir lo que hay cerca. */
export function areaAround(lat: number, lng: number): { min_lat: number; max_lat: number; min_lng: number; max_lng: number } {
  const d = 0.027;
  return { min_lat: lat - d, max_lat: lat + d, min_lng: lng - d, max_lng: lng + d };
}
