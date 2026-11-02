// Catálogo del negocio (E2): cómo se escribe un precio habitual y qué tan vigente está. Sin React para poder
// probarlo con Node. Un precio ausente es «sin publicar», nunca cero.

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  /** Precio habitual en pesos; null = el negocio no publica precio. */
  price: number | null;
  price_from: boolean;
  price_updated_at: string | null;
  confirmed_at: string | null;
  /** Lo calcula el servidor: el precio se fijó o confirmó hace menos de 90 días. */
  fresh: boolean;
  /** Nombre de la sección en la que va («Almuerzos», «Cortes»). */
  section?: string;
  /** Id de esa sección en el catálogo de secciones de Empre. */
  section_id?: string | null;
  /** Para quién es (ropa, calzado, deporte): men, women, kids, unisex. Vacío = no se dijo. */
  audience?: string[];
  /** Ids de sus fotos (hasta 3), la primera es la portada. Una variante trae las de su producto. */
  photos?: string[];
  /** Se agotó (lo marca el inventario): el perfil lo muestra como «Agotado». */
  sold_out?: boolean;
  /** Duración en minutos (5–480); null = no publicada. */
  duration_min?: number | null;
  /** Se puede reservar por Empre (exige duración). */
  bookable?: boolean;
  /** Qué es: un servicio (no se agota) o un producto (se cuenta). */
  kind?: ItemKind;
  /** El dueño ya confirmó el tipo (falso en ítems viejos que se clasificaron solos). */
  kind_checked?: boolean;
  /** Variante (sabor, talla): el producto al que pertenece y su parte corta. */
  parent_id?: string;
  variant_label?: string;
  /** Su precio es el del producto (no tiene uno propio). */
  price_inherited?: boolean;
}

export type ItemKind = 'service' | 'product';

/** Cuántos servicios se ven antes de «Ver todos». */
export const CATALOG_PREVIEW = 5;

/** «$25.000» (separador de miles colombiano, sin decimales). */
export function formatPesos(n: number): string {
  const digits = String(Math.round(Math.abs(n)));
  return `$${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** «$25.000», «desde $25.000» o null cuando el negocio no publica precio (la pantalla no inventa nada). */
export function priceText(item: Pick<ServiceItem, 'price' | 'price_from'>): string | null {
  if (item.price === null || item.price === undefined) return null;
  if (item.price === 0) return item.price_from ? 'desde gratis' : 'Gratis';
  return `${item.price_from ? 'desde ' : ''}${formatPesos(item.price)}`;
}

function latest(item: ServiceItem): number | null {
  const times = [item.price_updated_at, item.confirmed_at].filter((t): t is string => !!t).map((t) => Date.parse(t));
  return times.length ? Math.max(...times) : null;
}

/**
 * Nota bajo la lista de precios. Si todos los precios publicados están vigentes: «Precios habituales ·
 * actualizados hace N d» (con el más viejo de ellos); si alguno no lo está, lo dice sin esconderlo. Sin precios
 * publicados no hay nota.
 */
export function freshnessNote(items: ServiceItem[], now: number): string | null {
  const priced = items.filter((i) => i.price !== null);
  if (priced.length === 0) return null;
  if (priced.some((i) => !i.fresh)) return 'Algunos precios no se han confirmado hace tiempo';
  const oldest = Math.min(...priced.map((i) => latest(i) ?? now));
  const days = Math.max(0, Math.round((now - oldest) / 86_400_000));
  if (days === 0) return 'Precios habituales · actualizados hoy';
  return `Precios habituales · actualizados hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Qué se sabe del precio de una oferta a partir de los servicios elegidos y su precio especial. */
export interface OfferPreview {
  /** Suma del precio habitual de lo incluido; null si no hay servicios o alguno no tiene precio (no se inventa). */
  reference: number | null;
  /** Referencia menos precio especial; solo si hay ambos y el especial es menor. */
  saving: number | null;
  /** Mensaje para el dueño cuando el precio especial no es válido frente a la referencia. */
  error: string | null;
}

export function offerPreview(items: Pick<ServiceItem, 'price'>[], special: number | null): OfferPreview {
  const priced = items.length > 0 && items.every((i) => i.price !== null);
  const reference = priced ? items.reduce((sum, i) => sum + (i.price as number), 0) : null;
  if (reference === null || reference <= 0 || special === null) return { reference: reference !== null && reference > 0 ? reference : null, saving: null, error: null };
  if (special >= reference) return { reference, saving: null, error: `El precio especial debe ser menor al habitual de lo incluido (${formatPesos(reference)})` };
  return { reference, saving: reference - special, error: null };
}

/** Texto de accesibilidad de un servicio: nombre, descripción y precio (o que no hay precio publicado). */
export function serviceLabel(item: ServiceItem): string {
  const price = priceText(item);
  return [item.name, item.description, price ?? 'precio sin publicar'].filter(Boolean).join(', ');
}

/**
 * Lo que el dueño escribió en el campo de precio, como número: «25.000», «$ 25000» y «25000» dan 25000; vacío
 * da null (sin precio); lo que no sea un número válido da undefined (error para mostrar).
 */
export function parsePriceInput(raw: string): number | null | undefined {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^[\s$\d.,]+$/.test(text)) return undefined;
  const digits = text.replace(/[^\d]/g, '');
  if (digits === '') return undefined;
  const n = Number(digits);
  return n > 10_000_000 ? undefined : n;
}

