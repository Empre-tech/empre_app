// «Haz que tu negocio destaque» (3.40, mockup vitrina_viva.html): los 8 puntos que llegan del servidor
// (GET /entities/:id/completeness) con lo que hay que hacer y lo que de verdad cambia en la app. Al completarlos, la
// lista se despide una vez y deja de mostrarse. Sin React para probarlo con Node.

export type GrowthKey = 'photo' | 'cover' | 'photos' | 'hours' | 'tagline' | 'description' | 'catalog' | 'offer';
export type GrowthGroup = 'look' | 'found' | 'sell';
/** A dónde lleva el botón: editar el negocio, subir fotos al perfil, el catálogo o publicar una oferta. */
export type GrowthTarget = 'edit' | 'photos' | 'catalog' | 'offer';

export interface GrowthItem {
  key: GrowthKey;
  group: GrowthGroup;
  done: boolean;
}

const COPY: Record<GrowthKey, { title: string; why: string; action: string; target: GrowthTarget }> = {
  photo: { title: 'Foto de perfil', why: 'Tu pin del mapa muestra tu foto en lugar del icono.', action: 'Subir', target: 'edit' },
  cover: { title: 'Foto de portada', why: 'Tu tarjeta en Descubre y en Ofertas sale con foto.', action: 'Subir', target: 'edit' },
  photos: { title: '3 fotos de tu negocio', why: 'Quien abre tu perfil ve el lugar antes de ir.', action: 'Agregar', target: 'photos' },
  hours: { title: 'Horario de atención', why: 'Apareces como «Abierto ahora»; sin horario quedas en «Sin horario publicado».', action: 'Poner', target: 'edit' },
  tagline: { title: 'Frase corta', why: 'Es la línea que ven bajo tu nombre.', action: 'Escribir', target: 'edit' },
  description: { title: 'Descripción', why: 'Lo que lee quien abre tu perfil para decidir.', action: 'Escribir', target: 'edit' },
  catalog: { title: 'Servicios con precio', why: '«Pregúntale» responde precios por ti y tus ofertas muestran el ahorro.', action: 'Agregar', target: 'catalog' },
  offer: { title: 'Tu primera oferta', why: 'Entras a la pestaña Ofertas, donde te encuentran los que buscan descuentos.', action: 'Publicar', target: 'offer' },
};

const GROUPS: { id: GrowthGroup; title: string }[] = [
  { id: 'look', title: 'Lo que más se nota' },
  { id: 'found', title: 'Para que te encuentren' },
  { id: 'sell', title: 'Para vender más' },
];

export interface GrowthRow extends GrowthItem {
  title: string;
  why: string;
  action: string;
  target: GrowthTarget;
}

export interface GrowthView {
  done: number;
  total: number;
  percent: number;
  complete: boolean;
  /** «2 de 8 listo». */
  label: string;
  groups: { id: GrowthGroup; title: string; rows: GrowthRow[] }[];
}

/** Arma la tarjeta: puntos con su texto, agrupados, y el avance. Claves desconocidas se ignoran (servidor más nuevo). */
export function growthView(items: GrowthItem[]): GrowthView {
  const rows: GrowthRow[] = items.filter((i) => i.key in COPY).map((i) => ({ ...i, ...COPY[i.key] }));
  const done = rows.filter((r) => r.done).length;
  const total = rows.length;
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    complete: total > 0 && done === total,
    label: `${done} de ${total} listo`,
    groups: GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.group === g.id) })).filter((g) => g.rows.length > 0),
  };
}

/**
 * Qué se muestra: la lista mientras falte algo; al completarla por primera vez, la despedida («¡Listo!») y luego nada;
 * si ya se despidió, nada. Si vuelve a faltar algo (borró la foto), la lista vuelve.
 */
export function growthPhase(view: Pick<GrowthView, 'complete' | 'total'> | undefined, celebrated: boolean): 'list' | 'celebrate' | 'hidden' {
  if (!view || view.total === 0) return 'hidden';
  if (!view.complete) return 'list';
  return celebrated ? 'hidden' : 'celebrate';
}
