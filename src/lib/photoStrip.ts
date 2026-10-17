// Fotos de los destacados (3.22, mockup `docs/mockups/destacados_fotos.html`). Sin React para poder probarlo con Node.
//
// El servidor manda hasta 4 fotos recientes por negocio (sin videos) y cuántas tiene en total. El panel compacto
// muestra una tira con las primeras de cada destacado y cada tarjeta dibuja la grande y dos pequeñas con «+N».

export interface PhotoSource {
  id: string;
  name: string;
  photos?: string[];
  photosCount?: number;
}

export interface ReelTile {
  key: string;
  id: string;
  name: string;
  uri: string;
  /** Posición de la foto entre las del negocio (para abrir el visor en ella). */
  index: number;
}

/** Fotos por negocio en la tira y tope de la tira: que se vean varios negocios, no todas las fotos de uno. */
export const REEL_PER_BUSINESS = 2;
export const REEL_MAX = 12;

/** La tira del panel compacto: las primeras fotos de cada negocio, en el orden de los destacados, sin repetir negocio. */
export function reelTiles(items: PhotoSource[], perBusiness = REEL_PER_BUSINESS, max = REEL_MAX): ReelTile[] {
  const seen = new Set<string>();
  const out: ReelTile[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    (it.photos ?? []).slice(0, perBusiness).forEach((uri, index) => {
      if (out.length < max && uri) out.push({ key: `${it.id}-${index}`, id: it.id, name: it.name, uri, index });
    });
    if (out.length >= max) break;
  }
  return out;
}

export type GalleryMode = 'none' | 'one' | 'two' | 'three';

/** Cómo se dibujan las fotos de una tarjeta: hasta 3 y, en la última, «+N» con las que faltan. */
export function galleryLayout(photos: string[] | undefined, count?: number): { mode: GalleryMode; shown: string[]; extra: number } {
  const shown = (photos ?? []).filter(Boolean).slice(0, 3);
  const total = Math.max(count ?? 0, (photos ?? []).filter(Boolean).length);
  const mode: GalleryMode = shown.length === 0 ? 'none' : shown.length === 1 ? 'one' : shown.length === 2 ? 'two' : 'three';
  return { mode, shown, extra: Math.max(0, total - shown.length) };
}

/** Total real de fotos de un negocio (nunca menos de las que llegaron). */
export function photoTotal(src: PhotoSource): number {
  return Math.max(src.photosCount ?? 0, (src.photos ?? []).length);
}

/** Lo que lee el lector de pantalla en cada foto: «Foto 1 de 12 de Café Sierra Nevada». */
export function photoLabel(index: number, total: number, name: string): string {
  return `Foto ${index + 1} de ${Math.max(total, index + 1)} de ${name}`;
}

/** «12 fotos», «1 foto»; nada sin fotos. */
export function photosCountText(n: number): string {
  if (n <= 0) return '';
  return `${n} ${n === 1 ? 'foto' : 'fotos'}`;
}
