import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { TokenPair } from '@/api/types';

const KEY = 'empre.tokens';

// SecureStore no existe en web: ahí usamos localStorage (solo para desarrollo).
async function read(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}

async function write(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(KEY, value);
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

async function remove(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

export async function loadTokens(): Promise<TokenPair | null> {
  try {
    const raw = await read();
    return raw ? (JSON.parse(raw) as TokenPair) : null;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  try {
    await write(JSON.stringify(tokens));
  } catch {
    // si el almacenamiento falla, la sesión vive solo en memoria
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await remove();
  } catch {
    // ignorar
  }
}
