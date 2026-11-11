// La portada de un negocio sin foto: su color y su movimiento salen de lo que el negocio es. Sin imports: corre igual
// con `node --test` que en la app.

export type CoverMotif = 'steam' | 'stripes' | 'weave' | 'dots' | 'waves' | 'bubbles';

export interface CoverTheme {
  kind: string;
  color: string;
  motif: CoverMotif;
}

const THEMES: Record<string, CoverTheme> = {
  comida: { kind: 'comida', color: '#1F232B', motif: 'steam' },
  cafe: { kind: 'cafe', color: '#23262E', motif: 'steam' },
  barberia: { kind: 'barberia', color: '#14171F', motif: 'stripes' },
  ropa: { kind: 'ropa', color: '#1C2029', motif: 'weave' },
  clases: { kind: 'clases', color: '#172622', motif: 'dots' },
  agua: { kind: 'agua', color: '#152229', motif: 'waves' },
  bar: { kind: 'bar', color: '#191C24', motif: 'bubbles' },
  tienda: { kind: 'tienda', color: '#1D222B', motif: 'dots' },
};

// En orden: lo más específico primero («café» antes que «comida»; «bar» como palabra para no confundirlo con «barbería»).
const RULES: [RegExp, string][] = [
  [/caf[eé]|tinto|postre|panader|cup|cafe-/, 'cafe'],
  [/barber|peluquer|sal[oó]n|belleza|est[eé]tica|\bcut\b|cut-|spa\b/, 'barberia'],
  [/\bbar\b|cerve|licor|discoteca|beer|wine/, 'bar'],
  [/restaurante?|comida|corrientazo|pizza|hamburgues|asadero|fast-food|restaurant|fish|pescad|nutrition/, 'comida'],
  [/ropa|moda|zapato|calzado|boutique|shirt/, 'ropa'],
  [/clase|idioma|colegio|academia|escuela|librer|school|book/, 'clases'],
  [/buceo|playa|n[aá]utic|piscina|water|boat/, 'agua'],
];

/** El tema según el nombre de la categoría y su icono; si nada coincide, el de tienda. */
export function coverTheme(category?: string | null, icon?: string | null): CoverTheme {
  const text = `${category ?? ''} ${icon ?? ''}`.toLowerCase();
  const hit = RULES.find(([re]) => re.test(text));
  return THEMES[hit ? hit[1] : 'tienda'];
}
