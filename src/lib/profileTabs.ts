// Lo que ofrece el perfil del negocio, en pestañas como en Instagram (lienzo v115, 2026-11-18): Servicios, Productos y
// Fotos por separado. Solo salen las que tienen algo; con una sola, no hay barra. Fotos es su trayectoria: este año
// por mes, los anteriores por año, lo más nuevo arriba. Sin React para probarlo con Node.

export type ProfileTabId = 'services' | 'products' | 'photos';

export interface ProfileTab {
  id: ProfileTabId;
  label: string;
  count: number;
}

/** De qué pestaña es un ítem. Los viejos sin tipo van según lo que vende el negocio. */
export function itemTab(item: { kind?: 'service' | 'product' }, sells: 'service' | 'shop' | 'food'): 'services' | 'products' {
  const kind = item.kind ?? (sells === 'service' ? 'service' : 'product');
  return kind === 'service' ? 'services' : 'products';
}

/**
 * Las pestañas, solo las que tienen algo. Con servicios y productos, cada una con su nombre; con una sola clase, se
 * llama como el catálogo del negocio («Carta», «Servicios»…) si coincide con lo que vende.
 */
export function profileTabs(i: { services: number; products: number; photos: number; noun: string; sells: 'service' | 'shop' | 'food' }): ProfileTab[] {
  const both = i.services > 0 && i.products > 0;
  const out: ProfileTab[] = [];
  if (i.services > 0) out.push({ id: 'services', label: !both && i.sells === 'service' ? i.noun : 'Servicios', count: i.services });
  if (i.products > 0) out.push({ id: 'products', label: !both && i.sells !== 'service' ? i.noun : 'Productos', count: i.products });
  if (i.photos > 0) out.push({ id: 'photos', label: 'Fotos', count: i.photos });
  return out;
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface PhotoPeriod<T> {
  key: string;
  /** «Noviembre» (este año) o «2021». */
  label: string;
  /** Cada foto con su lugar en la lista original (el visor abre por ese lugar). */
  items: { photo: T; index: number }[];
}

/** La trayectoria: este año por mes y los anteriores por año, en hora de Colombia, lo más nuevo arriba. */
export function photoPeriods<T extends { created_at: string }>(photos: T[], now: Date = new Date()): PhotoPeriod<T>[] {
  const co = (t: number) => new Date(t - 5 * 3600 * 1000);
  const year = co(now.getTime()).getUTCFullYear();
  const dated = photos.map((photo, index) => ({ photo, index, t: Date.parse(photo.created_at) }));
  const ok = dated.filter((x) => Number.isFinite(x.t)).sort((a, b) => b.t - a.t);
  const out: PhotoPeriod<T>[] = [];
  for (const x of ok) {
    const d = co(x.t);
    const y = d.getUTCFullYear();
    const key = y === year ? `${y}-${d.getUTCMonth()}` : String(y);
    let p = out[out.length - 1];
    if (!p || p.key !== key) {
      p = { key, label: y === year ? MONTHS[d.getUTCMonth()] : String(y), items: [] };
      out.push(p);
    }
    p.items.push({ photo: x.photo, index: x.index });
  }
  const undated = dated.filter((x) => !Number.isFinite(x.t));
  if (undated.length) out.push({ key: 'otras', label: 'Otras', items: undated.map(({ photo, index }) => ({ photo, index })) });
  return out;
}

/** Los apartados del perfil del negocio (2026-11-22): como en Instagram, cada pestaña muestra solo lo suyo. */
export type ProfileSectionId = 'inicio' | 'catalogo' | 'fotos' | 'resenas' | 'info';

export interface ProfileSection {
  id: ProfileSectionId;
  label: string;
}

/**
 * Qué apartados tiene un perfil: Inicio e Información siempre; Catálogo si hay productos o servicios (adentro, sus
 * pestañas); Fotos si hay fotos; Reseñas siempre (ahí se escribe la primera).
 */
export function profileSections(i: { services: number; products: number; photos: number }): ProfileSection[] {
  const out: ProfileSection[] = [{ id: 'inicio', label: 'Inicio' }];
  if (i.services + i.products > 0) out.push({ id: 'catalogo', label: 'Catálogo' });
  if (i.photos > 0) out.push({ id: 'fotos', label: 'Fotos' });
  out.push({ id: 'resenas', label: 'Reseñas' }, { id: 'info', label: 'Información' });
  return out;
}

/** A qué apartado lleva un atajo del perfil (la estrella de las reseñas, «lo último», el índice). */
export function sectionFor(target: string): ProfileSectionId {
  if (target === 'reviews') return 'resenas';
  if (target === 'photos') return 'fotos';
  if (target === 'services' || target === 'products') return 'catalogo';
  if (target === 'info' || target === 'about' || target === 'where') return 'info';
  return 'inicio';
}
