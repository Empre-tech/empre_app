/**
 * Con pocos negocios, cada uno una vez (2026-11-16, igual en Inicio y en Empre Finder): por debajo de este número, las
 * filas o secciones repetirían los mismos negocios («Abierto ahora», «Nuevos», «Ofertas»…). Se juntan en una sola lista.
 */
export const FEW_BUSINESSES = 8;

/**
 * Las secciones de Descubre: si en lo que se ve hay menos de `few` negocios, una sola sección «Todo lo que hay aquí» con
 * cada negocio una vez (en el orden en que salían). Con más, quedan como están.
 */
export function oneListWhenFew<I extends { entity_id: string }, S extends { title: string; items: I[] }>(sections: S[], totalInView: number, few: number = FEW_BUSINESSES): (S & { merged?: boolean })[] {
  if (sections.length <= 1 || totalInView <= 0 || totalInView >= few) return sections;
  const seen = new Set<string>();
  const items: I[] = [];
  for (const sec of sections) for (const it of sec.items) if (!seen.has(it.entity_id)) (seen.add(it.entity_id), items.push(it));
  return [{ ...sections[0], title: 'Todo lo que hay aquí', items, merged: true }];
}
