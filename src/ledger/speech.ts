/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Dictado con el reconocedor de voz del teléfono (expo-speech-recognition). Se carga de forma opcional: si el módulo
 * nativo no está en el build instalado, `speechAvailable()` devuelve false y la hoja de dictado funciona igual con el
 * micrófono del teclado. El audio nunca sale del teléfono hacia Empre: el servidor solo recibe el TEXTO.
 */

let mod: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-speech-recognition');
} catch {
  mod = null;
}

const native = () => mod?.ExpoSpeechRecognitionModule as any;

export function speechAvailable(): boolean {
  try {
    return Boolean(native());
  } catch {
    return false;
  }
}

export interface DictationHandlers {
  /** Texto reconocido hasta ahora (parcial mientras habla, final al terminar). */
  onText: (text: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
  /** Volumen de la voz, de -2 (silencio) a 10, unas 8 veces por segundo. Opcional (la voz de Finance lo usa). */
  onVolume?: (value: number) => void;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Empre no tiene permiso para usar el micrófono. Actívalo en los ajustes del teléfono.',
  'service-not-allowed': 'El reconocimiento de voz no está disponible en este teléfono.',
  'no-speech': 'No se escuchó nada. Inténtalo de nuevo.',
  'speech-timeout': 'No se escuchó nada. Inténtalo de nuevo.',
  network: 'El reconocimiento de voz necesita conexión en este teléfono.',
  'language-not-supported': 'Tu teléfono no tiene reconocimiento de voz en español. Escribe lo que quieres registrar.',
};

/** Empieza a escuchar. Devuelve una función para detener (y limpiar). null si no se pudo empezar. */
export async function startDictation(handlers: DictationHandlers, hints: string[] = []): Promise<(() => void) | null> {
  const m = native();
  if (!m) {
    handlers.onError('Este teléfono no tiene dictado en Empre todavía. Escribe lo que quieres registrar.');
    return null;
  }
  try {
    const perm = await m.requestPermissionsAsync();
    if (!perm?.granted) {
      handlers.onError(ERRORS['not-allowed']);
      return null;
    }
  } catch {
    handlers.onError(ERRORS['not-allowed']);
    return null;
  }

  const subs: { remove: () => void }[] = [];
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    subs.forEach((s) => s.remove());
  };

  subs.push(
    m.addListener('result', (e: any) => {
      const t = e?.results?.[0]?.transcript;
      if (typeof t === 'string') handlers.onText(t, Boolean(e?.isFinal));
    }),
    m.addListener('error', (e: any) => {
      handlers.onError(ERRORS[e?.error as string] ?? 'No pudimos escucharte. Escribe lo que quieres registrar.');
    }),
    m.addListener('end', () => {
      cleanup();
      handlers.onEnd();
    }),
  );
  if (handlers.onVolume) {
    const onVolume = handlers.onVolume;
    subs.push(m.addListener('volumechange', (e: any) => typeof e?.value === 'number' && onVolume(e.value)));
  }

  try {
    m.start({
      lang: 'es-CO',
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
      // Los nombres del negocio ayudan al reconocedor a acertar «empanada» o «Don Jorge».
      contextualStrings: hints.slice(0, 80),
      ...(handlers.onVolume ? { volumeChangeEventOptions: { enabled: true, intervalMillis: 120 } } : {}),
    });
  } catch {
    cleanup();
    handlers.onError('No pudimos activar el micrófono. Escribe lo que quieres registrar.');
    return null;
  }
  return () => {
    try {
      m.stop();
    } catch {
      // ya había terminado
    }
  };
}
