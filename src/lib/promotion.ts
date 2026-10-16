// Editor de promociones por plantillas (E4): reglas, sugerencias y el modelo de la tarjeta. Sin React para poder
// probarlo con Node. La tarjeta de la vista previa y la del perfil usan este mismo modelo: lo que ves es lo que se
// publica. El motivo interno es privado y nunca entra en el modelo de la tarjeta.

import { priceText } from './catalog';

export type PromotionTemplate = 'celebracion' | 'servicio_estrella' | 'paquete';

export interface TemplateInfo {
  id: PromotionTemplate;
  label: string;
  hint: string;
  /** Servicios del catálogo que exige (el paquete dos o más; la estrella uno; la celebración ninguno). */
  minServices: number;
}

/** Las tres plantillas iniciales: cada una existe por un caso concreto (ver la auditoría, sección 8). */
export const TEMPLATES: TemplateInfo[] = [
  { id: 'celebracion', label: 'Celebración', hint: 'Un aniversario, una fecha o un agradecimiento. No necesita descuento.', minServices: 0 },
  { id: 'servicio_estrella', label: 'Servicio estrella', hint: 'Presenta un servicio de tu catálogo con su precio habitual.', minServices: 1 },
  { id: 'paquete', label: 'Paquete', hint: 'Junta dos o más servicios de tu catálogo en una sola campaña.', minServices: 2 },
];

/** Motivos sugeridos: el dueño puede escribir el suyo. Es información interna, no se publica. */
export const MOTIVES = ['Aniversario', 'Lanzamiento de un servicio', 'Temporada especial', 'Agradecer a los clientes', 'Dar a conocer una especialidad', 'Una fecha especial'];

export const TITLE_MAX = 80;
export const MESSAGE_MAX = 240;
export const MOTIVE_MAX = 200;
export const MAX_PROMO_SERVICES = 5;
export const MAX_DAYS = 90;

export interface PromotionForm {
  motive: string;
  title: string;
  message: string;
  template: PromotionTemplate | null;
  serviceIds: string[];
  /** Duración en días (texto del campo). */
  days: string;
}

export const templateInfo = (id: PromotionTemplate | null): TemplateInfo | undefined => TEMPLATES.find((t) => t.id === id);

/** Plantilla sugerida según lo elegido: con servicios, estrella (uno) o paquete (dos o más); sin ellos, celebración. */
export function suggestTemplate(serviceCount: number): PromotionTemplate {
  if (serviceCount >= 2) return 'paquete';
  if (serviceCount === 1) return 'servicio_estrella';
  return 'celebracion';
}

/** Duración en días válida (1 a 90) o null. */
export function parseDays(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > MAX_DAYS) return null;
  return n;
}

/**
 * Primer problema del formulario, o null si se puede guardar. Refleja las reglas del servidor (largos, plantilla y
 * servicios que exige cada una). Un borrador no necesita duración; publicar sí.
 */
export function validatePromotionForm(f: PromotionForm, draft: boolean): string | null {
  const title = f.title.trim();
  if (title.length < 2) return 'Escribe un título de al menos 2 letras';
  if (title.length > TITLE_MAX) return `El título admite hasta ${TITLE_MAX} caracteres`;
  if (f.message.length > MESSAGE_MAX) return `El mensaje para clientes admite hasta ${MESSAGE_MAX} caracteres`;
  if (f.motive.length > MOTIVE_MAX) return `El motivo admite hasta ${MOTIVE_MAX} caracteres`;
  const info = templateInfo(f.template);
  if (!info) return 'Elige una plantilla';
  if (f.serviceIds.length > MAX_PROMO_SERVICES) return `Elige hasta ${MAX_PROMO_SERVICES} servicios`;
  if (f.serviceIds.length < info.minServices) {
    return info.id === 'paquete' ? 'Un paquete incluye al menos dos servicios' : 'Elige el servicio que quieres destacar';
  }
  if (!draft && parseDays(f.days) === null) return `La duración debe ser entre 1 y ${MAX_DAYS} días`;
  return null;
}

export interface CardService {
  name: string;
  /** Precio habitual escrito («$25.000»); null si el servicio no tiene precio publicado. */
  price: string | null;
}

/** Lo que muestra la tarjeta de una promoción, en la vista previa y en el perfil. Nunca el motivo interno. */
export interface PromotionCardModel {
  template: PromotionTemplate;
  title: string;
  message: string;
  services: CardService[];
  /** «Hasta el 23 de octubre» (ya formateado) o null en la vista previa de un borrador sin fecha. */
  until: string | null;
  /**
   * Portada: en la vista previa, la foto elegida en el teléfono; en el perfil, la ruta pública que manda el servidor
   * (/api/images/{id}). Null si no hay. Quien la dibuja la completa con `resolveImageUrl`.
   */
  cover: string | null;
}

export function previewModel(
  f: PromotionForm,
  catalog: { id: string; name: string; price: number | null; price_from: boolean }[],
  until: string | null,
  cover: string | null = null,
): PromotionCardModel {
  const services = f.serviceIds
    .map((id) => catalog.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({ name: c.name, price: priceText(c) }));
  return { template: f.template ?? 'celebracion', title: f.title.trim(), message: f.message.trim(), services, until, cover };
}

/** Modelo de la tarjeta a partir de lo que responde el servidor (la promoción publicada). */
export function cardFromApi(
  p: { title: string; description?: string; public_message?: string; template?: string; ends_at: string; photo_url?: string; items?: { name: string; price?: number }[] },
  untilLabel: string,
): PromotionCardModel {
  const template: PromotionTemplate = p.template === 'servicio_estrella' || p.template === 'paquete' ? p.template : 'celebracion';
  return {
    template,
    title: p.title,
    message: (p.public_message ?? '').trim() || (p.description ?? '').trim(),
    services: (p.items ?? []).map((i) => ({ name: i.name, price: i.price === undefined || i.price === null ? null : priceText({ price: i.price, price_from: false }) })),
    until: untilLabel,
    cover: p.photo_url ? p.photo_url : null,
  };
}

/** La foto elegida para la portada y, si ya se subió, el id que devolvió el servidor (con la foto a la que corresponde). */
export interface CoverState {
  picked: { uri: string } | null;
  uploaded: { uri: string; id: string } | null;
}

/** ¿Hay que subir la portada ahora? Sí si hay foto elegida y no se subió esa misma (cambiarla obliga a subir otra). */
export function coverNeedsUpload(c: CoverState): boolean {
  return c.picked !== null && (c.uploaded === null || c.uploaded.uri !== c.picked.uri);
}

/**
 * El id de medio que se manda al publicar: el de la foto elegida si ya se subió; undefined si no hay portada o aún no
 * se subió. Reintentar un guardado fallido reutiliza el id y no sube la foto otra vez.
 */
export function coverMediaId(c: CoverState): string | undefined {
  return c.picked !== null && c.uploaded !== null && c.uploaded.uri === c.picked.uri ? c.uploaded.id : undefined;
}
