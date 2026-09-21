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

interface ChatContextValue {
  status: SocketStatus;
  /** false si el socket no está abierto (el mensaje NO se envió). */
  send: (message: OutgoingMessage) => boolean;
  /** Recibe los mensajes entrantes; devuelve la función para cancelar la suscripción. */
  subscribe: (listener: MessageListener) => () => void;
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
      };

      ws.onmessage = (event) => {
        for (const raw of splitJsonObjects(String(event.data))) {
          try {
            const message = JSON.parse(raw) as ChatMessage;
            listenersRef.current.forEach((listener) => listener(message));
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

    return () => {
      disposed = true;
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

  const value = useMemo(() => ({ status, send, subscribe }), [status, send, subscribe]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat debe usarse dentro de <ChatProvider>');
  return ctx;
}
