// Franja de ubicación de Explorar (3.21, mockup `docs/mockups/explorar_superior.html`). Sin React para poder probarlo con Node.
//
// Arriba de todo se dice dónde estás («Estás en Comuna 4 · Santa Marta») o qué zona mira el mapa
// («Explorando Mamatoco · Santa Marta» con «a 3.1 km · Volver»). Solo la franja nombra la zona: el panel no la repite.

import type { ZoneName } from './zoneName';

export type StripAction = 'here' | 'back' | 'enable' | 'none';

export interface StripText {
  /** Cambia cuando cambia lo que se lee: dispara la animación. */
  key: string;
  /** Línea pequeña: «Estás en», «Explorando». */
  lead: string;
  title: string;
  city: string | null;
  action: StripAction;
  /** Texto del botón de la derecha («Aquí», «a 3,1 km · Volver», «Activar ubicación»). */
  actionLabel: string;
  /** Lo que lee el lector de pantalla. */
  a11y: string;
}

/** Un título como «Cerca de Taganga» ya trae su preposición. */
const isNearTitle = (title: string) => /^cerca de /i.test(title);

function build(lead: string, title: string, city: string | null, action: StripAction, actionLabel: string): StripText {
  return {
    key: `${lead}|${title}|${city ?? ''}`,
    lead,
    title,
    city,
    action,
    actionLabel,
    a11y: `${lead} ${title}${city ? `, ${city}` : ''}`,
  };
}

/**
 * Qué dice la franja. `hasUser`: hay ubicación de la persona; `denied`: no dio permiso.
 * Sin nombre todavía se dice que se está ubicando (o, sin permiso, que se explora esta zona).
 */
export function stripText(name: ZoneName | null, opts: { hasUser: boolean; denied: boolean }): StripText {
  const noUser = !opts.hasUser;
  if (!name) {
    return noUser && opts.denied
      ? build('Explorando', 'Esta zona', null, 'enable', 'Activar ubicación')
      : build('Buscando tu zona', '…', null, 'none', '');
  }
  if (noUser) return build('Explorando', name.title, name.city, 'enable', 'Activar ubicación');
  if (name.onUser) return build(isNearTitle(name.title) ? 'Estás' : 'Estás en', name.title, name.city, 'here', 'Aquí');
  const far = name.note ? name.note.replace(/ de ti$/, '') : null;
  return build('Explorando', name.title, name.city, 'back', far ? `${far} · Volver` : 'Volver');
}

/** El lector de pantalla anuncia el cambio de zona como mucho cada 3 s. */
export const ANNOUNCE_GAP_MS = 3000;
export function shouldAnnounce(lastAt: number | null, now: number): boolean {
  return lastAt === null || now - lastAt >= ANNOUNCE_GAP_MS;
}

/** El nombre cambia solo cuando el mapa lleva quieto este tiempo (sin parpadeo al arrastrar). */
export const SETTLE_MS = 400;

