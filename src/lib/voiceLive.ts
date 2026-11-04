/**
 * Lo que va entendiendo el dictado mientras hablas: reglas sobre tu catálogo, sin modelo de lenguaje. Es solo una vista
 * previa que sale al instante y sin señal; lo que se registra lo interpreta el servidor y lo confirmas tú.
 */
export interface LiveItem {
  name: string;
  price?: number | null;
}

export interface LiveLine {
  name: string;
  qty: number;
  price?: number | null;
  /** Se corrigió a mitad de frase («dos, no, tres»). */
  fixed: boolean;
}

export interface LiveResult {
  words: { text: string; known: boolean }[];
  lines: LiveLine[];
  method: 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Fiado' | null;
  fiadoTo: string | null;
  expense: { amount: number; what: string } | null;
  total: number;
}

const NUM: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100,
};
const SKIP = new Set(['y', 'en', 'de', 'del', 'a', 'al', 'con', 'el', 'la', 'los', 'las', 'por', 'para', 'vendí', 'vendi', 'eso', 'es', 'todo']);

const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
/** La palabra en singular o plural: «cortes» y «corte», «flores» y «flor». */
const forms = (w: string) => [w, w.replace(/s$/, ''), w.replace(/es$/, '')];

/** El producto que mejor corresponde a una palabra: el nombre más corto que la contiene como palabra. */
function findItem(word: string, items: LiveItem[]): LiveItem | null {
  const said = forms(plain(word));
  if (said[0].length < 3) return null;
  const hits = items.filter((i) => i.name.split(/\s+/).some((n) => forms(plain(n)).some((f) => f.length >= 3 && said.includes(f))));
  if (!hits.length) return null;
  return [...hits].sort((a, b) => a.name.length - b.name.length)[0];
}

export function liveParse(text: string, items: LiveItem[]): LiveResult {
  const raw = text.split(/\s+/).filter(Boolean);
  const toks = raw.map(plain);
  const known = raw.map(() => false);
  const lines: LiveLine[] = [];
  let method: LiveResult['method'] = null;
  let fiadoTo: string | null = null;
  let expense: LiveResult['expense'] = null;
  let pending: number | null = null;
  let correcting = false;

  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (w in NUM) {
      pending = NUM[w];
      known[i] = true;
      continue;
    }
    if (/^\d+$/.test(w)) {
      pending = Number(w);
      known[i] = true;
      continue;
    }
    if (w === 'mil' && pending !== null) {
      known[i] = true;
      if (expense) expense.amount = pending * 1000;
      pending = null;
      continue;
    }
    if (w === 'no') {
      correcting = true;
      known[i] = true;
      continue;
    }
    if (w === 'gaste' || w === 'pague' || w === 'compre') {
      expense = { amount: 0, what: '' };
      known[i] = true;
      continue;
    }
    if (w === 'efectivo') method = 'Efectivo';
    else if (w === 'nequi' || w === 'transferencia' || w === 'daviplata') method = 'Transferencia';
    else if (w === 'tarjeta') method = 'Tarjeta';
    else if (w === 'fiado' || w === 'fie') {
      method = 'Fiado';
      known[i] = true;
      if (toks[i + 1] === 'a' && raw[i + 2]) {
        fiadoTo = raw[i + 2].replace(/[,.]/g, '');
        known[i + 1] = true;
        known[i + 2] = true;
        i += 2;
      }
      continue;
    }
    if (method && (w === 'efectivo' || w === 'nequi' || w === 'transferencia' || w === 'daviplata' || w === 'tarjeta')) {
      known[i] = true;
      continue;
    }
    if (SKIP.has(raw[i].toLowerCase().replace(/[,.]/g, ''))) continue;
    if (expense) {
      if (!expense.what) expense.what = raw[i].replace(/[,.]/g, '');
      known[i] = true;
      continue;
    }
    const item = findItem(raw[i], items);
    if (!item) continue;
    known[i] = true;
    const qty = pending ?? 1;
    const last = lines[lines.length - 1];
    if (last && last.name === item.name) {
      if (correcting) {
        last.qty = qty;
        last.fixed = true;
      } else if (pending !== null) {
        last.qty += qty;
      }
      // Una palabra más del mismo nombre («corte clásico») no suma otra línea.
    } else {
      lines.push({ name: item.name, qty, price: item.price, fixed: false });
    }
    pending = null;
    correcting = false;
  }

  const total = expense ? expense.amount : lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
  return { words: raw.map((text2, i) => ({ text: text2, known: known[i] })), lines, method, fiadoTo, expense, total };
}
