import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MapThemePref } from '@/lib/mapLive';

import { colors, fonts, radius, shadow, spacing } from '@/theme';

/** Lado de la zona táctil del punto «Tú» (la flecha se calcula desde su centro). */
export const YOU_DOT = 44;

/**
 * «Tú» cuando tu punto azul no se ve (3.25, opción B de `tu_ligero.html`): el mismo punto azul asomándose en el borde
 * derecho, encima del botón de ubicación, con una flecha hacia ti y la distancia pequeña debajo. Tocarlo te devuelve.
 */
export function YouDot({ bottom, angle, distance, onPress }: { bottom: Animated.AnimatedAddition<number>; angle: number; distance: string | null; onPress: () => void }) {
  return (
    <Animated.View style={[styles.dotWrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Tú estás ${distance ? `a ${distance}` : 'fuera de lo que ves'}. Volver a tu ubicación`}
        onPress={onPress}
        style={({ pressed }) => [styles.dotHit, pressed && styles.pressed]}
      >
        <View style={styles.dot}>
          <Ionicons name="arrow-forward" size={13} color="#fff" style={{ transform: [{ rotate: `${angle}deg` }] }} />
        </View>
      </Pressable>
      {distance ? (
        <Text style={styles.dotText} numberOfLines={1}>
          {distance}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** Capas del mapa (3.41) dentro de la misma tarjeta: el tema. Sin botón nuevo sobre el mapa. */
export interface MapLayersProps {
  theme: MapThemePref;
  onTheme: (t: MapThemePref) => void;
}

const THEMES: { key: MapThemePref; label: string }[] = [
  { key: 'day', label: 'Día' },
  { key: 'night', label: 'Noche' },
  { key: 'auto', label: 'Automático' },
];

/**
 * Leyenda y capas del mapa (3.25, 3.41): un botón de 44 pt al lado izquierdo, pegado al panel como el de ubicación, que
 * no tapa pines. Al tocarlo se abre la explicación (rayo = oferta, punto verde = abierto) y, si se pasan `layers`, el
 * tema del mapa.
 */
export function MapLegend({ bottom, open, onToggle, layers }: { bottom: Animated.AnimatedInterpolation<number> | Animated.Value | Animated.AnimatedAddition<number>; open: boolean; onToggle: () => void; layers?: MapLayersProps }) {
  return (
    <Animated.View style={[styles.legendWrap, { bottom }]} pointerEvents="box-none">
      {open ? (
        <View style={styles.card} accessibilityRole="summary" accessibilityLiveRegion="polite">
          <Text style={styles.cardTitle}>Cómo leer el mapa</Text>
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
          {layers ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.cardTitle}>Mapa</Text>
              <View style={styles.seg} accessibilityRole="radiogroup">
                {THEMES.map((t) => (
                  <Pressable
                    key={t.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: layers.theme === t.key }}
                    accessibilityLabel={t.key === 'auto' ? 'Automático: de noche desde las 6 de la tarde' : `Mapa de ${t.label.toLowerCase()}`}
                    onPress={() => layers.onTheme(t.key)}
                    style={[styles.segBtn, layers.theme === t.key && styles.segOn]}
                  >
                    <Text style={[styles.segText, layers.theme === t.key && styles.segTextOn]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onToggle} style={styles.ok}>
            <Text style={styles.okText}>Entendido</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={layers ? 'Leyenda y capas del mapa' : 'Qué significan los pines'}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.info, open && styles.infoOn, pressed && styles.pressed]}
      >
        <Ionicons name={open ? 'close' : layers ? 'layers-outline' : 'information'} size={20} color={open ? '#fff' : colors.primary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  // Pegado al borde derecho; quien lo usa lo pone encima del botón de ubicación.
  dotWrap: { position: 'absolute', right: spacing.md + 2, alignItems: 'center', width: YOU_DOT },
  dotHit: { width: YOU_DOT, height: YOU_DOT, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#3B82F6',
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  dotText: { marginTop: -4, paddingHorizontal: 5, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.88)', fontSize: 10, fontFamily: fonts.ui.extrabold, color: '#1E4FA0' },
  legendWrap: { position: 'absolute', left: spacing.md, right: 84, alignItems: 'flex-start', gap: spacing.sm },
  info: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', ...shadow },
  infoOn: { backgroundColor: colors.primary },
  bolt: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  green: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  card: { alignSelf: 'stretch', padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.sm, ...shadow },
  cardTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.ink },
  ok: { alignSelf: 'flex-end', minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  okText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  divider: { height: 1, backgroundColor: colors.line },
  seg: { flexDirection: 'row', gap: 6 },
  segBtn: { flex: 1, minHeight: 40, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  segText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  segTextOn: { color: '#fff' },
});
