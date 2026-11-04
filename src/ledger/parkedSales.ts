import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Ventas en espera: lo que el dueño guarda porque el cliente vuelve. Es solo un borrador en este teléfono: no se envía
 * y no cuenta en la caja, en las ventas ni en el inventario hasta que se cobre.
 */
export interface ParkedSale {
  id: string;
  entityId: string;
  at: number;
  label: string;
  total: number;
  qty: Record<string, number>;
  manual: number | null;
  note: string;
}

const FILE = `${FileSystem.documentDirectory ?? ''}ledger-parked-sales.json`;
const EMPTY: ParkedSale[] = [];

let items: ParkedSale[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function set(next: ParkedSale[]) {
  items = next;
  listeners.forEach((l) => l());
  if (FileSystem.documentDirectory) void FileSystem.writeAsStringAsync(FILE, JSON.stringify(next)).catch(() => undefined);
}

async function load() {
  if (loaded) return;
  loaded = true;
  if (!FileSystem.documentDirectory) return;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return;
    const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    if (!Array.isArray(raw)) return;
    const saved = raw.filter((x): x is ParkedSale => !!x && typeof x.id === 'string' && typeof x.entityId === 'string' && typeof x.total === 'number');
    if (saved.length) {
      items = [...items, ...saved.filter((s) => !items.some((x) => x.id === s.id))];
      listeners.forEach((l) => l());
    }
  } catch {
    // Un archivo dañado no debe impedir vender.
  }
}

export function parkSale(sale: ParkedSale) {
  set([...items, sale]);
}

export function removeParkedSale(id: string) {
  set(items.filter((x) => x.id !== id));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const snapshot = () => items;

/** Las ventas en espera de un negocio, de la más vieja a la más nueva. */
export function useParkedSales(entityId: string): ParkedSale[] {
  useEffect(() => {
    void load();
  }, []);
  const all = useSyncExternalStore(subscribe, snapshot, snapshot);
  return all.filter((x) => x.entityId === entityId);
}
