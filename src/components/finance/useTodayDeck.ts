import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ledgerApi } from '@/api/ledger';
import { expenseMovement, saleMovement } from '@/components/finance/Moves';
import { addDays, todayCO } from '@/lib/finance';
import { expenseEntries, saleEntries, type DeckEntry } from '@/lib/methodDeck';

const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;

/** Las ventas y los gastos de hoy, puestos cada uno en su medio de pago. */
export function useTodayDeck(entityId: string) {
  const today = todayCO();
  const from = startCO(today);
  const to = startCO(addDays(today, 1));
  const sales = useQuery({ queryKey: ['ledger', entityId, 'sales', 'deck', today], queryFn: () => ledgerApi.sales(entityId, { from, to, limit: 200 }), enabled: Boolean(entityId), staleTime: 30_000 });
  const expenses = useQuery({ queryKey: ['ledger', entityId, 'expenses', 'deck', today], queryFn: () => ledgerApi.expenses(entityId, { from, to, limit: 200 }), enabled: Boolean(entityId), staleTime: 30_000 });
  const entries = useMemo<DeckEntry[]>(
    () => [
      ...(sales.data ?? []).flatMap((s) => {
        const title = saleMovement(s).title;
        return saleEntries(s, title, s.party?.name ? `${s.party.name} · ${title}` : title);
      }),
      ...(expenses.data ?? []).flatMap((e) => expenseEntries(e, expenseMovement(e).title)),
    ],
    [sales.data, expenses.data],
  );
  return { entries, loading: sales.isLoading || expenses.isLoading, failed: sales.isError || expenses.isError };
}
