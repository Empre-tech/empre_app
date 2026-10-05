import type { AppointmentStatus } from '@/api/agenda';
import { colors } from '@/theme';

// Colombia opera en una sola hora (UTC-5, sin horario de verano): se formatea
// con ese desfase fijo para no depender de la zona del teléfono.
const CO_OFFSET_MS = -5 * 60 * 60 * 1000;
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function co(date: Date): Date {
  return new Date(date.getTime() + CO_OFFSET_MS);
}

/** `YYYY-MM-DD` del día (en hora de Colombia). */
export function dayKey(date: Date): string {
  const d = co(date);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** Los próximos `count` días a partir de hoy, como instantes al mediodía de Colombia. */
export function nextDays(count: number): Date[] {
  const out: Date[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i += 1) out.push(new Date(now + i * 24 * 60 * 60 * 1000));
  return out;
}

export function weekdayShort(date: Date): string {
  return WEEKDAYS[co(date).getUTCDay()];
}

export function dayNumber(date: Date): number {
  return co(date).getUTCDate();
}

export function monthShort(date: Date): string {
  return MONTHS[co(date).getUTCMonth()];
}

/** "3:00 p.m." */
export function formatClock(iso: string | Date): string {
  const d = co(typeof iso === 'string' ? new Date(iso) : iso);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'p.m.' : 'a.m.'}`;
}

/** "Hoy", "Mañana" o "lun 12 oct". */
export function formatDay(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Math.round((Date.parse(`${dayKey(date)}T00:00:00Z`) - Date.parse(`${dayKey(new Date())}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  const d = co(date);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Hoy, 3:00 p.m." */
export function formatWhen(iso: string | Date): string {
  return `${formatDay(iso)}, ${formatClock(iso)}`;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? (h === 1 ? '1 hora' : `${h} horas`) : `${h} h ${m} min`;
}

/** "25 minutos", "2 horas"... para cuentas regresivas en lenguaje humano. */
export function formatRemaining(toIso: string, now: number = Date.now()): string {
  const ms = Date.parse(toIso) - now;
  if (ms <= 0) return 'ya venció';
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hora' : 'horas'}`;
  const days = Math.round(h / 24);
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: 'Esperando respuesta',
  confirmed: 'Confirmada',
  declined: 'Rechazada',
  expired: 'Venció sin respuesta',
  cancelled: 'Cancelada',
  completed: 'Cumplida',
  no_show: 'No se presentó',
  disputed: 'En revisión',
  blocked: 'Bloqueado',
};

export const STATUS_COLOR: Record<AppointmentStatus, string> = {
  requested: colors.warning,
  confirmed: colors.success,
  declined: colors.danger,
  expired: colors.muted,
  cancelled: colors.muted,
  completed: colors.success,
  no_show: colors.danger,
  disputed: colors.warning,
  blocked: colors.muted,
};

export const DECLINE_REASONS: { code: 'no_space' | 'no_service' | 'other'; label: string }[] = [
  { code: 'no_space', label: 'Ya no tengo ese espacio' },
  { code: 'no_service', label: 'No presto ese servicio' },
  { code: 'other', label: 'Otro motivo' },
];
