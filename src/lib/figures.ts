import type { FigureKey } from '@/components/figures/figureData';

/**
 * Qué figura le toca a una categoría o sección, por su nombre. Solo las que ya existen (23); si ninguna encaja,
 * devuelve null y se muestra el ícono de la categoría. Se busca por palabras, sin tildes ni mayúsculas, y gana la
 * primera regla que coincide (de la más específica a la más general).
 */
const RULES: [RegExp, FigureKey][] = [
  [/camis|polo|blusa|camiset|top\b|buzo|ropa interior|pijama|uniform/, 'camisetas'],
  [/pantal|jean|short|bermuda|sudadera|falda/, 'pantalones'],
  [/vestid|enterizo|traje/, 'vestidos'],
  [/calzad|zapat|tenis|sandal|chancl|bota/, 'calzado'],
  [/gorra|sombrer/, 'gorras'],
  [/accesori|bolso|cartera|joy|bisuter|reloj|tienda|comercio|minimercado|mercado|abarrot|variedad|papeler|miscel/, 'accesorios'],
  [/pescad|marisc|ceviche|pez/, 'pescados'],
  [/fruver|fruta|verdura|legumbre|hortaliz/, 'fruver'],
  [/panad|pan\b|panes|arepa|empanad|bocadill|cafeter|cafe/, 'panaderia'],
  [/postre|helad|torta|ponque|dulce|reposter/, 'postres'],
  [/licor|cerveza|bar\b|bares|vino|trago|coctel|vida nocturna/, 'licores'],
  [/bebida|jugo|batido|gaseosa|agua|refresco|limonada/, 'bebidas'],
  [/comida|restaur|almuerzo|corrientazo|hamburg|perro|salchipapa|pizza|plato|sopa|asado|pollo|carne|fritos|desayun|cena|menu|adicional/, 'comidas'],
  [/uña|unas|manicur|pedicur|spa|maquill|cosmet/, 'unas'],
  [/belleza|pelu|barber|corte|cabello|peinad|tinte/, 'cortes'],
  [/salud|droguer|farmac|medic|suplement|vitamin|bienestar|odonto|optica|cuidado personal/, 'suplementos'],
  [/mascota|veterin|perro|gato|concentrad/, 'mascotas'],
  [/clase|educa|refuerzo|curso|tutor|idioma|escuela|colegio|libro|papel/, 'clases'],
  [/tecnolog|celular|computad|electron|accesorios de celular|reparacion de celular/, 'tecnologia'],
  [/deport|gimnas|gym|balon|recreac|entrenamiento|suplementos deportivos/, 'deporte'],
  [/hogar|casa|ferret|plomer|electricist|pintur|limpieza|mueble|decorac|aseo/, 'hogar'],
  [/taller|automot|moto|carro|mecan|arreglo|reparac|lavadero|llanta|herramient|cerrajer/, 'talleres'],
  [/insumo|empaque|desechable|bolsa|caja|bodega|otros/, 'insumos'],
];

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function figureFor(name: string | null | undefined): FigureKey | null {
  if (!name) return null;
  const n = normalizeName(name);
  for (const [re, key] of RULES) {
    if (re.test(n)) return key;
  }
  return null;
}
