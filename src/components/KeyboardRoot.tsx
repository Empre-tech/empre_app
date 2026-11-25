import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';

/**
 * Toda la app sube con el teclado en Android (2026-11-25). De borde a borde, Android ya no achica la ventana al abrir el
 * teclado y las casillas quedaban tapadas pantalla por pantalla. Aquí se le resta a la app el alto del teclado, como
 * hacía Android antes: las listas se achican y llevan solas la casilla enfocada a la vista. En iOS no hace nada (allí
 * cada pantalla usa KeyboardAvoidingView). Las hojas en Modal van en otra ventana y usan KeyboardSheet.
 */
export function KeyboardRoot({ children }: { children: ReactNode }) {
  const kb = useKeyboardHeight();
  return <View style={{ flex: 1, paddingBottom: kb }}>{children}</View>;
}
