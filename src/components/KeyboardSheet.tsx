import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';

/**
 * El contenedor de una hoja de abajo con casillas (2026-11-24): en iOS sube con el teclado (padding) y en Android,
 * donde la app va de borde a borde y la ventana ya no se achica, se le suma el alto del teclado para que no tape nada.
 */
export function KeyboardSheet({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const kb = useKeyboardHeight();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[style, kb ? { paddingBottom: kb } : null]}>
      {children}
    </KeyboardAvoidingView>
  );
}
