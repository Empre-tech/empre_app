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
}

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
