import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Lo que el dueño cuenta al empezar en Empre Finance: la caja de hoy, lo que se debía de antes y lo que paga cada mes.
 * Vive en este teléfono: son notas suyas, no ventas ni gastos, y no entran en lo que calcula el servidor.
 */
export interface OpeningDebt {
  id: string;
  kind: 'customer' | 'supplier';
  name: string;
  amount: number;
  phone: string;
  at: string;
}

export interface FinanceSetup {
  /** Ya pasó por las preguntas, las haya contestado o no. */
  done: boolean;
  cash: number | null;
  monthly: number | null;
  debts: OpeningDebt[];
}

const FILE = `${FileSystem.documentDirectory ?? ''}finance-setup.json`;
const EMPTY: FinanceSetup = { done: false, cash: null, monthly: null, debts: [] };

let byEntity: Record<string, FinanceSetup> = {};
let loaded = false;
const listeners = new Set<() => void>();

function publish(next: Record<string, FinanceSetup>) {
  byEntity = next;
  listeners.forEach((l) => l());
}

async function load() {
  if (loaded) return;
  loaded = true;
  if (!FileSystem.documentDirectory) return;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return;
    const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    if (raw && typeof raw === 'object') publish({ ...(raw as Record<string, FinanceSetup>), ...byEntity });
  } catch {
    // Un archivo dañado no debe impedir usar Finanzas.
  }
}

export function saveFinanceSetup(entityId: string, patch: Partial<FinanceSetup>) {
  const next = { ...byEntity, [entityId]: { ...EMPTY, ...byEntity[entityId], ...patch } };
  publish(next);
  if (FileSystem.documentDirectory) void FileSystem.writeAsStringAsync(FILE, JSON.stringify(next)).catch(() => undefined);
}

export function addOpeningDebt(entityId: string, debt: Omit<OpeningDebt, 'id' | 'at'>) {
  const cur = byEntity[entityId] ?? EMPTY;
  saveFinanceSetup(entityId, { debts: [...cur.debts, { ...debt, id: `local:${Date.now()}`, at: new Date().toISOString() }] });
}

/** Baja lo que se debe; si queda en cero, la nota desaparece. */
export function reduceOpeningDebt(entityId: string, id: string, paid: number) {
  const cur = byEntity[entityId] ?? EMPTY;
  saveFinanceSetup(entityId, { debts: cur.debts.map((d) => (d.id === id ? { ...d, amount: d.amount - paid } : d)).filter((d) => d.amount > 0) });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useFinanceSetup(entityId: string): FinanceSetup {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(subscribe, () => byEntity[entityId] ?? EMPTY);
}
