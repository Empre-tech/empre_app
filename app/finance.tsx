import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { requestFinance } from '@/finance/FinanceHost';
import type { FinanceParams } from '@/finance/FinanceOverlay';

/**
 * empre://finance (y el acceso rápido del ícono). La bandeja es una capa sobre la app (FinanceHost), no esta pantalla:
 * aquí solo se abre y se vuelve atrás, así queda debajo lo que hubiera (o Explorar, si la app se abrió en frío).
 */
export default function FinanceLink() {
  const params = useLocalSearchParams<FinanceParams>();
  const router = useRouter();
  useEffect(() => {
    requestFinance({ ...params });
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
    // Solo al llegar al enlace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
