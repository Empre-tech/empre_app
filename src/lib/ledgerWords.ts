// Un monto escrito en letras («25000» → «veinticinco mil pesos»). Es la misma regla que usa el servidor en las
// tarjetas de voz; aquí se usa cuando el dueño corrige un monto a mano, para que siempre lo vea escrito.

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS: Record<number, string> = { 30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta', 70: 'setenta', 80: 'ochenta', 90: 'noventa' };
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function below100(n: number, apocope: boolean): string {
  if (n < 30) {
    if (apocope && n === 1) return 'un';
    if (apocope && n === 21) return 'veintiún';
    return UNITS[n];
  }
  const t = Math.floor(n / 10) * 10;
  const u = n % 10;
  if (u === 0) return TENS[t];
  if (apocope && u === 1) return `${TENS[t]} y un`;
  return `${TENS[t]} y ${UNITS[u]}`;
}

function below1000(n: number, apocope: boolean): string {
  if (n === 100) return 'cien';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  if (h > 0) parts.push(HUNDREDS[h]);
  const r = n % 100;
  if (r > 0) parts.push(below100(r, apocope));
  return parts.join(' ');
}

function wordsOf(n: number, lastApocope: boolean): string {
  if (n <= 0) return 'cero';
  const parts: string[] = [];
  const m = Math.floor(n / 1_000_000);
  if (m > 0) parts.push(m === 1 ? 'un millón' : `${below1000(m, true)} millones`);
  const k = Math.floor((n % 1_000_000) / 1000);
  if (k > 0) parts.push(k === 1 ? 'mil' : `${below1000(k, true)} mil`);
  const u = n % 1000;
  if (u > 0) parts.push(below1000(u, lastApocope));
  return parts.join(' ');
}

/** «veinticinco mil pesos». Vale de 0 a 999.999.999. */
export function pesosInWords(n: number): string {
  const v = Math.round(n);
  if (!Number.isFinite(v) || v <= 0) return 'cero pesos';
  if (v === 1) return 'un peso';
  const w = wordsOf(v, true);
  return v >= 1_000_000 && v % 1_000_000 === 0 ? `${w} de pesos` : `${w} pesos`;
}
