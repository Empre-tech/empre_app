import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { entitiesApi } from '@/api/endpoints';
import { growthPhase, growthView, type GrowthTarget } from '@/lib/growth';
import { loadCelebrated, saveCelebrated } from '@/lib/growthStore';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius, spacing } from '@/theme';

const GOODBYE_AFTER = 1400; // ms que se ve «¡Listo!» antes de que la lista se vaya

/**
 * «Haz que tu negocio destaque» (3.40, mockup vitrina_viva.html): lo que le falta al negocio, agrupado por lo que logra,
 * cada punto con lo que de verdad cambia y un botón directo. Al completarlo, se despide una vez y desaparece; vuelve
 * solo si falta algo permanente. Completar no sube a nadie en el orden.
 */
export function GrowthCard({ entityId, onGo }: { entityId: string; onGo: (target: GrowthTarget) => void }) {
  const reduce = useReduceMotion();
  const q = useQuery({ queryKey: ['completeness', entityId], queryFn: () => entitiesApi.completeness(entityId), staleTime: 0 });
  // Al volver de editar, de subir fotos o de publicar, se recalcula.
  useFocusEffect(
    useCallback(() => {
      void q.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al enfocar
    }, []),
  );
  const [expanded, setExpanded] = useState(false);
  const [celebrated, setCelebrated] = useState<Set<string> | null>(null);
  useEffect(() => {
    void loadCelebrated().then(setCelebrated);
  }, []);
  const view = q.data ? growthView(q.data) : undefined;
  const phase = celebrated ? growthPhase(view, celebrated.has(entityId)) : 'hidden';

  // Si vuelve a faltar algo, se olvida la despedida (así, al completarlo de nuevo, se despide otra vez).
  useEffect(() => {
    if (celebrated && view && !view.complete && celebrated.has(entityId)) {
      const next = new Set(celebrated);
      next.delete(entityId);
      void saveCelebrated(next).then(() => setCelebrated(next));
    }
  }, [celebrated, view, entityId]);

  // Despedida: «¡Listo!» un momento, luego la tarjeta sube un poco y se desvanece (salida rápida, 240 ms).
  const [out] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (phase !== 'celebrate' || !celebrated) return;
    AccessibilityInfo.announceForAccessibility('Tu negocio está completo.');
    const t = setTimeout(() => {
      const finish = () => {
        const next = new Set(celebrated);
        next.add(entityId);
        setCelebrated(next);
        void saveCelebrated(next);
      };
      if (reduce) return finish();
      Animated.timing(out, { toValue: 1, duration: 240, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: true }).start(finish);
    }, GOODBYE_AFTER);
    return () => clearTimeout(t);
  }, [phase, celebrated, entityId, reduce, out]);

  if (phase === 'hidden' || !view) return null;
  const leave = { opacity: out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: out.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] };

  if (phase === 'celebrate') {
    return (
      <Animated.View style={[styles.done, leave]} accessibilityRole="alert">
        <Ionicons name="checkmark-circle" size={20} color={GREEN_INK} />
        <Text style={styles.doneText}>¡Listo! Tu negocio está completo: tu tarjeta, tu pin y tus respuestas ya muestran todo.</Text>
      </Animated.View>
    );
  }

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Haz que tu negocio destaque. ${view.label}. ${expanded ? 'Plegar' : 'Desplegar'}`}
        onPress={() => setExpanded((v) => !v)}
        style={styles.head}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">
            Haz que tu negocio destaque
          </Text>
          <View style={styles.meter}>
            <View style={styles.bar}>
              <View style={[styles.fill, { width: `${view.percent}%` }]} />
            </View>
            <Text style={styles.meterText}>{view.label}</Text>
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </Pressable>
      {expanded ? <Text style={styles.sub}>Cada punto cambia algo que tus clientes ven.</Text> : null}
      {expanded ? view.groups.map((g) => (
        <View key={g.id} style={styles.group}>
          <Text style={styles.groupTitle}>{g.title}</Text>
          {g.rows.map((r, i) => (
            <View key={r.key} style={[styles.row, i > 0 && styles.rowLine]}>
              <View style={[styles.check, r.done && styles.checkOn]} accessible={false}>
                {r.done ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
              </View>
              <View style={styles.rowText} accessible accessibilityLabel={`${r.title}${r.done ? ', listo' : ''}. ${r.why}`}>
                <Text style={[styles.rowTitle, r.done && styles.rowTitleDone]}>{r.title}</Text>
                <Text style={styles.why}>{r.why}</Text>
              </View>
              {r.done ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel={`${r.action}: ${r.title}`} onPress={() => onGo(r.target)} hitSlop={6} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
                  <Text style={styles.goText}>{r.action}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )) : null}
      {expanded ? <Text style={styles.note}>Nada de esto te sube en el orden: lo que cambia es lo que el cliente ve de ti.</Text> : null}
    </View>
  );
}

const GREEN = '#2E9E5B';
const GREEN_INK = '#1B6B3C';

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  title: { fontSize: 16, marginBottom: 6, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: spacing.sm },
  meter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bar: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: GREEN },
  meterText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  group: { marginTop: spacing.md },
  groupTitle: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 56 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: GREEN, borderColor: GREEN },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowTitleDone: { color: colors.muted, textDecorationLine: 'line-through' },
  why: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: 2 },
  go: { minHeight: 40, minWidth: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  goText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  pressed: { transform: [{ scale: 0.97 }] },
  note: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: spacing.sm },
  done: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#E5F5EC' },
  doneText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.bold, color: GREEN_INK },
});
