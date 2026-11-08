/**
 * Lo que va entendiendo Empre AI Live mientras hablas: reglas instantáneas sobre tu catálogo, inventario o búsqueda,
 * sin esperar al servidor ni depender de señal. Lo que se registra en caja o inventario lo confirma siempre el dueño.
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

export interface LiveStockChange {
  name: string;
  level: 'ok' | 'low' | 'out';
  counted?: number;
}

export interface LiveSearchFilters {
  open_now: boolean;
  with_offer: boolean;
  delivery: boolean;
  cheapest: boolean;
}

export type WordTag = 'item' | 'money' | 'stock_out' | 'stock_low' | 'stock_ok' | 'filter';

export interface LiveResult {
  words: { text: string; known: boolean; tag?: WordTag }[];
  lines: LiveLine[];
  stock: LiveStockChange[];
  searchFilters: LiveSearchFilters;
  method: 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Fiado' | null;
  fiadoTo: string | null;
  expense: { amount: number; what: string } | null;
  total: number;
}

const NUM: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100,
};
const SKIP = new Set(['y', 'en', 'de', 'del', 'a', 'al', 'con', 'el', 'la', 'los', 'las', 'por', 'para', 'vendí', 'vendi', 'eso', 'es', 'todo', 'se']);

const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]/g, '');
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

export function liveParse(text: string, items: LiveItem[] = []): LiveResult {
  const raw = text.split(/\s+/).filter(Boolean);
  const toks = raw.map(plain);
  const known = raw.map(() => false);
  const tags: (WordTag | undefined)[] = raw.map(() => undefined);
  const lines: LiveLine[] = [];
  const stock: LiveStockChange[] = [];
  const searchFilters: LiveSearchFilters = { open_now: false, with_offer: false, delivery: false, cheapest: false };
  let method: LiveResult['method'] = null;
  let fiadoTo: string | null = null;
  let expense: LiveResult['expense'] = null;
  let pending: number | null = null;
  let correcting = false;
  let pendingStock: 'out' | 'low' | 'ok' | null = null;

  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];

    // Filtros conversacionales para Búsqueda (Finder)
    if (w === 'abierto' || w === 'abierta' || w === 'abiertos' || w === 'ahora') {
      searchFilters.open_now = true;
      known[i] = true;
      tags[i] = 'filter';
    } else if (w === 'oferta' || w === 'ofertas' || w === 'descuento' || w === 'promo' || w === 'promocion') {
      searchFilters.with_offer = true;
      known[i] = true;
      tags[i] = 'filter';
    } else if (w === 'domicilio' || w === 'domicilios' || w === 'llevar' || w === 'envio') {
      searchFilters.delivery = true;
      known[i] = true;
      tags[i] = 'filter';
    } else if (w === 'barato' || w === 'barata' || w === 'economico' || w === 'economica') {
      searchFilters.cheapest = true;
      known[i] = true;
      tags[i] = 'filter';
    }

    // Disparadores de Semáforo de Inventario («se acabó», «agotado», «queda poco», «tengo / llegaron»)
    if (w === 'acabo' || w === 'acabaron' || w === 'agotado' || w === 'agoto' || w === 'agotada') {
      pendingStock = 'out';
      known[i] = true;
      tags[i] = 'stock_out';
      continue;
    }
    if (w === 'poco' || w === 'poca' || w === 'pocos' || w === 'pocas' || w === 'escaso') {
      pendingStock = 'low';
      known[i] = true;
      tags[i] = 'stock_low';
      continue;
    }
    if (w === 'llegaron' || w === 'tengo' || w === 'quedan' || w === 'contamos') {
      pendingStock = 'ok';
      known[i] = true;
      tags[i] = 'stock_ok';
      continue;
    }

    if (w in NUM) {
      pending = NUM[w];
      known[i] = true;
      tags[i] = 'money';
      continue;
    }
    if (/^\d+$/.test(w)) {
      pending = Number(w);
      known[i] = true;
      tags[i] = 'money';
      continue;
    }
    if (w === 'mil' && pending !== null) {
      known[i] = true;
      tags[i] = 'money';
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
      tags[i] = 'money';
      continue;
    }
    if (w === 'efectivo') method = 'Efectivo';
    else if (w === 'nequi' || w === 'transferencia' || w === 'daviplata') method = 'Transferencia';
    else if (w === 'tarjeta') method = 'Tarjeta';
    else if (w === 'fiado' || w === 'fie') {
      method = 'Fiado';
      known[i] = true;
      tags[i] = 'money';
      if (toks[i + 1] === 'a' && raw[i + 2]) {
        fiadoTo = raw[i + 2].replace(/[,.]/g, '');
        known[i + 1] = true;
        known[i + 2] = true;
        tags[i + 2] = 'money';
        i += 2;
      }
      continue;
    }
    if (method && (w === 'efectivo' || w === 'nequi' || w === 'transferencia' || w === 'daviplata' || w === 'tarjeta')) {
      known[i] = true;
      tags[i] = 'money';
      continue;
    }
    if (SKIP.has(raw[i].toLowerCase().replace(/[,.]/g, ''))) continue;
    if (expense) {
      if (!expense.what) expense.what = raw[i].replace(/[,.]/g, '');
      known[i] = true;
      tags[i] = 'item';
      continue;
    }

    const item = findItem(raw[i], items);
    if (!item) {
      // Si el usuario está dictando un estado de inventario sobre un insumo que aún no está en items o usa su nombre libre
      if (pendingStock && w.length >= 3 && w !== 'queda') {
        const cleanName = raw[i].replace(/[,.]/g, '');
        const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        stock.push({
          name: capitalized,
          level: pendingStock,
          ...(pending !== null ? { counted: pending } : {}),
        });
        known[i] = true;
        tags[i] = pendingStock === 'out' ? 'stock_out' : pendingStock === 'low' ? 'stock_low' : 'stock_ok';
        pendingStock = null;
        pending = null;
      }
      continue;
    }

    known[i] = true;
    if (pendingStock) {
      tags[i] = pendingStock === 'out' ? 'stock_out' : pendingStock === 'low' ? 'stock_low' : 'stock_ok';
      const existingStock = stock.find((s) => s.name === item.name);
      if (existingStock) {
        existingStock.level = pendingStock;
        if (pending !== null) existingStock.counted = pending;
      } else {
        stock.push({
          name: item.name,
          level: pendingStock,
          ...(pending !== null ? { counted: pending } : {}),
        });
      }
      pendingStock = null;
      pending = null;
      continue;
    }

    tags[i] = 'item';
    const qty = pending ?? 1;
    const last = lines[lines.length - 1];
    if (last && last.name === item.name) {
      if (correcting) {
        last.qty = qty;
        last.fixed = true;
      } else if (pending !== null) {
        last.qty += qty;
      }
    } else {
      lines.push({ name: item.name, qty, price: item.price, fixed: false });
    }
    pending = null;
    correcting = false;
  }

  const total = expense ? expense.amount : lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
  return {
    words: raw.map((text2, i) => ({ text: text2, known: known[i], tag: tags[i] })),
    lines,
    stock,
    searchFilters,
    method,
    fiadoTo,
    expense,
    total,
  };
}