// ---------- El catálogo en el perfil (3.27/3.28, `perfil_integrado.html`) ----------
// El modelo es el mismo para cualquier negocio. Lo único que cambia por categoría son los TEXTOS: cómo se llama la
// lista, su buscador y el mensaje para preguntar por un ítem. El catálogo y
// las ofertas son cosas distintas: aquí nunca se mezcla una oferta.

export interface CatalogCopy {
  /** Título del apartado y del chip del índice: «Carta», «Servicios», «Productos»… */
  noun: string;
  one: string;
  plural: string;
  /** Texto del buscador de la pantalla completa. */
  search: string;
  /**
   * Qué se vende, para saber qué pedir al crear un ítem: «service» lleva duración y reserva; «shop» (tienda) lleva
   * costo y cuántos hay; «food» (platos) lleva costo, sin existencias por plato.
   */
  kind: 'service' | 'shop' | 'food';
  /** Ejemplo de nombre para el formulario. */
  example: string;
  /** Mensaje ya escrito para preguntar por un ítem (el nombre va en minúscula inicial). */
  ask: (item: string) => string;
  /** Preguntas rápidas que se pueden sumar al mensaje. */
  quick: string[];
}

const GENERIC: CatalogCopy = {
  noun: 'Servicios',
  one: 'servicio',
  plural: 'servicios',
  search: 'Buscar un servicio',
  kind: 'service',
  example: 'Corte clásico',
  ask: (i) => `Hola, quisiera información sobre ${i}.`,
  quick: ['¿Cuánto cuesta?', '¿Atienden hoy?', '¿Cómo puedo pedirlo?'],
};

const FOOD: CatalogCopy = {
  noun: 'Carta',
  one: 'plato',
  plural: 'platos',
  search: 'Buscar en la carta',
  kind: 'food',
  example: 'Bandeja paisa',
  ask: (i) => `Hola, ¿hoy tienen ${i}? ¿Hacen domicilio?`,
  quick: ['¿Hacen domicilio?', '¿Tienen mesa disponible?', '¿Hasta qué hora atienden?'],
};

