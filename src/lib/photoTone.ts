// Sin foto, el negocio se ve sobre uno de los tonos de tinta del lienzo, con su icono en blanco.
const TONES = ['#2B2622', '#5B606B', '#6B7079', '#22252B'] as const;

export function photoTone(seed: number | string): string {
  const n = typeof seed === 'number' ? seed : [...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return TONES[Math.abs(n) % TONES.length];
}
