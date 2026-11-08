import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { canLeave, dayKey, fullWelcomeToday } from '@/lib/finderWelcome';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

const FILE = `${FileSystem.documentDirectory ?? ''}finder-welcome.json`;

async function readLastShown(): Promise<string | null> {
  if (!FileSystem.documentDirectory) return null;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return null;
    const raw: unknown = JSON.parse(await FileSystem.readAsStringAsync(FILE));
    return typeof raw === 'string' ? raw : null;
  } catch {
    return null;
  }
}

function saveShown(now: Date) {
  if (FileSystem.documentDirectory) void FileSystem.writeAsStringAsync(FILE, JSON.stringify(dayKey(now))).catch(() => undefined);
}

/** Una onda verde azulado que sale desde ti, una y otra vez. */
function Wave({ delay, active }: { delay: number; active: boolean }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [v, delay, active]);
  if (!active) return null;
  return <Animated.View style={[styles.wave, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 3] }) }] }]} />;
}

/**
 * Bienvenida a Empre Finder (3.60) mientras llega el mapa, en lugar de una pantalla en blanco con un spinner. La primera
 * vez de cada día sale completa (logo, «Bienvenido a Empre Finder», qué se está buscando y lo que ya se sabe) y dura al
 * menos 1,5 s; las demás veces solo el logo. Cuando el mapa está listo, el logo se encoge sobre tu punto (el mapa
 * arranca centrado en ti) y la capa se desvanece. Con «Reducir movimiento» no hay ondas ni vuelo: solo un fundido.
 */
export function FinderWelcome({ ready, zoneName, openLine, onDone }: { ready: boolean; zoneName: string | null; openLine: string | null; onDone: () => void }) {
  const reduce = useReduceMotion();
  const [full, setFull] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [veil] = useState(() => new Animated.Value(1));
  const [logo] = useState(() => new Animated.Value(0));
  const [text] = useState(() => new Animated.Value(0));
  const [started] = useState(() => Date.now());

  useEffect(() => {
    void readLastShown().then((last) => {
      const now = new Date();
      const isFull = fullWelcomeToday(last, now);
      setFull(isFull);
      if (isFull) saveShown(now);
    });
  }, []);

  useEffect(() => {
    if (full === null) return;
    Animated.spring(logo, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
    if (full) Animated.timing(text, { toValue: 1, duration: 420, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [full, logo, text]);

  // Cada 150 ms revisa si ya puede irse: mapa listo y mínimo cumplido, o espera agotada aunque el mapa no llegue.
  const readyRef = useRef(ready);
  const leavingRef = useRef(false);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  useEffect(() => {
    if (full === null) return;
    const id = setInterval(() => {
      if (leavingRef.current || !canLeave({ ready: readyRef.current, elapsedMs: Date.now() - started, full })) return;
      leavingRef.current = true;
      setLeaving(true);
      const out = reduce
        ? Animated.timing(veil, { toValue: 0, duration: 200, useNativeDriver: true })
        : Animated.parallel([
            Animated.timing(logo, { toValue: 2, duration: 560, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
            Animated.timing(veil, { toValue: 0, duration: 420, delay: 140, useNativeDriver: true }),
          ]);
      out.start(() => onDone());
    }, 150);
    return () => clearInterval(id);
  }, [full, reduce, logo, veil, onDone, started]);

  const logoStyle = {
    opacity: logo.interpolate({ inputRange: [0, 0.4, 1, 1.7, 2], outputRange: [0, 1, 1, 1, 0] }),
    transform: [{ scale: logo.interpolate({ inputRange: [0, 1, 2], outputRange: [0.7, 1, 0.14] }) }],
  };
  const rise = { opacity: text, transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] };

  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      accessible
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={full ? `Bienvenido a Empre Finder. Buscando lo abierto${zoneName ? ` en ${zoneName}` : ' cerca de ti'}` : 'Cargando el mapa'}
      style={[StyleSheet.absoluteFill, styles.veil, { opacity: veil }]}
    >
      <View style={styles.center}>
        <Wave delay={0} active={!reduce && !leaving} />
        <Wave delay={800} active={!reduce && !leaving} />
        <Wave delay={1600} active={!reduce && !leaving} />
        <Animated.View style={logoStyle}>
          <EmpreSymbol product="finder" size={104} animated={false} />
        </Animated.View>
      </View>
      {full ? (
        <Animated.View style={[styles.copy, rise]}>
          <Text style={styles.hello}>Bienvenido a</Text>
          <Text style={styles.brand}>
            Empre <Text style={{ color: colors.primary }}>Finder</Text>
          </Text>
          <Text style={styles.sub}>Buscando lo abierto {zoneName ? `en ${zoneName}` : 'cerca de ti'}…</Text>
          {openLine ? (
            <View style={styles.fact}>
              <View style={styles.dot} />
              <Text style={styles.factText}>{openLine}</Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: { zIndex: 50, backgroundColor: 'rgba(244,247,251,0.92)', alignItems: 'center', justifyContent: 'center' },
  // El logo queda en el centro del mapa, que es donde está tu punto al arrancar.
  center: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  wave: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: 'rgba(20,184,176,0.55)' },
  copy: { position: 'absolute', left: 24, right: 24, top: '58%', alignItems: 'center', gap: 4 },
  hello: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.muted },
  brand: { fontSize: 34, lineHeight: 38, fontFamily: fonts.display.bold, color: colors.ink, letterSpacing: -0.6 },
  sub: { marginTop: 6, fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted, textAlign: 'center' },
  fact: { marginTop: 12, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface, ...softShadow },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#14B8B0' },
  factText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.verified },
});