const BY_CATEGORY: Record<string, CatalogCopy> = {
  restaurantes: FOOD,
  'cafeterias, panaderias y postres': { ...FOOD, one: 'producto', plural: 'productos' },
  'bares y vida nocturna': {
    ...FOOD,
    one: 'producto',
    plural: 'productos',
    ask: (i) => `Hola, ¿hoy tienen ${i}? ¿Hay que reservar?`,
    quick: ['¿Hay que reservar?', '¿Hasta qué hora abren?', '¿Hay música en vivo?'],
  },
  'belleza y peluqueria': {
    ...GENERIC,
    ask: (i) => `Hola, ¿tienen turno hoy para ${i}?`,
    quick: ['¿Tienen turno hoy?', '¿Atienden sin cita?', '¿Cuánto se demora?'],
  },
  'salud y bienestar': {
    ...GENERIC,
    ask: (i) => `Hola, quisiera pedir una cita para ${i}.`,
    quick: ['¿Qué días atienden?', '¿Reciben mi seguro?', '¿Cuánto dura?'],
  },
  'deporte y recreacion': {
    ...GENERIC,
    noun: 'Planes',
    one: 'plan',
    plural: 'planes',
    search: 'Buscar un plan',
    quick: ['¿Tienen clase de prueba?', '¿Qué horarios hay?'],
  },
  'tiendas y comercio': {
    ...GENERIC,
    noun: 'Productos',
    one: 'producto',
    plural: 'productos',
    search: 'Buscar un producto',
    kind: 'shop',
    example: 'Camiseta básica',
    ask: (i) => `Hola, ¿tienen ${i} disponible?`,
    quick: ['¿Qué tallas tienen?', '¿Hacen envíos?', '¿Puedo apartarlo?'],
  },
  tecnologia: {
    ...GENERIC,
    search: 'Buscar un servicio o producto',
    ask: (i) => `Hola, ¿cuánto sale ${i} para mi equipo? ¿Lo hacen hoy?`,
    quick: ['¿Lo hacen hoy?', '¿Dan garantía?', '¿Revisan sin costo?'],
  },
  mascotas: {
    ...GENERIC,
    ask: (i) => `Hola, quisiera pedir una cita para ${i} para mi mascota.`,
    quick: ['¿Atienden gatos?', '¿Tienen urgencias?', '¿Van a domicilio?'],
  },
  'servicios del hogar': {
    ...GENERIC,
    ask: (i) => `Hola, ¿pueden venir para ${i}? ¿Cuándo tienen disponibilidad?`,
    quick: ['¿Pueden venir hoy?', '¿Cobran la visita?', '¿Dan garantía?'],
  },
  automotriz: {
    ...GENERIC,
    ask: (i) => `Hola, ¿cuánto sale ${i} para mi carro? ¿Lo hacen hoy?`,
    quick: ['¿Lo hacen hoy?', '¿Hay que dejar el carro?'],
  },
  educacion: {
    ...GENERIC,
    noun: 'Cursos',
    one: 'curso',
    plural: 'cursos',
    search: 'Buscar un curso',
    ask: (i) => `Hola, quisiera información sobre ${i}: horarios y cuándo empieza.`,
    quick: ['¿Cuándo empieza?', '¿Es presencial?', '¿Tienen clase de prueba?'],
  },
  'turismo y hospedaje': {
    ...GENERIC,
    noun: 'Planes',
    one: 'plan',
    plural: 'planes',
    search: 'Buscar un plan',
    ask: (i) => `Hola, ¿tienen disponibilidad para ${i}? ¿Para qué fechas?`,
    quick: ['¿Incluye desayuno?', '¿Aceptan mascotas?', '¿Cómo se reserva?'],
  },
  'eventos y fiestas': {
    ...GENERIC,
    ask: (i) => `Hola, quisiera cotizar ${i} para un evento.`,
    quick: ['¿Tienen la fecha libre?', '¿Para cuántas personas?'],
  },
  'fotografia y diseno': {
    ...GENERIC,
    ask: (i) => `Hola, quisiera cotizar ${i}.`,
    quick: ['¿Cuánto se demora la entrega?', '¿Tienen ejemplos?'],
  },
};

