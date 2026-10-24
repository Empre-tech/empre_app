import { useEffect } from 'react';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { useAuth } from '@/auth/AuthContext';

/**
 * Acceso rápido del ícono de Empre (mantener pulsado → «Empre Finance»). Lleva a `/finance`, la misma bandeja del doble
 * toque y del enlace empre://finance. Sin sesión no se ofrece. En una app compilada antes de agregar el módulo nativo,
 * `setItems` y el enrutado no hacen nada (el paquete ya lo contempla): funciona al compilar de nuevo.
 */
export function useFinanceQuickAction() {
  const { status } = useAuth();
  useQuickActionRouting();
  useEffect(() => {
    const items =
      status === 'signedIn'
        ? [{ id: 'finance', title: 'Empre Finance', subtitle: 'Registrar venta o gasto', icon: 'symbol:dollarsign.circle', params: { href: '/finance' } }]
        : [];
    void QuickActions.setItems(items).catch(() => undefined);
  }, [status]);
}
