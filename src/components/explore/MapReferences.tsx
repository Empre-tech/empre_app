import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadow, spacing } from '@/theme';

/** Tamaño con el que se calcula dónde va la píldora «Tú» (la vista lo respeta). */
export const YOU_PILL = { width: 132, height: 44 };

/**
 * «Tú · 3.7 km» pegada al borde de lo que se ve, del lado donde estás, con una flecha hacia ti (3.23). Tocarla te
 * devuelve al mapa sobre ti (lo mismo que «Volver» de la franja).
 */
export function YouPill({ left, top, angle, distance, onPress }: { left: number; top: number; angle: number; distance: string | null; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tú estás ${distance ? `a ${distance}` : 'fuera de lo que ves'}. Volver a tu ubicación`}
      onPress={onPress}
      style={({ pressed }) => [styles.you, { left, top }, pressed && styles.pressed]}
    >
      <View style={styles.youArrow}>
        <Ionicons name="arrow-forward" size={15} color="#fff" style={{ transform: [{ rotate: `${angle}deg` }] }} />
      </View>
      <Text style={styles.youText} numberOfLines={1}>
        Tú{distance ? ` · ${distance}` : ''}
      </Text>
    </Pressable>
  );
}

/**
 * Leyenda corta del mapa, al lado izquierdo, pegada al panel como el botón de ubicación: rayo = oferta, punto verde =
 * abierto y, si hay zona marcada, el círculo punteado. Tocarla abre la explicación.
 */
export function MapLegend({ bottom, withZone, open, onToggle }: { bottom: Animated.AnimatedInterpolation<number> | Animated.Value | Animated.AnimatedAddition<number>; withZone: boolean; open: boolean; onToggle: () => void }) {
  return (
    <Animated.View style={[styles.legendWrap, { bottom }]} pointerEvents="box-none">
      {open ? (
        <View style={styles.card} accessibilityRole="summary" accessibilityLiveRegion="polite">
          <Text style={styles.cardTitle}>Cómo leer el mapa</Text>
          {withZone ? (
            <View style={styles.cardRow}>
              <View style={styles.dash} />
              <Text style={styles.cardText}>El círculo punteado es la zona que estás mirando. El panel muestra los destacados que se ven en el mapa.</Text>
            </View>
          ) : null}
          <View style={styles.cardRow}>
            <View style={styles.bolt}>
              <Ionicons name="flash" size={11} color={colors.ink} />
            </View>
            <Text style={styles.cardText}>Rayo: tiene una oferta activa ahora.</Text>
          </View>
          <View style={styles.cardRow}>
            <View style={styles.green} />
            <Text style={styles.cardText}>Punto verde: está abierto.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onToggle} style={styles.ok}>
            <Text style={styles.okText}>Entendido</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Qué significan los pines"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.legend, pressed && styles.pressed]}
      >
        <View style={styles.item}>
          <View style={styles.bolt}>
            <Ionicons name="flash" size={10} color={colors.ink} />
          </View>
          <Text style={styles.itemText}>Oferta</Text>
        </View>
        <View style={styles.item}>
          <View style={styles.green} />
          <Text style={styles.itemText}>Abierto</Text>
        </View>
        {withZone ? (
          <View style={styles.item}>
            <View style={styles.dash} />
            <Text style={styles.itemText}>Zona</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  you: {
    position: 'absolute',
    minWidth: YOU_PILL.width,
    height: YOU_PILL.height,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow,
  },
  youArrow: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  youText: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: '#1E4FA0' },
  legendWrap: { position: 'absolute', left: spacing.md, right: 84, alignItems: 'flex-start', gap: spacing.sm },
  legend: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.96)', ...shadow },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.ink },
  bolt: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  green: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  dash: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary },
  card: { alignSelf: 'stretch', padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.sm, ...shadow },
  cardTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.ink },
  ok: { alignSelf: 'flex-end', minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  okText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
});