/** Sin tildes, sin «ñ», en minúsculas: para comparar textos escritos de distintas formas. */
function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .trim();
}

/** Los textos del catálogo según la categoría del negocio; una categoría que no se conoce usa los genéricos. */
/** Tipo de negocio guardado (igual que en `api/types`). */
export type BusinessProfile = 'shop' | 'food' | 'service' | 'valuable' | 'other';

const SHOP: CatalogCopy = BY_CATEGORY['tiendas y comercio'];

/** Qué se vende según el tipo de negocio guardado. «other» no impone nada. */
const KIND_OF_PROFILE: Record<BusinessProfile, CatalogCopy['kind'] | null> = {
  shop: 'shop',
  valuable: 'shop',
  food: 'food',
  service: 'service',
  other: null,
};
const BASE_OF_KIND: Record<CatalogCopy['kind'], CatalogCopy> = { shop: SHOP, food: FOOD, service: GENERIC };

/**
 * Los textos del catálogo. Lo que el negocio VENDE (y por eso qué pide el formulario) sale de su tipo guardado
 * (`profile`), nunca del nombre de la categoría. El nombre solo afina los textos (las preguntas de «Pregúntale», las
 * secciones sugeridas) cuando coincide con ese tipo; si no coincide o no se conoce, se usan los textos base del tipo.
 * Sin tipo (datos viejos), se comporta como antes.
 */
export function catalogCopy(categoryName: string | null | undefined, profile?: BusinessProfile | null): CatalogCopy {
  const byName = categoryName ? BY_CATEGORY[plain(categoryName)] : undefined;
  const kind = profile ? KIND_OF_PROFILE[profile] : null;
  if (!kind) return byName ?? GENERIC;
  if (byName && byName.kind === kind) return byName;
  return BASE_OF_KIND[kind];
}

/** Las opciones de «¿Qué vendes principalmente?», en palabras del dueño. */
export const PROFILE_OPTIONS: { value: BusinessProfile; label: string; hint: string }[] = [
  { value: 'shop', label: 'Productos de tienda', hint: 'Abarrotes, aseo, papelería, ferretería…' },
  { value: 'food', label: 'Comida', hint: 'Platos, bebidas preparadas, panadería…' },
  { value: 'service', label: 'Servicios', hint: 'Cortes, citas, clases, reparaciones…' },
  { value: 'valuable', label: 'Artículos de valor', hint: 'Ropa, celulares, joyas, perfumes…' },
  { value: 'other', label: 'Otro', hint: 'Un poco de todo' },
];

/** «12 platos», «1 servicio». */
export function catalogCount(copy: CatalogCopy, n: number): string {
  return `${n} ${n === 1 ? copy.one : copy.plural}`;
}

/** El mensaje para preguntar por un ítem, con el nombre en minúscula inicial («¿hoy tienen almuerzo ejecutivo?»). */
export function askMessage(copy: CatalogCopy, itemName: string): string {
  const name = itemName.trim();
  return copy.ask(name.charAt(0).toLocaleLowerCase('es') + name.slice(1));
}

