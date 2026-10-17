import * as FileSystem from 'expo-file-system/legacy';
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { entitiesApi } from '@/api/endpoints';
import { addItem, markDone, markFailed, removeItem, restore, retryItem, setProgress, toPersist, type UploadItem } from '@/lib/uploadQueue';

/**
 * El almacén de la cola de subidas y de los avisos breves («Oferta publicada ✓»). Vive fuera de React para que una
 * subida siga aunque se cierre la pantalla que la empezó; los componentes lo leen con `useUploads`. Lo que no terminó
 * se guarda en un archivo y, al volver a abrir la app, aparece como fallido con «Reintentar».
 */

interface State {
  items: UploadItem[];
  notice: string | null;
  /** Ofertas recién publicadas (brillo en la lista del dueño durante unos segundos). */
  fresh: string[];
}

const FILE = `${FileSystem.documentDirectory ?? ''}uploads.json`;
const NOTICE_MS = 2500;
const FRESH_MS = 6000;

let state: State = { items: [], notice: null, fresh: [] };
const listeners = new Set<() => void>();
let queryClient: QueryClient | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function set(next: Partial<State>) {
  const prevItems = state.items;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  if (next.items && next.items !== prevItems) void persist();
}

async function persist() {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(toPersist(state.items)));
  } catch {
    // Guardar lo pendiente es una ayuda: si falla, la subida sigue igual.
  }
}

/** Conecta el almacén con la caché de datos y recupera lo que quedó sin subir. Se llama una vez al abrir la app. */
export async function initUploads(qc: QueryClient) {
  queryClient = qc;
  if (!FileSystem.documentDirectory) return;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return;
    const saved = restore(JSON.parse(await FileSystem.readAsStringAsync(FILE)));
    if (saved.length) set({ items: [...state.items, ...saved.filter((s) => !state.items.some((x) => x.id === s.id))] });
  } catch {
    // Un archivo dañado no debe impedir abrir la app.
  }
}

/** Un aviso breve en la cápsula («Oferta publicada ✓», «Cambios guardados ✓»). */
export function notify(text: string) {
  if (noticeTimer) clearTimeout(noticeTimer);
  set({ notice: text });
  noticeTimer = setTimeout(() => set({ notice: null }), NOTICE_MS);
}

/** Marca una oferta como recién publicada: la lista del dueño la hace brillar una vez. */
export function markFresh(offerId: string) {
  set({ fresh: [...state.fresh, offerId] });
  setTimeout(() => set({ fresh: state.fresh.filter((id) => id !== offerId) }), FRESH_MS);
}

async function run(id: string) {
  const item = state.items.find((x) => x.id === id);
  if (!item) return;
  try {
    await entitiesApi.uploadImage(item.entityId, 'gallery', { uri: item.uri, name: item.name, type: item.type }, {
      caption: item.caption,
      onProgress: (p) => set({ items: setProgress(state.items, id, p) }),
    });
    set({ items: markDone(state.items, id) });
    // La celda «subiendo» se va cuando la foto real ya llegó al perfil: así no hay hueco ni foto repetida.
    await Promise.all([
      queryClient?.invalidateQueries({ queryKey: ['entity', item.entityId] }),
      queryClient?.invalidateQueries({ queryKey: ['posts', item.entityId] }),
    ]);
    set({ items: removeItem(state.items, id) });
    notify(item.type.startsWith('video/') ? 'Video publicado ✓' : 'Foto publicada ✓');
  } catch (e) {
    set({ items: markFailed(state.items, id, e instanceof Error && e.message ? e.message : 'No se subió') });
  }
}

/** Sube una publicación en segundo plano: aparece al instante en el mosaico con su progreso. */
export function enqueuePost(input: { entityId: string; media: { uri: string; name: string; type: string; width: number; height: number }; caption?: string }) {
  const id = `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  set({ items: addItem(state.items, { id, entityId: input.entityId, uri: input.media.uri, name: input.media.name, type: input.media.type, width: input.media.width, height: input.media.height, caption: input.caption, createdAt: Date.now() }) });
  void run(id);
  return id;
}

export function retryUpload(id: string) {
  set({ items: retryItem(state.items, id) });
  void run(id);
}

/** Reintenta todo lo que falló (al tocar la cápsula). */
export function retryAllFailed() {
  state.items.filter((x) => x.status === 'failed').forEach((x) => retryUpload(x.id));
}

export function removeUpload(id: string) {
  set({ items: removeItem(state.items, id) });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const getSnapshot = () => state;

/** El estado de la cola para dibujar la cápsula, las celdas y el brillo. */
export function useUploads(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
