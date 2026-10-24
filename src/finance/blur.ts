import { createContext, useContext, type ComponentType, type RefObject } from 'react';
import { Platform, type View, type ViewProps } from 'react-native';

// Lo que Finance sabe del desenfoque (3.46 F3), aparte de FinanceHost para no crear un ciclo de imports
// (FinanceHost → FinanceOverlay → Glass). expo-blur es un módulo nativo: en una app compilada sin él no se carga.

const hasNativeBlur = Boolean((globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules?.ExpoBlur);

export type BlurTargetProps = ViewProps & { ref?: RefObject<View | null> };

/** El envoltorio que Android necesita para desenfocar lo de atrás (null si no hay módulo o no es Android). */
export let BlurTargetView: ComponentType<BlurTargetProps> | null = null;
if (Platform.OS === 'android' && hasNativeBlur) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- carga opcional de un módulo nativo
    BlurTargetView = (require('expo-blur') as { BlurTargetView: ComponentType<BlurTargetProps> }).BlurTargetView;
  } catch {
    BlurTargetView = null;
  }
}

/** ¿Este teléfono puede desenfocar de verdad? iPhone con expo-blur, o Android 12+ con la app envuelta en el destino. */
export const canBlur = hasNativeBlur && (Platform.OS === 'ios' || (BlurTargetView !== null && Number(Platform.Version) >= 31));

export const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

/** El destino que desenfoca el vidrio en Android (null en iPhone, que no lo necesita). */
export function useBlurTarget(): RefObject<View | null> | null {
  return useContext(BlurTargetContext);
}
