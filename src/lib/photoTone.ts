// Sin foto, el negocio se ve sobre uno de los tonos de tinta del lienzo, con su icono en blanco.
const TONES = ['#0E2346', '#4C5C74', '#5B6B82', '#0B1A36'] as const;

export function photoTone(seed: number | string): string {
  const n = typeof seed === 'number' ? seed : [...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return TONES[Math.abs(n) % TONES.length];
}
