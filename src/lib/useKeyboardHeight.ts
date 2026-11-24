import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * El alto del teclado en Android (2026-11-24). Con la app de borde a borde, Android ya no achica la ventana al abrir el
 * teclado y las hojas de abajo quedaban tapadas; con este alto se les suma margen. En iOS devuelve 0 (ahí lo resuelve
 * KeyboardAvoidingView con padding).
 */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}
