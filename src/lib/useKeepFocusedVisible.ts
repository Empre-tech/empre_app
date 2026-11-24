import { useEffect, useRef, type RefObject } from 'react';
import { Dimensions, Platform, TextInput, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';

/**
 * Que la casilla donde escribes no quede debajo del teclado (2026-11-24). En Android, con la app de borde a borde, la
 * ventana no se achica y el ScrollView no se mueve solo: cuando abre el teclado se mide la casilla enfocada y, si queda
 * tapada, se sube lo justo. Devuelve el onScroll que lleva la cuenta de cuánto se ha bajado.
 */
export function useKeepFocusedVisible(scrollRef: RefObject<ScrollView | null>, kb: number) {
  const offset = useRef(0);
  useEffect(() => {
    if (Platform.OS !== 'android' || kb <= 0) return;
    const t = setTimeout(() => {
      const input = TextInput.State.currentlyFocusedInput() as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
      input?.measureInWindow?.((_x, y, _w, h) => {
        const visibleBottom = Dimensions.get('window').height - kb - 24;
        const over = y + h - visibleBottom;
        if (over > 0) scrollRef.current?.scrollTo({ y: offset.current + over, animated: true });
      });
    }, 60);
    return () => clearTimeout(t);
  }, [kb, scrollRef]);
  return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  };
}
