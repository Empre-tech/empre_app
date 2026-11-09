/**
 * Empre AI por voz (3.65): en qué momento está la conversación y qué dice la pantalla en cada uno. La Chispa hace de
 * orbe: su aura crece con el volumen real del micrófono y su estado cuenta qué pasa. Sin React para probarlo con Node.
 */
import type { WordTag } from './voiceLive';

export type VoiceMode = 'finance' | 'inventory' | 'search';

/**
 * - `ready`: no ha hablado; frases para tocar.
 * - `listening`: escuchando; el aura sigue la voz.
 * - `thinking`: armando lo dicho (local o en el servidor).
 * - `heard`: dejó de hablar y hay texto; falta seguir.
 * - `missed`: el micrófono no oyó nada.
 * - `error`: algo falló (permiso, conexión, servidor); el texto dice qué hacer.
 */
export type VoicePhase = 'ready' | 'listening' | 'thinking' | 'heard' | 'missed' | 'error';

/** Lo mismo que los estados de la Chispa (sin importar el componente). */
export type VoiceMood = 'reposo' | 'pensando' | 'responde' | 'nosabe' | 'contento';

/** Códigos del reconocedor que significan «no te oí» y no un fallo: se ofrece intentar otra vez. */
const MISSED = new Set(['no-speech', 'speech-timeout']);

export function voicePhase(s: { listening: boolean; busy: boolean; text: string; error: string | null; errorCode?: string | null }): VoicePhase {
  if (s.busy) return 'thinking';
  if (s.listening) return 'listening';
  if (s.error) return s.errorCode && MISSED.has(s.errorCode) && !s.text.trim() ? 'missed' : 'error';
  if (s.text.trim()) return 'heard';
  return 'ready';
}

const HINT: Record<VoiceMode, string> = {
  finance: 'Dile qué vendiste, qué gastaste o a quién le fiaste. Lo anoto y tú confirmas.',
  inventory: 'Dile qué se acabó, qué queda poco o cuánto llegó. Tú confirmas antes de cambiar.',
  search: 'Dime qué necesitas, como se lo dirías a un vecino. Busco cerca de ti.',
};

export interface PhaseCopy {
  title: string;
  /** La línea bajo «Empre AI» en el encabezado. */
  status: string;
  /** Texto de ayuda bajo el título (vacío si ya hay transcripción). */
  body: string;
  /** Pie bajo los botones. */
  foot: string;
  mood: VoiceMood;
  /** La Chispa en grande (sin texto debajo) o achicada para dejar lugar a lo dicho. */
  big: boolean;
}

export function phaseCopy(phase: VoicePhase, mode: VoiceMode, canSpeak: boolean, error?: string | null): PhaseCopy {
  const privacy = 'El audio no sale del teléfono: Empre solo recibe el texto';
  switch (phase) {
    case 'listening':
      return { title: 'Te escucho', status: 'Escuchando…', body: '', foot: 'Toca el cuadrado cuando termines', mood: 'reposo', big: false };
    case 'thinking':
      return { title: 'Entendiendo…', status: 'Armando lo que dijiste', body: '', foot: privacy, mood: 'pensando', big: false };
    case 'heard':
      return {
        title: mode === 'search' ? 'Así lo entendí' : 'Revisa lo que dijiste',
        status: mode === 'search' ? 'Toca seguir y busco' : 'Nada se guarda hasta que confirmes',
        body: '',
        foot: canSpeak ? 'Toca el micrófono para seguir hablando' : privacy,
        mood: 'responde',
        big: false,
      };
    case 'missed':
      return {
        title: 'No te escuché',
        status: 'No llegó nada al micrófono',
        body: 'Puede ser ruido o que hablaste muy bajo. Acércate al teléfono o escríbelo: Empre lo entiende igual.',
        foot: 'Toca el micrófono para intentar de nuevo',
        mood: 'nosabe',
        big: true,
      };
    case 'error':
      return { title: 'Algo no salió', status: 'Puedes escribirlo', body: error ?? 'Inténtalo de nuevo o escríbelo.', foot: privacy, mood: 'nosabe', big: true };
    default:
      return {
        title: canSpeak ? 'Toca y habla' : 'Escríbelo',
        status: canSpeak ? 'Te escucho cuando toques el micrófono' : 'Este teléfono no tiene dictado: escribe',
        body: HINT[mode],
        foot: privacy,
        mood: 'reposo',
        big: true,
      };
  }
}

