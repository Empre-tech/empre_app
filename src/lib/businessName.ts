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
    // Si queda muy corto («Spa Mamatoco» → «Spa») o el nombre es solo el barrio, se deja completo.
    if (base.length < 4) continue;
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

/** Palabras que terminan muchos nombres sin ser un lugar: nunca se toman como barrio. */
const NOT_PLACE = new Set(
  'express gourmet store shop market plus club studio house grill bar cafe spa pizza burger sushi food foods fit gym kids pet pets sport sports style beauty nails hair barber tech cell movil mobile center mall outlet premium vip home'.split(' '),
);

/**
 * Los barrios que se ven en los nombres de los negocios cercanos (2026-11-16): las zonas registradas son pocas (en
 * Santa Marta, tres), pero los nombres lo dicen solos. Un final de una o dos palabras con mayúscula es barrio si termina
 * al menos `min` nombres distintos («Mamatoco» en «Helados del Mar Mamatoco», «Farma Caribe Mamatoco»…), o si el
 * nombre es otro negocio de la lista más ese final («Casa Mar» y «Casa Mar Los Almendros»).
 */
export function learnPlaceSuffixes(names: readonly string[], min = 3): string[] {
  const clean = names.map((n) => n.normalize('NFC').trim()).filter(Boolean);
  const bases = new Set(clean.map(norm));
  const ends = new Map<string, { phrase: string; bases: Set<string> }>();
  const found = new Set<string>();
  for (const name of clean) {
    const words = name.split(/\s+/);
    for (const k of [1, 2]) {
      if (words.length <= k) continue;
      const tail = words.slice(-k);
      if (!tail.every((w) => /^\p{Lu}/u.test(w) || /^(de|del|la|las|los|el)$/i.test(w))) continue;
      if (!/^\p{Lu}/u.test(tail[tail.length - 1]) || NOT_PLACE.has(norm(tail[tail.length - 1]))) continue;
      const base = words.slice(0, -k).join(' ');
      if (base.length < 4) continue;
      const phrase = tail.join(' ');
      // Otro negocio de la lista es este mismo nombre sin el final: es una sede.
      if (bases.has(norm(base))) found.add(phrase);
      const key = norm(phrase);
      const e = ends.get(key) ?? { phrase, bases: new Set<string>() };
      e.bases.add(norm(base));
      ends.set(key, e);
    }
  }
  for (const e of ends.values()) if (e.bases.size >= min) found.add(e.phrase);
  // «Los Almendros» y «Almendros» terminan los mismos nombres: queda el más largo (splitZone prueba primero el largo).
  return [...found];
}

/** ¿El barrio de la sede es otro que donde estás? Sin saber dónde estás, no se dice. */
export function otherZone(sede: string | null, here: string | null | undefined): string | null {
  if (!sede || !here) return null;
  return norm(sede) === norm(here) ? null : sede;
}
