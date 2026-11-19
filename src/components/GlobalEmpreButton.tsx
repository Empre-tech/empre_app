import { useGlobalSearchParams, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmpreButton } from '@/components/EmpreButton';
import { useKeyboardOpen } from '@/lib/useKeyboardOpen';

/**
 * El botón Empre en las demás vistas (tablero «Base y Empre Pro»: «en todas las vistas»). Las pestañas y el Inventario
 * ya lo traen en su barra; aquí flota en las pantallas que no tienen una barra propia abajo. Queda fuera de los pasos
 * de una tarea (formularios, contar, pagar), del chat, del mapa y de las pantallas con su propia barra o botón abajo
 * (Empre Finance anota con sus propios botones: un rol por lugar), y se esconde mientras escribes. En la pantalla de un negocio tuyo, los atajos van directo a ese negocio.
 */
const ROUTES: Record<string, 'id' | 'entityId' | null> = {
  // Del negocio (el id es del negocio; si no es tuyo, el botón muestra el menú de siempre).
  'business/hub/[id]': 'id',
  'business/activity/[id]': 'id',
  'business/reviews/[id]': 'id',
  'business/photos/[id]': 'id',
  'business/services/[id]': 'id',
  'business/agent/[id]': 'id',
  'business/offers': 'entityId',
  // De quien compra.
  favorites: null,
  salidas: null,
  appointments: null,
  claims: null,
  novedades: null,
  categories: null,
  cerca: null,
};

export function GlobalEmpreButton() {
  const segments = useSegments() as string[];
  const params = useGlobalSearchParams<{ id?: string; entityId?: string }>();
  const insets = useSafeAreaInsets();
  const typing = useKeyboardOpen();
  const route = segments.join('/');
  if (typing || !(route in ROUTES)) return null;
  const key = ROUTES[route];
  const raw = key ? params[key] : undefined;
  const entityId = typeof raw === 'string' && raw ? raw : undefined;
  return <EmpreButton key={route} bottom={insets.bottom + 16} entityId={entityId} />;
}
