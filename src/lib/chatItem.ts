import type { ChatMessageItem } from '@/api/types';

/**
 * La tarjeta del producto por el que se pregunta en el chat. Viaja como parámetro de la ruta (texto JSON) desde la
 * ficha del producto o el perfil hasta el chat; el servidor vuelve a armarla con su catálogo al guardar el mensaje.
 */
export function chatItemParam(item: ChatMessageItem): string {
  return JSON.stringify(item);
}

/** Lee la tarjeta que llegó por parámetro; cualquier cosa rara se ignora (el mensaje se manda sin tarjeta). */
export function parseChatItem(raw: string | string[] | undefined | null): ChatMessageItem | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ChatMessageItem>;
    if (!v || typeof v.id !== 'string' || !v.id || typeof v.name !== 'string' || !v.name) return null;
    return {
      id: v.id,
      name: v.name.slice(0, 120),
      price: typeof v.price === 'number' ? v.price : null,
      price_from: Boolean(v.price_from),
      ...(typeof v.photo === 'string' && v.photo ? { photo: v.photo } : {}),
      ...(typeof v.section === 'string' && v.section ? { section: v.section } : {}),
    };
  } catch {
    return null;
  }
}
