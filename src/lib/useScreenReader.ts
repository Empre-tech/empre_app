import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Si TalkBack o VoiceOver están activos. Lo que avanza solo (la pasarela y las historias de Ofertas, 3.48) no avanza
 * mientras el lector está encendido: la persona decide cuándo pasar.
 */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((v) => {
      if (alive) setOn(v);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}
