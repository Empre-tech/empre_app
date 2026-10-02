import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getValidAccessToken } from '@/api/client';
import type { ChatMessage } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { WS_URL } from '@/config';
import { splitJsonObjects } from '@/lib/json-stream';

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed';

/** Lo que el backend espera recibir (models.Message); el resto lo completa el servidor. */
export interface OutgoingMessage {
  entity_id: string;
  user_id: string;
  sent_by_entity: boolean;
  content: string;
}

type MessageListener = (message: ChatMessage) => void;
/** `entityId` de la conversación cuyos mensajes (los que mandó quien escucha) se acaban de leer. */
type ReadListener = (entityId: string) => void;

/** Frame que NO es un mensaje de chat: un aviso de "ya te leyeron" para esa conversación.
 * Se distingue de un ChatMessage porque trae `event` (los mensajes nunca lo tienen). */
interface ReadReceiptFrame {
  event: 'conversation_read';
  entity_id: string;
}

function isReadReceipt(frame: ChatMessage | ReadReceiptFrame): frame is ReadReceiptFrame {
  return (frame as ReadReceiptFrame).event === 'conversation_read';
}

interface ChatContextValue {
  status: SocketStatus;
  /** false si el socket no está abierto (el mensaje NO se envió). */
  send: (message: OutgoingMessage) => boolean;
  /** Recibe los mensajes entrantes; devuelve la función para cancelar la suscripción. */
  subscribe: (listener: MessageListener) => () => void;
  /** Recibe avisos de "leído" en vivo; devuelve la función para cancelar la suscripción. */
  subscribeRead: (listener: ReadListener) => () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// React Native acepta un tercer argumento con headers (el tipo DOM no lo declara).
type WebSocketWithHeaders = new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers: Record<string, string> },
) => WebSocket;

export function ChatProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SocketStatus>('idle');
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<MessageListener>());
  const readListenersRef = useRef(new Set<ReadListener>());

  useEffect(() => {
    if (authStatus !== 'signedIn') return undefined;

    let disposed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      if (disposed) return;
      setStatus('connecting');

      // El backend valida el JWT solo al abrir la conexión (dura 1 h): pedimos uno fresco.
      const token = await getValidAccessToken();
      if (!token || disposed) return;

      const Ctor = WebSocket as unknown as WebSocketWithHeaders;
      const ws = new Ctor(`${WS_URL}/api/chat/ws?token=${encodeURIComponent(token)}`, undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
        // Al (re)conectar puede haber mensajes que llegaron mientras estuvimos
        // desconectados (p. ej. la app en segundo plano) y que el servidor no
        // pudo entregar en tiempo real: los recuperamos con un refetch.
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      };

      ws.onmessage = (event) => {
        for (const raw of splitJsonObjects(String(event.data))) {
          try {
            const parsed = JSON.parse(raw) as ChatMessage | ReadReceiptFrame;
            if (isReadReceipt(parsed)) {
              readListenersRef.current.forEach((listener) => listener(parsed.entity_id));
              continue;
            }
            listenersRef.current.forEach((listener) => listener(parsed));
          } catch {
            // frame inválido: lo ignoramos
          }
        }
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      };

      ws.onclose = () => {
        if (disposed) return;
        if (socketRef.current === ws) socketRef.current = null;
        setStatus('closed');
        attempt += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** attempt);
        timer = setTimeout(() => {
          void connect();
        }, delay);
      };

      ws.onerror = () => {
        // onclose se dispara después y se encarga de reintentar
      };
    };

    void connect();

    // El sistema operativo suspende la app en segundo plano y la conexión TCP
    // puede quedar "zombie" (el WebSocket no se entera de que ya no sirve
    // hasta que falla un ping, hasta 54s después). Al volver a primer plano,
    // si el socket no está realmente abierto forzamos una reconexión ya
    // mismo en vez de esperar a que el reintento automático lo note.
    const onAppStateChange = (next: AppStateStatus) => {
      if (next !== 'active' || disposed) return;
      const current = socketRef.current;
      if (current && current.readyState === WebSocket.OPEN) return;
      if (timer) clearTimeout(timer);
      attempt = 0;
      current?.close();
      void connect();
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      disposed = true;
      subscription.remove();
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
      socketRef.current = null;
      setStatus('idle');
    };
  }, [authStatus, queryClient]);

  const send = useCallback((message: OutgoingMessage) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const subscribeRead = useCallback((listener: ReadListener) => {
    readListenersRef.current.add(listener);
    return () => {
      readListenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo(
    () => ({ status, send, subscribe, subscribeRead }),
    [status, send, subscribe, subscribeRead],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat debe usarse dentro de <ChatProvider>');
  return ctx;
}
