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

/**
 * Formatea un precio como moneda colombiana: "40000" o "$40000" → "$40.000".
 * Si el valor no es numérico, lo devuelve tal cual.
 */
export function formatCurrency(value?: string | null): string {
  if (!value) return '';
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return value;
  return `$${Number(digits).toLocaleString('es-CO')}`;
}

/** Singular/plural de cupos: "Queda 1 cupo" / "Quedan 3 cupos". */
export function formatSlotsLeft(n: number): string {
  return n === 1 ? 'Queda 1 cupo' : `Quedan ${n} cupos`;
}
