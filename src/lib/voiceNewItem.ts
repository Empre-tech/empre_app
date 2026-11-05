// Cuando lo dictado no está en el inventario: el precio que se dijo y lo que se le parece de verdad, con reglas y sin
// modelo de lenguaje. Sin imports: corre igual con `node --test`.

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();

/** Palabras que no dicen de qué producto se habla. */
const NOISE = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'con', 'y', 'en', 'al', 'por']);

const words = (s: string) => norm(s).split(/\s+/).filter((w) => w && !NOISE.has(w) && w.length > 1);

/** El singular aproximado: «perfumes» y «perfume» son lo mismo. */
const stem = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

/** Misma palabra o la misma con un error de dictado. Las palabras cortas tienen que ser iguales. */
function sameWord(a: string, b: string): boolean {
  const x = stem(a);
  const y = stem(b);
  if (x === y) return true;
  return Math.min(x.length, y.length) >= 5 && distance(x, y) <= 1;
}

export interface SimilarItem {
  ref: string;
  name: string;
  kind: 'product' | 'supply';
}

/**
 * Lo que tiene parentesco real: comparte una palabra con lo dictado. «Perfume» encuentra «Perfume Dior» y «Esencia de
 * perfume», y no «Perla». Primero lo que comparte más palabras; hasta tres.
 */
export function similarItems<T extends SimilarItem>(name: string, items: T[], limit = 3): T[] {
  const asked = words(name);
  if (asked.length === 0) return [];
  return items
    .map((item) => {
      const own = words(item.name);
      const shared = asked.filter((a) => own.some((o) => sameWord(a, o))).length;
      return { item, shared, own: own.length, first: asked.some((w) => own[0] && sameWord(w, own[0])) };
    })
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || Number(b.first) - Number(a.first) || a.own - b.own || a.item.name.localeCompare(b.item.name, 'es'))
    .slice(0, limit)
    .map((x) => x.item);
}

/** El precio que se dijo: «$50,000», «50.000», «50 mil», «cincuenta mil». null si no se dijo ninguno. */
export function dictatedPrice(text: string): number | null {
  const t = norm(text.replace(/(\d)[.,](?=\d{3}\b)/g, '$1'));
  const mil = /\b(\d{1,3}) mil\b/.exec(t);
  if (mil) return Number(mil[1]) * 1000;
  const TENS: Record<string, number> = { diez: 10, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, ocho: 8 };
  const said = /\b(diez|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|dos|tres|cuatro|cinco|seis|ocho) mil\b/.exec(t);
  if (said) return TENS[said[1]] * 1000;
  const plain = /\b(\d{3,7})\b/.exec(t);
  return plain ? Number(plain[1]) : null;
}

/**
 * ¿Dijo cuánto vale lo que vende? «El perfume vale 50 mil», «el precio del corte es 25.000». «Me cuesta 20 mil» habla de
 * su costo y «vendí uno por 50 mil» es una venta: ninguno cambia el precio.
 */
export function isPriceStatement(text: string): boolean {
  const t = norm(text);
  if (dictatedPrice(text) === null) return false;
  if (/\b(me|nos) (cuesta|costo|sale|salio)\b/.test(t) || /\b(vendi|compre|pague|gaste|fie)\b/.test(t)) return false;
  return /\b(vale|valor|cuesta|precio|lo vendo a|la vendo a|se vende a)\b/.test(t);
}

/** El único producto nombrado completo en la frase; con dos o ninguno, null: mejor no adivinar. */
export function itemNamedIn<T extends SimilarItem>(text: string, items: T[]): T | null {
  const said = words(text);
  const hits = items.filter((i) => i.kind === 'product').filter((i) => {
    const own = words(i.name);
    return own.length > 0 && own.every((o) => said.some((s) => sameWord(s, o)));
  });
  return hits.length === 1 ? hits[0] : null;
}
