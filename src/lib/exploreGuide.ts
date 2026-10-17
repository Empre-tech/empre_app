// Guía de la primera vez en Explorar (3.23): tres pasos con foco. Sin React para poder probarlo con Node.

export type GuideStepId = 'where' | 'area' | 'legend';

export interface GuideStep {
  id: GuideStepId;
  title: string;
  text: string;
}

export const GUIDE_STEPS: GuideStep[] = [
  { id: 'where', title: 'Dónde estás', text: 'Arriba ves tu zona. Si mueves el mapa a otra, dice «Explorando» y te ofrece volver.' },
  {
    id: 'area',
    title: 'Lo que ves es lo que sale',
    text: 'El círculo punteado marca la zona que estás mirando. El panel de abajo muestra los destacados que se ven en el mapa.',
  },
  { id: 'legend', title: 'Qué significan los pines', text: 'Rayo: oferta activa ahora. Punto verde: abierto. Toca la leyenda cuando quieras repasarlo.' },
];

/** Siguiente paso: «Saltar» o terminar el último la cierran (null). */
export function nextGuideStep(current: number, action: 'next' | 'skip'): number | null {
  if (action === 'skip') return null;
  return current + 1 < GUIDE_STEPS.length ? current + 1 : null;
}

/** Sale sola solo la primera vez (no se vio) y nunca con un negocio abierto o con búsqueda. */
export function shouldAutoStart(seen: boolean | null, busy: boolean): boolean {
  return seen === false && !busy;
}
