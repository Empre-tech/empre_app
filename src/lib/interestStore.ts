import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

import type { ArtKey } from '@/components/CategoryArt';
import { addSignal, type Signal, type SignalKind } from './interests.ts';

// Lo que te interesa, solo en este teléfono (interests.json): nunca se envía. Se borra con clearInterests().
const FILE = `${FileSystem.documentDirectory ?? ''}interests.json`;
const KINDS: SignalKind[] = ['search', 'category', 'view', 'offer', 'contact', 'directions', 'booking', 'follow'];

let cache: Signal[] | null = null;
let loading: Promise<Signal[]> | null = null;
const listeners = new Set<(s: Signal[]) => void>();

function valid(x: unknown): x is Signal {
  const s = x as Partial<Signal> | null;
  return !!s && typeof s.art === 'string' && typeof s.at === 'number' && KINDS.includes(s.kind as SignalKind);
}

export function loadSignals(): Promise<Signal[]> {
  if (cache) return Promise.resolve(cache);
  if (loading) return loading;
  loading = (async () => {
    let list: Signal[] = [];
    if (FileSystem.documentDirectory) {
      try {
        const info = await FileSystem.getInfoAsync(FILE);
        if (info.exists) {
          const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(FILE));
          if (Array.isArray(raw)) list = raw.filter(valid);
        }
      } catch {
        list = [];
      }
    }
    cache = list;
    return list;
  })();
  return loading;
}

function save(list: Signal[]) {
  cache = list;
  listeners.forEach((l) => l(list));
  if (FileSystem.documentDirectory) void FileSystem.writeAsStringAsync(FILE, JSON.stringify(list)).catch(() => undefined);
}

/** Anota una señal (sin tipo de negocio reconocible, no se anota). Nunca lanza ni espera. */
export function noteInterest(kind: SignalKind, art: ArtKey | null | undefined, entityId?: string): void {
  if (!art) return;
  void loadSignals().then((list) => save(addSignal(list, { kind, art, at: Date.now(), ...(entityId ? { entityId } : {}) })));
}

/** Olvida todo lo anotado. */
export async function clearInterests(): Promise<void> {
  await loadSignals();
  save([]);
}

/** Las señales, y se actualizan solas cuando se anota algo nuevo. */
export function useInterestSignals(): Signal[] {
  const [list, setList] = useState<Signal[]>(() => cache ?? []);
  useEffect(() => {
    let alive = true;
    void loadSignals().then((l) => alive && setList(l));
    listeners.add(setList);
    return () => {
      alive = false;
      listeners.delete(setList);
    };
  }, []);
  return list;
}
