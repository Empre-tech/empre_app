import * as FileSystem from 'expo-file-system/legacy';
import { AppState } from 'react-native';

import { request } from '@/api/client';
import { ANON_ID_RE, BATCH_SIZE, createQueue, makeAnonId, type QueuedEvent } from '@/lib/analyticsQueue';

// Medición anónima de uso (E1): qué se busca, qué perfiles se abren, cuándo se pide una indicación. No se
// guarda a la persona: solo un identificador de instalación que se cambia al desactivar la medición. Todo es
// fire-and-forget: nada de esto debe retrasar ni romper la app.

const FLUSH_MS = 10_000;

type Props = Record<string, string | number | boolean>;

/** Los eventos que la app envía (los mismos que acepta el servidor). */
export type EventName =
  | 'search_submitted'
  | 'search_no_results'
  | 'filter_applied'
  | 'profile_opened'
  | 'offer_viewed'
  | 'promotion_viewed'
  | 'contact_started'
  | 'directions_tapped'
  | 'follow_toggled'
  | 'question_asked'
  | 'booking_started'
  // Salud de la app (3.53): ver src/analytics/health.ts.
  | 'api_health'
  | 'app_start'
  | 'js_error';

interface Saved {
  id: string;
  enabled: boolean;
}

const queue = createQueue();
let state: Saved | null = null;
let loading: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let sending = false;

function file(): string | null {
  const dir = FileSystem.documentDirectory;
  return dir ? `${dir}analytics.json` : null;
}

async function persist(next: Saved) {
  state = next;
  const path = file();
  if (!path) return;
  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(next));
  } catch {
    // Sin espacio o sin permiso: la medición sigue en memoria.
  }
}

/** Lee (o crea) el identificador anónimo y la preferencia. Se puede llamar muchas veces. */
export function initAnalytics(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const path = file();
    let saved: Saved | null = null;
    if (path) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists) {
          const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(path));
          const p = parsed as Partial<Saved> | null;
          if (p && typeof p.id === 'string' && ANON_ID_RE.test(p.id)) saved = { id: p.id, enabled: p.enabled !== false };
        }
      } catch {
        saved = null;
      }
    }
    await persist(saved ?? { id: makeAnonId(Date.now()), enabled: true });
    AppState.addEventListener('change', (s) => {
      if (s !== 'active') void flush();
    });
  })();
  return loading;
}

export function isAnalyticsEnabled(): boolean {
  return state?.enabled !== false;
}

/** Activa o desactiva la medición. Al desactivar se vacía la cola y se cambia el identificador. */
export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  await initAnalytics();
  if (!enabled) queue.clear();
  await persist({ id: enabled ? (state?.id ?? makeAnonId(Date.now())) : makeAnonId(Date.now()), enabled });
}

function schedule() {
  if (timer || queue.size() === 0) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_MS);
}

/** Registra un evento. Nunca lanza ni espera. */
export function track(name: EventName, entityId?: string, props?: Props): void {
  void initAnalytics().then(() => {
    if (!isAnalyticsEnabled()) return;
    const event: QueuedEvent = { name };
    if (entityId) event.entity_id = entityId;
    if (props && Object.keys(props).length > 0) event.props = props;
    queue.push(event);
    if (queue.size() >= BATCH_SIZE) void flush();
    else schedule();
  });
}

/** Envía lo que haya en la cola, por lotes. Un fallo reintenta una vez más y luego descarta. */
export async function flush(): Promise<void> {
  if (sending || !state || !state.enabled) return;
  sending = true;
  try {
    while (queue.size() > 0) {
      const batch = queue.take();
      try {
        await request('/api/events', { method: 'POST', auth: false, body: { anon_id: state.id, events: batch.map((b) => b.event) } });
      } catch {
        queue.requeue(batch);
        break;
      }
    }
  } finally {
    sending = false;
    schedule();
  }
}
