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

/** Tiempo transcurrido corto: "hace un momento", "hace 12 min", "hace 2 h". */
export function formatAgo(iso?: string | null, now: number = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const minutes = Math.max(0, Math.floor((now - t) / 60000));
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/**
 * Descuento como porcentaje: "15", "15%" o " 15 % " → "15%". Se queda solo con
 * los dígitos para no mostrar "15%%" cuando quien publicó escribió el signo.
 * Devuelve '' si no hay un valor entre 1 y 100.
 */
export function formatDiscount(value?: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '');
  const n = Number(digits);
  return digits && n >= 1 && n <= 100 ? `${n}%` : '';
}

/** Qué tan urgente es una oferta según el tiempo que le queda. */
export type OfferUrgency = 'calm' | 'warn' | 'hot' | 'ended';

const MINUTE = 60_000;

/** Milisegundos que faltan para `endsAt` (negativo si ya terminó; 0 si la fecha no es válida). */
export function timeLeftMs(endsAt: string, now: number = Date.now()): number {
  const end = new Date(endsAt).getTime();
  return Number.isNaN(end) ? 0 : end - now;
}

/** Calma > 1 h · aviso < 1 h · «última llamada» < 15 min · terminada. */
export function offerUrgency(ms: number): OfferUrgency {
  if (ms <= 0) return 'ended';
  if (ms < 15 * MINUTE) return 'hot';
  if (ms < 60 * MINUTE) return 'warn';
  return 'calm';
}

/**
 * Tiempo restante en texto relativo, no como hora absoluta:
 * «Termina en 3 días», «Termina en 2 h 30 min», «Termina en 42 min»,
 * «Última llamada · 9 min», «Terminó».
 */
export function timeLeftLabel(ms: number): string {
  if (ms <= 0) return 'Terminó';
  const minutes = Math.ceil(ms / MINUTE);
  if (ms < 15 * MINUTE) {
    return ms < MINUTE ? 'Última llamada · menos de 1 min' : `Última llamada · ${minutes} min`;
  }
  if (minutes >= 24 * 60) {
    const days = Math.floor(minutes / (24 * 60));
    return `Termina en ${days} ${days === 1 ? 'día' : 'días'}`;
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `Termina en ${h} h${m ? ` ${m} min` : ''}`;
  }
  return `Termina en ${minutes} min`;
}

/** «Ahorras $10.000» cuando hay un valor normal mayor que el precio; vacío si no. */
export function formatSavings(price?: string | null, normalPrice?: string | null): string {
  const now = Number((price ?? '').replace(/[^\d]/g, ''));
  const was = Number((normalPrice ?? '').replace(/[^\d]/g, ''));
  if (!now || !was || was <= now) return '';
  return `Ahorras $${(was - now).toLocaleString('es-CO')}`;
}

/**
 * Tiempo restante en dos partes cortas para el centro del anillo:
 * {3, DÍAS}, {2 h, 30 MIN}, {42, MIN}, {9:05, MIN}.
 */
export function timeLeftShort(ms: number): { value: string; unit: string } {
  if (ms <= 0) return { value: '—', unit: '' };
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes >= 24 * 60) {
    const days = Math.floor(minutes / (24 * 60));
    return { value: String(days), unit: days === 1 ? 'DÍA' : 'DÍAS' };
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { value: `${h} h`, unit: m ? `${m} MIN` : '' };
  }
  if (ms < 10 * MINUTE) {
    const total = Math.ceil(ms / 1000);
    return { value: `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`, unit: 'MIN' };
  }
  return { value: String(minutes), unit: 'MIN' };
}

/** Duración de la ventana del reclamo en texto: «30 min», «3 h», «24 h», «3 días». */
export function formatWindow(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes <= 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / (24 * 60))} días`;
}

/** Hora del día en formato local corto: «3:42 p. m.». Vacío si la fecha no es válida. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}
