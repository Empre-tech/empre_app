// Lo que lee el lector de pantalla de cada marcador del mapa (3.32). Sin React para probarlo con Node.
//
// Un pin es una imagen: sin etiqueta, TalkBack o VoiceOver no dicen qué negocio es. Nunca se lee cuántas ofertas hay
// (regla de las ofertas), solo si tiene una ahora.

interface LabelEntity {
  name: string;
  has_active_offer?: boolean;
  has_hours?: boolean;
  is_open_now?: boolean;
}

/** «Sazón Costeño, oferta ahora, abierto». Sin horario publicado no se afirma si está abierto. */
export function pinLabel(e: LabelEntity, selected = false): string {
  const parts = [e.name];
  if (e.has_active_offer) parts.push('oferta ahora');
  if (e.has_hours) parts.push(e.is_open_now ? 'abierto' : 'cerrado');
  if (selected) parts.push('elegido');
  return parts.join(', ');
}

/** «3 negocios juntos: Sazón Costeño y 2 más, uno con oferta ahora». */
export function stackLabel(items: LabelEntity[]): string {
  const [first] = items;
  if (!first) return '';
  const rest = items.length - 1;
  const head = `${items.length} negocios juntos: ${first.name}${rest > 0 ? ` y ${rest} más` : ''}`;
  return items.some((i) => i.has_active_offer) ? `${head}, alguno con oferta ahora` : head;
}

/** «12 negocios aquí, en Centro Histórico. Toca para acercar». */
export function bubbleLabel(count: number, zone: string | null, hasOffer: boolean): string {
  const where = zone ? `, en ${zone}` : '';
  const offer = hasOffer ? ', alguno con oferta ahora' : '';
  return `${count} ${count === 1 ? 'negocio' : 'negocios'} aquí${where}${offer}. Toca para acercar`;
}
