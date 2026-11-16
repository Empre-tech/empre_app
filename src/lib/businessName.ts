/**
 * El nombre de un negocio sin su barrio (tablero «Inicio», 2026-11-16). Muchos negocios ponen la sede en el nombre
 * («Helados del Mar Mamatoco», «Corte Fino - Centro»): en una fila de negocios cercanos todos terminaban igual y el
 * nombre se cortaba. Se muestra «Helados del Mar»; la sede solo cuando aporta (dos sedes juntas en la misma fila, o un
 * barrio que no es donde estás).
 */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const SEP = /[\s\-–—·,(]/;

/** Separa el barrio del final del nombre, si el nombre termina en uno de los barrios conocidos. */
export function splitZone(name: string, zoneNames: readonly string[]): { base: string; sede: string | null } {
  const full = name.normalize('NFC').trim();
  // «Corte Fino (Centro)»: el paréntesis de cierre no cuenta
  const n = full.replace(/\)\s*$/, '');
  const nn = norm(n);
  // El barrio más largo primero: «Los Almendros» antes que «Almendros».
  const zones = [...zoneNames].map((z) => z.normalize('NFC').trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const z of zones) {
    const nz = norm(z);
    if (!nn.endsWith(nz)) continue;
    const cut = n.length - nz.length;
    // Solo una palabra entera: «Supercentro» no termina en el barrio «Centro».
    if (cut <= 0 || !SEP.test(n[cut - 1])) continue;
    const base = n
      .slice(0, cut)
      .replace(/[\s\-–—·,(]+$/, '')
      .replace(/\s+sede$/i, '')
      .trim();
    // Si el nombre es solo el barrio (una tienda que se llama «Mamatoco»), se deja.
    if (base.length < 3) continue;
    return { base, sede: z };
  }
  return { base: full, sede: null };
}

/**
 * Los nombres de una fila: sin el barrio, salvo cuando dos quedan iguales (dos sedes de la misma marca juntas). Ahí se
 * dejan completos para poder distinguirlas.
 */
export function rowNames(names: readonly string[], zoneNames: readonly string[]): { name: string; sede: string | null }[] {
  const split = names.map((n) => splitZone(n, zoneNames));
  const count = new Map<string, number>();
  for (const s of split) count.set(norm(s.base), (count.get(norm(s.base)) ?? 0) + 1);
  return split.map((s, i) => ((count.get(norm(s.base)) ?? 0) > 1 ? { name: names[i].trim(), sede: null } : { name: s.base, sede: s.sede }));
}

/** ¿El barrio de la sede es otro que donde estás? Sin saber dónde estás, no se dice. */
export function otherZone(sede: string | null, here: string | null | undefined): string | null {
  if (!sede || !here) return null;
  return norm(sede) === norm(here) ? null : sede;
}
