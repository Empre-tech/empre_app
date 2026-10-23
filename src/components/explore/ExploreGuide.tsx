import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { GUIDE_STEPS, nextGuideStep } from '@/lib/exploreGuide';
import { alpha, colors, fonts, radius, shadow, spacing } from '@/theme';

export interface GuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  step: number;
  /** Dónde está lo que señala cada paso (en puntos del área del mapa). */
  rects: (GuideRect | null)[];
  size: { width: number; height: number };
  onStep: (next: number | null) => void;
}

const SHADE = alpha(colors.night, 0.62);
const PAD = 6;

/**
 * Guía de la primera vez (3.23): oscurece todo menos lo que explica cada paso (la franja de arriba, la zona marcada y la
 * leyenda) y muestra una tarjeta con «Saltar» y «Siguiente». El lector de pantalla lee cada paso.
 */
export function ExploreGuide({ step, rects, size, onStep }: Props) {
  const s = GUIDE_STEPS[step];
  useEffect(() => {
    if (s) AccessibilityInfo.announceForAccessibility(`${s.title}. ${s.text}`);
  }, [s]);
  if (!s) return null;
  const r = rects[step] ?? { x: spacing.lg, y: size.height / 3, width: size.width - spacing.lg * 2, height: 60 };
  const hole = {
    x: Math.max(0, r.x - PAD),
    y: Math.max(0, r.y - PAD),
    width: Math.min(size.width, r.width + PAD * 2),
    height: r.height + PAD * 2,
  };
  const below = hole.y + hole.height + 12;
  const tipTop = below + 190 < size.height ? below : Math.max(spacing.xl, hole.y - 200);
  const last = step === GUIDE_STEPS.length - 1;

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      {/* Cuatro bandas oscuras alrededor del hueco. */}
      <View style={[styles.shade, { left: 0, right: 0, top: 0, height: hole.y }]} />
      <View style={[styles.shade, { left: 0, right: 0, top: hole.y + hole.height, bottom: 0 }]} />
      <View style={[styles.shade, { left: 0, width: hole.x, top: hole.y, height: hole.height }]} />
      <View style={[styles.shade, { left: hole.x + hole.width, right: 0, top: hole.y, height: hole.height }]} />
      <View pointerEvents="none" style={[styles.ring, { left: hole.x, top: hole.y, width: hole.width, height: hole.height }]} />

      <View style={[styles.tip, { top: tipTop }]} accessibilityRole="summary">
        <Text style={styles.title}>{s.title}</Text>
        <Text style={styles.text}>{s.text}</Text>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => onStep(nextGuideStep(step, 'skip'))} style={styles.skip}>
            <Text style={styles.skipText}>Saltar</Text>
          </Pressable>
          <Text style={styles.count}>
            {step + 1} de {GUIDE_STEPS.length}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => onStep(nextGuideStep(step, 'next'))} style={({ pressed }) => [styles.next, pressed && { opacity: 0.85 }]}>
            <Text style={styles.nextText}>{last ? 'Listo' : 'Siguiente'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { position: 'absolute', backgroundColor: SHADE },
  ring: { position: 'absolute', borderRadius: radius.lg, borderWidth: 2, borderColor: colors.white },
  tip: { position: 'absolute', left: spacing.lg, right: spacing.lg, padding: spacing.lg, gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  title: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  text: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  skip: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  skipText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.muted },
  count: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  next: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.primary, justifyContent: 'center' },
  nextText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.white },
});
