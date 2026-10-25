import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { ApiError } from '@/api/client';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi } from '@/api/ledger';
import { useAuth } from '@/auth/AuthContext';
import { barHeights, colombiaDay, usualExpenseItems, weekBars, type DayBar } from '@/lib/finance';
import { categoryLabel, pendingTotals } from '@/lib/ledger';
import { useLedgerOutbox } from '@/ledger/ledgerStore';

// Datos de Empre Finance (3.45, 3.51). Las claves de caché son las mismas de «Mi negocio» donde coinciden, así lo que
// se ve aquí y allá es lo mismo y un registro refresca ambos. Cuatro consultas pequeñas: el resumen del día, el de la
// semana (que ya trae lo de cada día para las barras), el catálogo y los gastos de siempre (ya agrupados). Al
// registrar, la cola recarga solo las que cambian (`invalidationScopes`).

const KEY = 'empre.finance.entity';

async function readLast(): Promise<string | null> {
  try {
    return Platform.OS === 'web' ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

function writeLast(id: string) {
  try {
    if (Platform.OS === 'web') localStorage.setItem(KEY, id);
    else void SecureStore.setItemAsync(KEY, id).catch(() => undefined);
  } catch {
    // sin memoria del último negocio: se elige el primero
  }
}

/** Qué negocio registra: el del enlace, o el último elegido, o el primero. Se recuerda el elegido. */
export function useFinanceBusiness(param?: string) {
  const { status } = useAuth();
  const mine = useQuery({ queryKey: ['my-entities'], queryFn: entitiesApi.mine, enabled: status === 'signedIn' });
  const [last, setLast] = useState<string | null | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(param ?? null);
  useEffect(() => {
    void readLast().then(setLast);
  }, []);
  const list = useMemo(() => mine.data ?? [], [mine.data]);
  const wanted = picked ?? last ?? null;
  const entity = list.find((e) => e.id === wanted) ?? list[0] ?? null;
  const choose = (id: string) => {
    setPicked(id);
    writeLast(id);
  };
  const loading = status === 'loading' || (status === 'signedIn' && (mine.isLoading || last === undefined));
  return { signedIn: status === 'signedIn', loading, error: mine.isError && !mine.data, list, entity, choose, retry: () => void mine.refetch() };
}

export interface KnownItem {
  key: string;
  name: string;
  price: number;
  itemId?: string;
  category?: string;
}

export function useFinanceData(entityId: string) {
  const on = Boolean(entityId);
  const outbox = useLedgerOutbox();
  const pending = pendingTotals(outbox.items, entityId);

  const day = useQuery({ queryKey: ['ledger', entityId, 'summary', 'day'], queryFn: () => ledgerApi.summary(entityId, 'day'), enabled: on, staleTime: 15_000 });
  const week = useQuery({ queryKey: ['ledger', entityId, 'summary', 'week'], queryFn: () => ledgerApi.summary(entityId, 'week'), enabled: on, staleTime: 60_000 });
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: on, staleTime: 60_000 });
  const usual = useQuery({ queryKey: ['ledger', entityId, 'usual-expenses'], queryFn: () => ledgerApi.usualExpenses(entityId), enabled: on, staleTime: 5 * 60_000 });

  const sum = day.data;
  const sold = (sum?.sales_total ?? 0) + pending.sales;
  const spent = (sum?.expenses_total ?? 0) + pending.expenses;
  const prevNet = sum ? sum.prev_sales_total - sum.prev_expenses_total : 0;
  const net = sold - spent;
  const changePct = sum && prevNet > 0 ? Math.round(((net - prevNet) / prevNet) * 100) : null;

  const pendingNet = pending.sales - pending.expenses;
  const days = week.data?.days;
  const bars: DayBar[] = useMemo(() => (days ? weekBars(days, colombiaDay(), pendingNet) : []), [days, pendingNet]);
  const heights = useMemo(() => barHeights(bars), [bars]);

  // Servicios del catálogo con precio, primero los más vendidos.
  const services: KnownItem[] = useMemo(() => {
    const top = (sum?.top_items ?? []).map((t) => t.name.toLocaleLowerCase('es'));
    const rank = (name: string) => {
      const i = top.indexOf(name.toLocaleLowerCase('es'));
      return i < 0 ? 999 : i;
    };
    return (items.data ?? [])
      .filter((i) => i.price !== null && i.price > 0)
      .sort((a, b) => rank(a.name) - rank(b.name))
      .map((i) => ({ key: `item:${i.id}`, name: i.name, price: i.price ?? 0, itemId: i.id }));
  }, [items.data, sum?.top_items]);

  const usualExpenses: KnownItem[] = useMemo(
    () => usualExpenseItems(usual.data ?? [], categoryLabel).map((f) => ({ key: `exp:${f.key}`, name: f.name, price: f.amount, category: f.category })),
    [usual.data],
  );

  const refresh = () => {
    void day.refetch();
    void week.refetch();
  };

  // Sin señal (status 0) no es lo mismo que un servidor que no responde la ruta: el aviso dice cuál es.
  const offline = day.error instanceof ApiError && day.error.status === 0;
  return {
    loading: day.isLoading,
    failed: day.isError && !sum,
    stale: day.isError && Boolean(sum),
    problem: !day.isError ? null : offline ? ('offline' as const) : ('server' as const),
    sold,
    spent,
    net,
    changePct,
    salesCount: sum?.sales_count ?? 0,
    receivable: sum?.receivable ?? 0,
    pendingCount: pending.count,
    failedCount: pending.failed,
    bars,
    heights,
    services,
    usualExpenses,
    hints: (items.data ?? []).map((i) => i.name),
    refresh,
  };
}