const bare = (t: string) =>
  plain(t)
    .replace(/[¿?¡!.,:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Las preguntas rápidas que el mensaje todavía no hace (sin mayúsculas, tildes ni signos). */
export function quickQuestions(copy: CatalogCopy, message: string): string[] {
  const m = bare(message);
  return copy.quick.filter((q) => !m.includes(bare(q)));
}

/** Suma una pregunta rápida al mensaje, si no está ya. */
export function addQuestion(message: string, question: string): string {
  if (bare(message).includes(bare(question))) return message;
  return `${message.trim()} ${question}`.trim();
}

/** «Desde $6.000»: el precio habitual más bajo publicado (mayor que 0); null si no hay ninguno. */
export function lowestPrice(items: Pick<ServiceItem, 'price'>[]): number | null {
  const prices = items.map((i) => i.price).filter((p): p is number => p !== null && p !== undefined && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

export interface CatalogGroup<T> {
  /** Vacío cuando el negocio no usa secciones (se muestra una sola lista sin título). */
  section: string;
  items: T[];
}

/** Nombre del grupo de lo que no tiene sección cuando el resto sí la tiene. */
export const NO_SECTION = 'Más';

/** La sección que todo negocio tiene, para lo que no encaja en otra: siempre va al final. */
export const OTHER_SECTION = 'Otros';

/**
 * Agrupa por sección. Con `order` (los nombres de las secciones en el orden en que el negocio las muestra), sigue ese
 * orden; sin él, el orden en que aparecen. «Otros» va siempre al final, y lo que no tiene sección (datos viejos), al
 * final bajo «Más». Si todo cae en una sola sección, un solo grupo sin título.
 */
export function catalogGroups<T extends Pick<ServiceItem, 'section'>>(items: T[], order: string[] = []): CatalogGroup<T>[] {
  const seen: string[] = [];
  const by = new Map<string, T[]>();
  for (const it of items) {
    const key = (it.section ?? '').trim();
    if (!by.has(key)) {
      by.set(key, []);
      if (key) seen.push(key);
    }
    by.get(key)?.push(it);
  }
  if (seen.length === 0) return items.length ? [{ section: '', items }] : [];
  const rank = (name: string) => {
    if (name === OTHER_SECTION) return Number.MAX_SAFE_INTEGER;
    const i = order.indexOf(name);
    return i === -1 ? order.length + seen.indexOf(name) : i;
  };
  const sorted = [...seen].sort((a, b) => rank(a) - rank(b));
  const none = by.get('') ?? [];
  if (sorted.length === 1 && none.length === 0) return [{ section: '', items }];
  const out = sorted.map((section) => ({ section, items: by.get(section) ?? [] }));
  if (none.length) out.push({ section: NO_SECTION, items: none });
  return out;
}

// ---------- Fotos ----------

/** Cuántas fotos puede tener un producto. */
export const MAX_ITEM_PHOTOS = 3;

/** ¿Lo que se muestra va en tarjetas con foto? Sí cuando al menos la mitad tiene foto (si no, lista). */
export function prefersCards(items: Pick<ServiceItem, 'photos'>[]): boolean {
  if (items.length === 0) return false;
  const withPhoto = items.filter((i) => (i.photos ?? []).length > 0).length;
  return withPhoto * 2 >= items.length;
}

/** Los productos sin foto (las variantes no cuentan: usan las de su producto). */
export function withoutPhoto<T extends Pick<ServiceItem, 'photos' | 'parent_id'>>(items: T[]): T[] {
  return items.filter((i) => !i.parent_id && !(i.photos ?? []).length);
}

// ---------- Para quién (ropa, calzado, deporte) ----------

export type Audience = 'men' | 'women' | 'kids' | 'unisex';

/** Las opciones de «¿Para quién es?», en el orden en que se muestran. */
export const AUDIENCE_OPTIONS: { key: Audience; label: string }[] = [
  { key: 'men', label: 'Hombre' },
  { key: 'women', label: 'Mujer' },
  { key: 'kids', label: 'Niños' },
  { key: 'unisex', label: 'Unisex' },
];

/** Los filtros del perfil (sin «Unisex»: una prenda unisex sale en Hombre y en Mujer). */
export const AUDIENCE_FILTERS: { key: Audience; label: string }[] = AUDIENCE_OPTIONS.filter((o) => o.key !== 'unisex');

/** «Hombre, Mujer»; vacío si no se dijo. */
export function audienceText(list: string[] | undefined | null): string {
  return AUDIENCE_OPTIONS.filter((o) => list?.includes(o.key))
    .map((o) => o.label)
    .join(', ');
}

/** ¿El ítem sale con este filtro? Sin filtro, todos. «Hombre» y «Mujer» incluyen lo unisex. */
export function matchesAudience(list: string[] | undefined | null, filter: Audience | null): boolean {
  if (!filter) return true;
  const own = list ?? [];
  if (own.includes(filter)) return true;
  return (filter === 'men' || filter === 'women') && own.includes('unisex');
}

/** Los filtros «Para» que tienen al menos un ítem, con su conteo. Ninguno si nadie dijo para quién es. */
export function audienceChips(items: Pick<ServiceItem, 'audience'>[]): { key: Audience; label: string; count: number }[] {
  if (!items.some((i) => (i.audience ?? []).length > 0)) return [];
  return AUDIENCE_FILTERS.map((o) => ({ ...o, count: items.filter((i) => matchesAudience(i.audience, o.key)).length })).filter((c) => c.count > 0);
}

/**
 * Las secciones como filtros, en el orden del negocio (vacío si el negocio usa una sola o ninguna). Las secciones salen
 * de todos los ítems, así no desaparecen al filtrar por «Para»; el conteo es el de `counted` (lo que queda con ese
 * filtro), y una sección puede quedar en 0.
 */
export function sectionChips<T extends Pick<ServiceItem, 'section'>>(items: T[], order: string[] = [], counted: T[] = items): { section: string; count: number }[] {
  const groups = catalogGroups(items, order);
  if (groups.length <= 1) return [];
  const count = (s: string) => counted.filter((i) => ((i.section ?? '').trim() || NO_SECTION) === s).length;
  return groups.map((g) => ({ section: g.section, count: count(g.section) }));
}

/** Los ítems de una sección (vacía = todas), en el orden de las secciones del negocio. */
export function itemsInSection<T extends Pick<ServiceItem, 'section'>>(items: T[], section: string, order: string[] = []): T[] {
  if (!section) return catalogGroups(items, order).flatMap((g) => g.items);
  // Por nombre, no por los grupos: con un solo grupo, catalogGroups lo deja sin título y la búsqueda no lo encontraría.
  return items.filter((i) => ((i.section ?? '').trim() || NO_SECTION) === section);
}

/** Filtra por texto (sin tildes ni mayúsculas, en nombre, descripción y sección) y por sección («» = todas). */
export function filterCatalog<T extends Pick<ServiceItem, 'name' | 'description' | 'section'>>(items: T[], query: string, section: string): T[] {
  const q = bare(query);
  return items.filter((it) => {
    const own = (it.section ?? '').trim();
    if (section && own !== section && !(section === NO_SECTION && !own)) return false;
    if (!q) return true;
    return bare(`${it.name} ${it.description ?? ''} ${own}`).includes(q);
  });
}

/** Lo que más probablemente agrega un negocio: una peluquería, servicios; una tienda o un restaurante, productos. */
export function defaultItemKind(copy: Pick<CatalogCopy, 'kind'>): ItemKind {
  return copy.kind === 'service' ? 'service' : 'product';
}

/** El título de la lista según lo que hay: «Servicios», «Productos» (o «Carta»), o «Servicios y productos». */
export function listTitle(items: { kind?: ItemKind }[], copy: Pick<CatalogCopy, 'noun' | 'kind'>): string {
  const hasService = items.some((i) => i.kind === 'service');
  const hasProduct = items.some((i) => i.kind === 'product');
  if (hasService && hasProduct) return 'Servicios y productos';
  if (hasService) return 'Servicios';
  if (hasProduct) return copy.kind === 'service' ? 'Productos' : copy.noun;
  return copy.noun;
}

/**
 * El catálogo que ve el público: un producto con variantes no se muestra solo (no se vende así); se ven sus variantes
 * con su nombre completo («Proteína 2 lb · Chocolate»), cada una con su precio y si está agotada.
 */
export function publicCatalog<T extends { id: string; parent_id?: string }>(items: T[]): T[] {
  const parents = new Set(items.map((i) => i.parent_id).filter(Boolean));
  return items.filter((i) => !parents.has(i.id));
}
