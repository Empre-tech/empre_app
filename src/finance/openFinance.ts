import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

// Una sola bandeja de Empre Finance a la vez: el doble toque, el enlace y el acceso rápido pueden coincidir, y abrir
// dos encima la una de la otra sería un error. La pantalla marca cuándo está montada.
let open = false;

export function markFinanceOpen(value: boolean) {
  open = value;
}

export function isFinanceOpen(): boolean {
  return open;
}

/** Abre la bandeja (con el negocio, si se conoce). No hace nada si ya está abierta. */
export function openFinance(router: Router, entityId?: string) {
  if (open) return;
  open = true; // antes de que monte, para que un segundo intento inmediato no apile otra
  router.push({ pathname: '/finance', params: entityId ? { entity: entityId } : {} });
}
