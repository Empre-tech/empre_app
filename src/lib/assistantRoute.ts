// «Habla con Empre AI» por trabajo (tablero «Empre AI · un asistente por trabajo», 2026-11-17). Con reglas y sin
// modelo de lenguaje: qué es de otro trabajo (buscar negocios, redactar), qué es una pregunta sobre tus números y
// cuándo hay que preguntar porque la frase tiene dos lecturas. Sin imports: corre igual con `node --test`.

/** Dónde se abrió la hoja. No limita lo que se entiende: solo desempata lo dudoso y elige los ejemplos. */
export type AssistantModule = 'finance' | 'inventory' | 'debts' | 'tab' | 'none';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** El chip de arriba y los ejemplos de cada módulo. `label` null = el nombre del negocio (botón Empre en otra pantalla). */
export const MODULE_COPY: Record<AssistantModule, { label: string | null; examples: string[]; hint: string }> = {
  inventory: {
    label: 'En Inventario',
    examples: ['Se acabó el café', 'Llegaron 24 gaseosas', '¿Hay harina?', 'Vendí 3 arroces'],
    hint: 'Dime lo que llegó, lo que se acabó o cuánto hay. Si vendiste algo, también lo anoto.',
  },
  finance: {
    label: 'En Finance',
    examples: ['Vendí 2 por 12 mil en Nequi', 'Pagué el gas, 45 mil', '¿Cuánto vendí hoy?', 'Llegaron 20 kilos de carne'],
    hint: 'Dime lo que vendiste, lo que gastaste o pregúntame por tus números.',
  },
  debts: {
    label: 'En Cuentas',
    examples: ['Juan me abonó 20 mil', 'Le fié 15 mil a Doña Rosa', '¿Quién me debe?'],
    hint: 'Dime quién te abonó, a quién le fiaste o pregúntame quién te debe.',
  },
  tab: {
    label: 'En esta cuenta',
    examples: ['Dos bandejas y una gaseosa', 'Súmale un tinto', 'Cobra la cuenta en efectivo'],
    hint: 'Lo que digas que pidieron va a esta cuenta. «Cobra la cuenta» la cierra.',
  },
  none: {
    label: null,
    examples: ['Vendí 2 por 12 mil', 'Se acabó el café', '¿Cuánto vendí hoy?'],
    hint: 'Dime lo que vendiste, gastaste, llegó o se acabó, o pregúntame por tus números.',
  },
};

/** El módulo que el servidor entiende (solo desempata lo dudoso); en una cuenta abierta manda el id de la cuenta. */
export function serverModule(m: AssistantModule): 'finance' | 'inventory' | 'debts' | undefined {
  return m === 'finance' || m === 'inventory' || m === 'debts' ? m : undefined;
}

// ---- Lo que es de otro trabajo ----

export type OtherJob = { job: 'search'; query: string } | { job: 'draft' };

const SEARCH = [
  /\bdonde (venden|vende|hay|consigo|compro|queda|puedo|encuentro|esta|estan|me)\b/,
  /\bquien(es)? (vende|venden|tiene|tienen|hace|hacen|arregla)\b/,
  /\b(buscame|busca|buscar|recomiendame|recomienda)\b/,
  /\b(abiert[oa]s? (ahora|cerca|hoy)|a domicilio cerca)\b/,
  /\bcerca\b(?! de (\d|un |una |mil))/,
];
const DRAFT = [
  /\b(escribeme|escribe|redactame|redacta|redactar)\b/,
  /\bhaz(me)? (un|una) (texto|descripcion|titulo|publicacion|anuncio)\b/,
  /\b(descripcion|titulo|publicacion|caption) (de|del|para) (la|el|mi)\b/,
];

/**
 * ¿Es de otro trabajo? Buscar otros negocios va a Buscar con Empre AI; escribir textos, a Redactar. Habla con Empre AI
 * no lo responde a medias: lo lleva al lugar correcto y no gasta el tope.
 */
export function otherJob(text: string): OtherJob | null {
  const t = norm(text);
  if (!t) return null;
  if (DRAFT.some((r) => r.test(t))) return { job: 'draft' };
  if (SEARCH.some((r) => r.test(t))) {
    const query = t.replace(/^(y )?(donde|quien(es)?) (venden|vende|hay|consigo|compro|queda|puedo comprar|puedo|encuentro|tiene|tienen) /, '').replace(/^(buscame|busca|buscar|recomiendame) /, '').trim();
    return { job: 'search', query: query || t };
  }
  return null;
}

