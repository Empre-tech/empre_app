// Lógica pura de la ficha del negocio en el mapa (qué dice y a dónde se encuadra). Sin React, para probarla con Node.

/** Hasta qué distancia se escribe el tiempo a pie, y a cuántos metros por minuto se calcula. */
export const WALK_MAX_M = 1500;
export const WALK_M_PER_MIN = 80;

/** «1 min a pie» desde la distancia en km; null si es lejos o no hay distancia (nunca se afirma lo que no se sabe). */
export function walkText(km: number | null | undefined): string | null {
  if (km === null || km === undefined || !Number.isFinite(km) || km < 0) return null;
  const meters = km * 1000;
  if (meters > WALK_MAX_M) return null;
  return `${Math.max(1, Math.round(meters / WALK_M_PER_MIN))} min a pie`;
}

/** "20:00" → "8 pm"; "08:30" → "8:30 am"; "00:00" → "12 am". Vacío si no es una hora. */
export function clockShort(hhmm?: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'pm' : 'am'}`;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export interface NextOpen {
  days_ahead: number;
  weekday: number;
  time: string;
}

export interface OpeningInput {
  has_hours: boolean;
  is_open_now: boolean;
  /** «HH:MM» o «24h» (abierto). */
  closes_at?: string;
  /** Cuándo vuelve a abrir (cerrado). */
  next_open?: NextOpen | null;
}

export type StatusTone = 'open' | 'closed';

/**
 * El estado con hora: «Abierto · cierra 8 pm», «Abierto 24 horas», «Cerrado · abre mañana 8 am». Sin horario no
 * afirma nada (null). Un servidor sin las horas nuevas dice solo «Abierto» o «Cerrado».
 */
export function statusLine(e: OpeningInput): { text: string; tone: StatusTone } | null {
  if (!e.has_hours) return null;
  if (e.is_open_now) {
    if (e.closes_at === '24h') return { text: 'Abierto 24 horas', tone: 'open' };
    const clock = clockShort(e.closes_at);
    return { text: clock ? `Abierto · cierra ${clock}` : 'Abierto', tone: 'open' };
  }
  const n = e.next_open;
  if (!n) return { text: 'Cerrado', tone: 'closed' };
  const clock = clockShort(n.time);
  const when = n.days_ahead === 0 ? 'hoy' : n.days_ahead === 1 ? 'mañana' : `el ${WEEKDAYS[n.weekday] ?? ''}`.trim();
  return { text: clock ? `Cerrado · abre ${when} ${clock}` : 'Cerrado', tone: 'closed' };
}

/**
 * Latitud del centro del mapa para que el negocio quede en el centro del espacio libre: bajo el buscador (`freeTop`)
 * y sobre la ficha (`bottomUi`), no en el centro de la pantalla. `latDelta` es lo que muestra el mapa a lo alto.
 */
export function focusCenterLat(pinLat: number, latDelta: number, mapHeight: number, freeTop: number, bottomUi: number): number {
  if (!(mapHeight > 0)) return pinLat;
  const targetY = freeTop + Math.max(0, mapHeight - bottomUi - freeTop) / 2;
  // Con el negocio por encima del centro de la pantalla, el centro del mapa queda al sur de él.
  return pinLat + ((targetY - mapHeight / 2) / mapHeight) * latDelta;
}

/** Cuánto hay que deslizar la ficha hacia arriba para entrar al perfil. */
export const SWIPE_ENTER_PX = 60;

/** ¿Este deslizamiento (dy negativo = hacia arriba) entra al perfil? */
export function swipeEnters(dy: number): boolean {
  return dy <= -SWIPE_ENTER_PX;
}