/** Volumen del reconocedor (-2 a 10; bajo 0 no se oye) a un nivel de 0 a 1 para el aura. */
export function micLevel(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value / 10);
}

/** El papel de cada palabra entendida, para marcarla con su color de la paleta. */
export type WordTone = 'item' | 'good' | 'bad' | 'warn';

export function wordTone(tag?: WordTag): WordTone | null {
  switch (tag) {
    case 'item':
      return 'item';
    case 'money':
    case 'stock_ok':
    case 'filter':
      return 'good';
    case 'stock_out':
      return 'bad';
    case 'stock_low':
      return 'warn';
    default:
      return null;
  }
}

export interface LiveRow {
  key: string;
  /** Etiqueta corta en mayúsculas («VENTA · NEQUI», «SE ACABÓ»). */
  tag: string;
  title: string;
  value: string;
  tone: WordTone;
  icon: 'up' | 'down' | 'out' | 'low' | 'ok' | 'search' | 'open' | 'offer' | 'delivery' | 'cheap';
}

type LiveLike = {
  lines: { name: string; qty: number; price?: number | null; fixed: boolean }[];
  stock: { name: string; level: 'ok' | 'low' | 'out'; counted?: number }[];
  expense: { amount: number; what: string } | null;
  searchFilters: { open_now: boolean; with_offer: boolean; delivery: boolean; cheapest: boolean };
  method: string | null;
  fiadoTo: string | null;
};

/**
 * Lo entendido en vivo, en filas iguales para los tres modos (ventas, gastos, existencias o condiciones de búsqueda).
 * Solo lo que las reglas reconocieron: sin servidor ni IA. `money` da formato al dinero.
 */
export function liveRows(live: LiveLike, mode: VoiceMode, text: string, money: (n: number) => string): LiveRow[] {
  if (mode === 'search') {
    const q = text.trim();
    if (!q) return [];
    const f = live.searchFilters;
    const rows: LiveRow[] = [{ key: 'q', tag: 'BUSCAR', title: q, value: '', tone: 'item', icon: 'search' }];
    if (f.open_now) rows.push({ key: 'open', tag: 'CONDICIÓN', title: 'Abierto ahora', value: '', tone: 'good', icon: 'open' });
    if (f.with_offer) rows.push({ key: 'offer', tag: 'CONDICIÓN', title: 'Con oferta', value: '', tone: 'warn', icon: 'offer' });
    if (f.delivery) rows.push({ key: 'delivery', tag: 'CONDICIÓN', title: 'Con domicilio', value: '', tone: 'item', icon: 'delivery' });
    if (f.cheapest) rows.push({ key: 'cheap', tag: 'CONDICIÓN', title: 'Lo más económico', value: '', tone: 'item', icon: 'cheap' });
    return rows;
  }
  const how = live.fiadoTo ? `FIADO · ${live.fiadoTo.toUpperCase()}` : live.method ? `VENTA · ${live.method.toUpperCase()}` : 'VENTA';
  const rows: LiveRow[] = live.lines.map((l) => ({
    key: `l-${l.name}`,
    tag: how,
    title: `${l.qty} × ${l.name}${l.fixed ? ' (corregido)' : ''}`,
    value: l.price ? money(l.price * l.qty) : '',
    tone: 'good',
    icon: 'up',
  }));
  if (live.expense) rows.push({ key: 'gasto', tag: 'GASTO', title: live.expense.what ? live.expense.what : 'Gasto del día', value: live.expense.amount > 0 ? `−${money(live.expense.amount)}` : '', tone: 'bad', icon: 'down' });
  for (const s of live.stock) {
    if (s.level === 'out') rows.push({ key: `s-${s.name}`, tag: 'SE ACABÓ', title: s.name, value: 'Agotado', tone: 'bad', icon: 'out' });
    else if (s.level === 'low') rows.push({ key: `s-${s.name}`, tag: 'QUEDA POCO', title: s.name, value: 'Poco', tone: 'warn', icon: 'low' });
    else rows.push({ key: `s-${s.name}`, tag: 'HAY', title: s.name, value: s.counted != null ? `Hay ${s.counted}` : 'Hay', tone: 'good', icon: 'ok' });
  }
  return rows;
}