// ---- Preguntas sobre tus números ----

export type NumberTopic = 'sales' | 'expenses' | 'owed_to_me' | 'i_owe';
export type NumberPeriod = 'day' | 'week' | 'month' | 'yesterday' | 'days';
export interface NumberQuestion {
  topic: NumberTopic;
  period: NumberPeriod;
  /** Con period = 'days': cuántos días hacia atrás, contando hoy («en los últimos 10 días»). */
  days?: number;
}

const NUM_WORDS: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15, veinte: 20, treinta: 30 };

/** El periodo dicho: «hoy» (por defecto), «ayer», «esta semana», «este mes» o «los últimos 10 días» (2026-11-24). */
export function periodOf(t: string): { period: NumberPeriod; days?: number } {
  const last = /\bultim[oa]s? (\d{1,3}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta) dias\b/.exec(t);
  if (last) {
    const n = NUM_WORDS[last[1]] ?? Number(last[1]);
    if (n >= 1 && n <= 365) return { period: 'days', days: n };
  }
  if (/\b(ultimo mes|ultimos 30 dias)\b/.test(t)) return { period: 'days', days: 30 };
  if (/\b(ultima semana|ultimos 7 dias)\b/.test(t)) return { period: 'days', days: 7 };
  if (/\bayer\b/.test(t)) return { period: 'yesterday' };
  if (/\bsemana\b/.test(t)) return { period: 'week' };
  if (/\bmes\b/.test(t)) return { period: 'month' };
  return { period: 'day' };
}

const TOPICS: [NumberTopic, RegExp][] = [
  ['sales', /\b(cuanto|que tanto|cuanta plata) (he |llevo |hemos )?(vendi|vendido|vendimos|vendo|llevo vendido)|\bcomo (voy|vamos|me fue|nos fue)\b|\bventas de (hoy|la semana|esta semana|este mes|el mes)\b/],
  ['expenses', /\b(cuanto|que tanto|cuanta plata) (he |llevo )?(gaste|gastado|gastamos|pague|pagado)\b|\bgastos de (hoy|la semana|esta semana|este mes|el mes)\b/],
  ['owed_to_me', /\bquien(es)? me (debe|deben)\b|\bcuanto me (debe|deben)\b|\bque me deben\b/],
  ['i_owe', /\b(a quien|a quienes) (le |les )?debo\b|\bcuanto (le |les )?debo\b|\bque debo\b/],
];

/** Las preguntas sobre tus números que hay en la frase, en el orden en que se dijeron. Se responden con tus datos. */
export function numberQuestions(text: string): NumberQuestion[] {
  const t = norm(text);
  if (!t) return [];
  const p = periodOf(t);
  return TOPICS.map(([topic, r]) => ({ topic, at: t.search(r) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ topic }): NumberQuestion => (topic === 'owed_to_me' || topic === 'i_owe' ? { topic, period: 'day' } : { topic, ...p }));
}

const PERIOD_WORD: Record<Exclude<NumberPeriod, 'days'>, string> = { day: 'Hoy', week: 'Esta semana', month: 'Este mes', yesterday: 'Ayer' };
const past = (q: NumberQuestion) => q.period === 'yesterday' || (q.period === 'days' && (q.days ?? 1) > 1);
const whenOf = (q: NumberQuestion) => (q.period === 'days' ? (q.days === 1 ? 'Hoy' : `En los últimos ${q.days} días`) : PERIOD_WORD[q.period]);

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO').replace(/,/g, '.')}`;

export interface NumbersData {
  sales_total?: number;
  sales_count?: number;
  expenses_total?: number;
  /** Clientes que te deben (balance > 0), el que más primero. */
  owing?: { name: string; balance: number }[];
  /** A quién le debes (proveedores con balance > 0), el que más primero. */
  owed?: { name: string; balance: number }[];
}

