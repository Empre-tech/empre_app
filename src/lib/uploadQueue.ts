// La cola de subidas (publicaciones del negocio): lógica pura, sin React ni red, para probarla con Node. El almacén
// (`src/upload/uploadStore.ts`) la usa para dibujar la cápsula de estado y las celdas «subiendo» del mosaico.

export type UploadStatus = 'uploading' | 'done' | 'failed';

export interface UploadItem {
  id: string;
  entityId: string;
  uri: string;
  name: string;
  /** MIME del archivo («image/jpeg», «video/mp4»). */
  type: string;
  width: number;
  height: number;
  caption?: string;
  status: UploadStatus;
  /** 0 a 1. */
  progress: number;
  error?: string;
  createdAt: number;
}

export const isVideoItem = (i: Pick<UploadItem, 'type'>) => i.type.startsWith('video/');

/** Agrega una subida nueva (empieza subiendo, en 0 %); va primera. */
export function addItem(list: UploadItem[], item: Omit<UploadItem, 'status' | 'progress' | 'error'>): UploadItem[] {
  return [{ ...item, status: 'uploading', progress: 0 }, ...list.filter((x) => x.id !== item.id)];
}

/** Avanza el progreso: entre 0 y 1 y nunca hacia atrás (un aviso tardío no lo hace retroceder). */
export function setProgress(list: UploadItem[], id: string, p: number): UploadItem[] {
  const v = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
  return list.map((x) => (x.id === id && x.status === 'uploading' ? { ...x, progress: Math.max(x.progress, v) } : x));
}

export function markDone(list: UploadItem[], id: string): UploadItem[] {
  return list.map((x) => (x.id === id ? { ...x, status: 'done' as const, progress: 1, error: undefined } : x));
}

export function markFailed(list: UploadItem[], id: string, error: string): UploadItem[] {
  return list.map((x) => (x.id === id ? { ...x, status: 'failed' as const, error } : x));
}

/** Reintentar: vuelve a subir desde 0. */
export function retryItem(list: UploadItem[], id: string): UploadItem[] {
  return list.map((x) => (x.id === id && x.status === 'failed' ? { ...x, status: 'uploading' as const, progress: 0, error: undefined } : x));
}

export function removeItem(list: UploadItem[], id: string): UploadItem[] {
  return list.filter((x) => x.id !== id);
}

/** Las subidas de un negocio (para las celdas del mosaico), en orden de la cola. */
export function itemsFor(list: UploadItem[], entityId: string): UploadItem[] {
  return list.filter((x) => x.entityId === entityId);
}

/** Lo que se guarda en el teléfono: solo lo que no terminó (subiendo o fallido). */
export function toPersist(list: UploadItem[]): UploadItem[] {
  return list.filter((x) => x.status !== 'done');
}

/** Al abrir la app, lo que quedó a medias se muestra como fallido (no se reintenta solo): el dueño decide. */
export function restore(saved: unknown): UploadItem[] {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((x): x is UploadItem => Boolean(x) && typeof x === 'object' && typeof (x as UploadItem).id === 'string' && typeof (x as UploadItem).uri === 'string' && typeof (x as UploadItem).entityId === 'string')
    .map((x) => ({ ...x, status: 'failed', progress: 0, error: x.status === 'uploading' ? 'Se interrumpió al cerrar la app' : x.error ?? 'No se subió' }) as UploadItem);
}

export type CapsuleTone = 'uploading' | 'failed' | 'done';

export interface Capsule {
  text: string;
  tone: CapsuleTone;
  /** 0 a 1, solo mientras sube. */
  progress?: number;
}

/**
 * Lo que dice la cápsula: mientras algo sube, «Subiendo foto · 42 %» (o «Subiendo 2 archivos · 30 %» con el progreso
 * promedio); si no, lo que falló («No se subió una publicación · Reintentar»); si no, el aviso reciente
 * («Publicada ✓», «Oferta publicada ✓»). Sin nada, no hay cápsula.
 */
export function capsule(list: UploadItem[], notice: string | null): Capsule | null {
  const up = list.filter((x) => x.status === 'uploading');
  if (up.length === 1) {
    const pct = Math.round(up[0].progress * 100);
    return { text: `Subiendo ${isVideoItem(up[0]) ? 'video' : 'foto'} · ${pct} %`, tone: 'uploading', progress: up[0].progress };
  }
  if (up.length > 1) {
    const avg = up.reduce((a, x) => a + x.progress, 0) / up.length;
    return { text: `Subiendo ${up.length} archivos · ${Math.round(avg * 100)} %`, tone: 'uploading', progress: avg };
  }
  const failed = list.filter((x) => x.status === 'failed').length;
  if (failed > 0) return { text: `No se ${failed === 1 ? 'subió una publicación' : `subieron ${failed} publicaciones`} · Reintentar`, tone: 'failed' };
  if (notice) return { text: notice, tone: 'done' };
  return null;
}

/** Lo que anuncia el lector de pantalla al cambiar de estado (no en cada punto del progreso: cada 25 %). */
export function announcement(prev: Capsule | null, next: Capsule | null): string | null {
  if (!next) return null;
  if (!prev || prev.tone !== next.tone) return next.text;
  if (next.tone === 'uploading' && prev.progress !== undefined && next.progress !== undefined) {
    const step = (p: number) => Math.floor(p * 4);
    if (step(next.progress) > step(prev.progress)) return next.text;
  }
  return prev.text !== next.text && next.tone !== 'uploading' ? next.text : null;
}
