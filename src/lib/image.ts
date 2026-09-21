import { API_URL } from '@/config';

/**
 * Las URLs de imagen del backend son absolutas (S3 prefirmadas, válidas ~15 min).
 * Si algún día llegan relativas (proxy /api/images/{id}), las completamos con la URL de la API.
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return `${API_URL}${url}`;
  return url;
}
