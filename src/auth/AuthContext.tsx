import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi, usersApi } from '@/api/endpoints';
import { ApiError, setSessionHandlers, setSessionTokens } from '@/api/client';
import type { RegisterInput, User } from '@/api/types';
import { getRegisteredPushToken, setRegisteredPushToken } from '@/notifications/pushTokenStore';
import { clearTokens, loadTokens, saveTokens } from './storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Vuelve a pedir los datos del usuario (p. ej. tras cambiar la foto de perfil). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    // Antes de borrar los tokens de sesión (que son los que autentican la
    // llamada): si no, este dispositivo seguiría recibiendo notificaciones
    // de esta cuenta después de cerrar sesión.
    const pushToken = getRegisteredPushToken();
    if (pushToken) {
      try {
        await usersApi.removePushToken(pushToken);
      } catch {
        // Best-effort: si falla, el token simplemente queda huérfano en el backend
        // (dejará de servir cuando expire/se desinstale la app) y no bloquea el logout.
      }
      setRegisteredPushToken(null);
    }
    setSessionTokens(null);
    await clearTokens();
    queryClient.clear();
    setUser(null);
    setStatus('signedOut');
  }, [queryClient]);

  // Restaurar sesión al abrir la app.
  useEffect(() => {
    setSessionHandlers({
      onTokens: (tokens) => {
        if (tokens) void saveTokens(tokens);
        else void clearTokens();
      },
      onExpired: () => {
        void signOut();
      },
    });

    let cancelled = false;
    (async () => {
      const stored = await loadTokens();
      if (!stored) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      setSessionTokens(stored);
      try {
        const me = await usersApi.me();
        if (cancelled) return;
        setUser(me);
        setStatus('signedIn');
      } catch (error) {
        if (cancelled) return;
        // Sin red u otro fallo transitorio: no borramos los tokens guardados,
        // solo dejamos la sesión en memoria vacía para reintentar en la próxima apertura.
        if (!(error instanceof ApiError) || error.status !== 401) {
          setSessionTokens(null);
        }
        setStatus('signedOut');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login(email.trim(), password);
    setSessionTokens(tokens);
    try {
      const me = await usersApi.me();
      await saveTokens(tokens);
      setUser(me);
      setStatus('signedIn');
    } catch (error) {
      setSessionTokens(null);
      throw error;
    }
  }, []);

  const signUp = useCallback(
    async (input: RegisterInput) => {
      await authApi.register({
        ...input,
        name: input.name.trim(),
        email: input.email.trim(),
        phone: input.phone?.trim() || undefined,
      });
      await signIn(input.email, input.password);
    },
    [signIn],
  );

  const refreshUser = useCallback(async () => {
    setUser(await usersApi.me());
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, refreshUser }),
    [status, user, signIn, signUp, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
