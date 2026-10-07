import type { OfferType } from '@/api/types';

export function offerTypeLabel(type: OfferType): string {
  switch (type) {
    case 'HORAS':
      return 'Por horas';
    case 'DIA':
      return 'Del día';
    case 'SEMANA':
      return 'De la semana';
    default:
      return type;
  }
}

/** Hora legible de vencimiento, p. ej. "18:00" (hoy) o "12 mar". */
export function formatOfferEndsAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}
