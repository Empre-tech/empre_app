import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Cover } from '@/components/Cover';
import { displayIcon } from '@/lib/mapView';
import type { ParaTiPick } from '@/lib/paraTi';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export interface ParaTiSlide {
  pick: ParaTiPick;
  photo?: string | null;
  category?: string | null;
  icon?: string | null;
  onOpen: () => void;
}

const STEP_MS = 5000;

/**
 * «Para ti» (3.59): una tarjeta grande que rota cada 5 s, con portada animada según el tipo de negocio. Cada una dice
 * por qué sale, lo que ofrece y su prueba, y un solo botón que lleva directo a lo importante. Con «Reducir movimiento»
 * no rota sola; siempre se puede pasar con el botón.
 */
export function ParaTiCarousel({ slides }: { slides: ParaTiSlide[] }) {
  const reduce = useReduceMotion();
  const [i, setI] = useState(0);
  const [fade] = useState(() => new Animated.Value(1));
  const [progress] = useState(() => new Animated.Value(0));
  const n = slides.length;
  const cur = n ? i % n : 0;

  useEffect(() => {
    fade.setValue(reduce ? 1 : 0);
    if (!reduce) Animated.timing(fade, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (n < 2 || reduce) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const run = Animated.timing(progress, { toValue: 1, duration: STEP_MS, easing: Easing.linear, useNativeDriver: false });
    run.start(({ finished }) => {
      if (finished) setI((x) => x + 1);
    });
    return () => run.stop();
  }, [cur, n, reduce, fade, progress]);

  if (!n) return null;
  const s = slides[cur];
  const c = s.pick.candidate;
  const isOffer = c.kind === 'offer';
  return (
    <View accessibilityLabel="Recomendado para ti" style={styles.card}>
      <Cover photo={s.photo} category={s.category} icon={s.icon} iconName={displayIcon(s.icon ?? '') as IconName} iconSize={72} style={StyleSheet.absoluteFill} />
      <View style={styles.scrim} />
      {n > 1 ? (
        <View style={styles.bars} accessible={false}>
          {slides.map((x, k) => (
            <View key={x.pick.candidate.key} style={styles.bar}>
              <Animated.View style={[styles.barFill, { width: k < cur ? '100%' : k > cur ? '0%' : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            </View>
          ))}
        </View>
      ) : null}
      {n > 1 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Siguiente recomendación" hitSlop={4} onPress={() => setI((x) => x + 1)} style={styles.next}>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}
      <Animated.View style={[styles.body, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]} accessibilityLiveRegion="polite">
        <View style={styles.whyRow}>
          {isOffer ? (
            <View style={styles.offerChip}>
              <Text style={styles.offerChipText}>Oferta</Text>
            </View>
          ) : null}
          <Text style={styles.why} numberOfLines={1}>
            {s.pick.why}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {c.title}
        </Text>
        <Text style={styles.proof} numberOfLines={1}>
          {s.pick.proof}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${s.pick.cta}: ${c.title}, ${c.entityName}`} onPress={s.onOpen} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
          <Text style={styles.ctaText}>{s.pick.cta}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.ink} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { height: 236, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.ink, justifyContent: 'flex-end' },
  // La foto o la portada van debajo; esta capa asegura que el texto blanco se lea encima.
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 170, backgroundColor: 'rgba(14,35,70,0.55)' },
  bars: { position: 'absolute', left: 18, top: 20, flexDirection: 'row', gap: 5 },
  bar: { width: 22, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.35)' },
  barFill: { height: '100%', backgroundColor: '#FFFFFF' },
  next: { position: 'absolute', right: 10, top: 6, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  body: { paddingHorizontal: 18, paddingBottom: 16, gap: 6 },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offerChip: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.accent },
  offerChipText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  why: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: 'rgba(255,255,255,0.92)' },
  title: { fontSize: 22, lineHeight: 25, fontFamily: fonts.display.bold, color: '#FFFFFF' },
  proof: { fontSize: 13, fontFamily: fonts.ui.bold, color: 'rgba(255,255,255,0.9)' },
  cta: { alignSelf: 'flex-start', marginTop: 4, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#FFFFFF' },
  ctaText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
