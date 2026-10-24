// Vibración corta para confirmar lo importante (plan de experiencia, fase 0): reclamo hecho, canje válido o rechazado.
// Nada en la navegación normal. `expo-haptics` es un módulo nativo: en una app compilada antes de agregarlo no existe, así
// que se carga con cuidado y, si falta, no hace nada (no rompe la app). Funciona al compilar la app de nuevo.

type HapticsModule = typeof import('expo-haptics');

let mod: HapticsModule | null | undefined;

function load(): HapticsModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga opcional de un módulo nativo
    mod = require('expo-haptics') as HapticsModule;
  } catch {
    mod = null;
  }
  return mod;
}

function notify(kind: 'Success' | 'Warning' | 'Error'): void {
  const h = load();
  if (!h) return;
  try {
    void h.notificationAsync(h.NotificationFeedbackType[kind]).catch(() => undefined);
  } catch {
    // Sin motor de vibración o módulo incompleto: se sigue sin vibrar.
  }
}

/** Un toque leve: el doble toque que abre Empre Finance o un registro confirmado al mantener pulsado. */
export function hapticTap(): void {
  const h = load();
  if (!h) return;
  try {
    void h.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => undefined);
  } catch {
    // sin vibración
  }
}

/** Algo salió bien y es importante (reclamo hecho, canje válido). */
export const hapticSuccess = () => notify('Success');
/** Atención: no salió, pero se puede resolver (por ejemplo, un código vencido). */
export const hapticWarning = () => notify('Warning');
/** No salió (reclamo rechazado, canje inválido). */
export const hapticError = () => notify('Error');
