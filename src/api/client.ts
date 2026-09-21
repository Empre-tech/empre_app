import { API_URL } from '@/config';
import type { TokenPair } from './types';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Sesión en memoria. AuthProvider la carga/persiste; el cliente solo la usa.
// ---------------------------------------------------------------------------

let tokens: TokenPair | null = null;

interface SessionHandlers {
  /** Se llama cuando el cliente renovó (o invalidó) los tokens. */
  onTokens?: (tokens: TokenPair | null) => void;
  /** Se llama cuando el refresh token ya no sirve: hay que volver a iniciar sesión. */
  onExpired?: () => void;
}

let handlers: SessionHandlers = {};

export function setSessionTokens(next: TokenPair | null) {
  tokens = next;
}

export function setSessionHandlers(next: SessionHandlers) {
  handlers = next;
}

function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    const json = JSON.parse(atob(padded)) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const current = tokens;
  if (!current) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
    if (!res.ok) {
      // Solo cerramos sesión si el servidor rechazó el token; un fallo de red no.
      if (res.status === 400 || res.status === 401) {
        tokens = null;
        handlers.onTokens?.(null);
        handlers.onExpired?.();
      }
      return false;
    }
    const data = (await res.json()) as Partial<TokenPair>;
    if (!data.access_token) return false;
    tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? current.refresh_token,
    };
    handlers.onTokens?.(tokens);
    return true;
  } catch {
    return false;
  }
}

/** Renueva la sesión; varias llamadas simultáneas comparten una sola petición. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** Devuelve el access token, renovándolo antes si vence en menos de 30 s. */
export async function getValidAccessToken(): Promise<string | null> {
  if (!tokens) return null;
  const exp = jwtExpiryMs(tokens.access_token);
  if (exp !== null && exp - Date.now() < 30_000) {
    await refreshSession();
  }
  return tokens?.access_token ?? null;
}

// ---------------------------------------------------------------------------
// Peticiones
// ---------------------------------------------------------------------------

type Query = Record<string, string | number | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Cuerpo multipart (subida de archivos). Tiene prioridad sobre `body`. */
  formData?: FormData;
  /** false = endpoint público: no se envía ni se renueva el token. Por defecto true. */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const params: string[] = [];
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return `${API_URL}${path}${params.length ? `?${params.join('&')}` : ''}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown; message?: unknown };
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
  } catch {
    // cuerpo vacío o no-JSON
  }
  return `Error ${res.status}`;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, formData, auth = true, signal } = options;

  const send = async () => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    // En multipart NO fijamos Content-Type: fetch añade el boundary por su cuenta.
    if (body !== undefined && !formData) headers['Content-Type'] = 'application/json';
    const token = auth ? await getValidAccessToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch(buildUrl(path, query), {
        method,
        headers,
        body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
        signal,
      });
      return { res, hadToken: token !== null };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ApiError(0, 'No pudimos conectar con el servidor. Revisa tu conexión.');
    }
  };

  let { res, hadToken } = await send();

  if (res.status === 401 && hadToken && (await refreshSession())) {
    ({ res, hadToken } = await send());
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