export interface NumberAnswer {
  topic: NumberTopic;
  title: string;
  /** La cifra grande; null si no hay datos (entonces `sub` lo dice, sin inventar un cero). */
  big: string | null;
  sub: string;
  link: string;
  /** La frase como la dice Empre AI en el chat: el dato en negrita. */
  say: { t: string; bold?: boolean }[];
}

/** La frase: «Hoy vendiste **$280.000** · 14 ventas.»; sin dato, solo lo que pasa («Hoy no has anotado ventas.»). */
function sayOf(title: string, big: string | null, sub: string): { t: string; bold?: boolean }[] {
  return big ? [{ t: `${title} ` }, { t: big, bold: true }, { t: ` · ${sub}.` }] : [{ t: sub }];
}

/** La respuesta con plantilla: la cifra sale de tus datos y lleva a su detalle. Si no hay datos, lo dice. */
export function answerFor(q: NumberQuestion, d: NumbersData): NumberAnswer {
  const a = answerData(q, d);
  return { ...a, say: sayOf(a.title, a.big, a.sub) };
}

function answerData(q: NumberQuestion, d: NumbersData): Omit<NumberAnswer, 'say'> {
  const when = whenOf(q);
  if (q.topic === 'sales') {
    const n = d.sales_count ?? 0;
    return n > 0
      ? { topic: 'sales', title: `${when} vendiste`, big: pesos(d.sales_total ?? 0), sub: n === 1 ? '1 venta' : `${n} ventas`, link: 'Así sale, en Finance' }
      : { topic: 'sales', title: `${when} vendiste`, big: null, sub: `${when} ${past(q) ? 'no anotaste' : 'no has anotado'} ventas.`, link: 'Abrir Finance' };
  }
  if (q.topic === 'expenses') {
    const v = d.expenses_total ?? 0;
    return v > 0
      ? { topic: 'expenses', title: `${when} gastaste`, big: pesos(v), sub: 'Lo que anotaste como gasto', link: 'Así sale, en Finance' }
      : { topic: 'expenses', title: `${when} gastaste`, big: null, sub: `${when} ${past(q) ? 'no anotaste' : 'no has anotado'} gastos.`, link: 'Abrir Finance' };
  }
  const list = (q.topic === 'owed_to_me' ? d.owing : d.owed) ?? [];
  const total = list.reduce((s, p) => s + p.balance, 0);
  const top = list[0];
  if (q.topic === 'owed_to_me') {
    return total > 0 && top
      ? { topic: 'owed_to_me', title: 'Te deben', big: pesos(total), sub: `${list.length === 1 ? '1 persona' : `${list.length} personas`} · ${top.name}, ${pesos(top.balance)}${list.length > 1 ? ', el que más' : ''}`, link: 'Ver Cuentas' }
      : { topic: 'owed_to_me', title: 'Te deben', big: null, sub: 'Nadie te debe ahora.', link: 'Ver Cuentas' };
  }
  return total > 0 && top
    ? { topic: 'i_owe', title: 'Debes', big: pesos(total), sub: `${list.length === 1 ? 'A 1 proveedor' : `A ${list.length} proveedores`} · ${top.name}, ${pesos(top.balance)}${list.length > 1 ? ', el que más' : ''}`, link: 'Ver Cuentas' }
    : { topic: 'i_owe', title: 'Debes', big: null, sub: 'No le debes a nadie ahora.', link: 'Ver Cuentas' };
}

// ---- Lo dudoso ----

/**
 * «30 pollos» sin precio ni verbo: en Inventario es cuántos hay; en Finance y en una cuenta lo decide el servidor con
 * su módulo; desde el botón Empre en otra pantalla (o en Cuentas) se pregunta: «¿Vendiste 30 pollos o te llegaron?».
 */
export function askWhichReading(module: AssistantModule, intentKind: string | null, moneyTalk: boolean): boolean {
  return !moneyTalk && intentKind === 'count' && (module === 'none' || module === 'debts');
}

/** El destino de cada línea antes de guardar: así se ve qué cambia. */
export function destinationLabel(type: string, tab?: string): string {
  if (type === 'stock') return 'Va a Inventario';
  if (type === 'tab_add' || type === 'tab_pay') return tab ? `Va a ${tab}` : 'Va a la cuenta';
  if (type === 'payment') return 'Va a Cuentas';
  return 'Va a Finance';
}
