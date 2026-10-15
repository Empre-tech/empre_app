import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BusinessRow } from '@/components/BusinessRow';
import { Button } from '@/components/Button';
import { FeaturedCard, type WithDistance } from './FeaturedCard';
import type { FeaturedSheetState } from './useFeaturedSheet';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  sheet: FeaturedSheetState;
  featured: WithDistance[];
  /** Hay negocios en la zona, pero todos son el propio. */
  onlyMine: boolean;
  title: string;
  bottomInset: number;
  onOpenBusiness: (id: string) => void;
  /** Cambia a la vista de lista (estado «solo está tu negocio»). */
  onSeeList: () => void;
}

/**
 * Destacados como hoja emergente. No es un panel fijo: se recoge a una píldora
 * cuando el usuario busca o arrastra el mapa, sube sola a «peek» cuando todo
 * queda quieto, y el usuario la lleva a mano entre los cuatro anclajes. Sin
 * contenido relevante no aparece ni la píldora.
 */
export function FeaturedSheet({ sheet, featured, onlyMine, title, bottomInset, onOpenBusiness, onSeeList }: Props) {
  const { anchor, height, snapTo, panHandlers } = sheet;
  if (featured.length === 0 && !onlyMine) return null;

  const hidden = anchor === 'hidden';
  const peek = anchor === 'peek';
  const full = anchor === 'full';
  const pillText = featured.length > 0 ? `${featured.length} destacados cerca` : 'Solo está tu negocio';

  return (
    <>
      {hidden ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${pillText}. Toca para ver los destacados`}
          onPress={() => snapTo('peek')}
          hitSlop={6}
          style={({ pressed }) => [styles.pill, { bottom: bottomInset + spacing.md }, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.pillDot} />
          <Text style={styles.pillText}>{pillText}</Text>
        </Pressable>
      ) : null}

      <Animated.View
        pointerEvents={hidden ? 'none' : 'auto'}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        style={[styles.sheet, { height, paddingBottom: peek ? spacing.xs : bottomInset + spacing.sm }]}
      >
        {/* Asa + encabezado: arrastrables para subir o bajar la hoja. */}
        <View {...panHandlers}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.actions}>
              {!full ? (
                <Pressable accessibilityRole="button" onPress={() => snapTo('full')} hitSlop={8}>
                  <Text style={styles.seeAll}>Ver todos</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={peek ? 'Expandir Destacados' : 'Reducir Destacados'}
                onPress={() => snapTo(peek ? 'medium' : full ? 'medium' : 'peek')}
                hitSlop={8}
              >
                <Ionicons name={peek ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* En «peek» el contenido queda recortado debajo del encabezado: se oculta
            también para el lector de pantalla. */}
        <View
          style={styles.body}
          accessibilityElementsHidden={peek}
          importantForAccessibility={peek ? 'no-hide-descendants' : 'auto'}
        >
          {featured.length > 0 ? (
            full ? (
              <ScrollView contentContainerStyle={[styles.fullList, { paddingBottom: bottomInset + spacing.lg }]}>
                {featured.map((entity) => (
                  <BusinessRow
                    key={entity.id}
                    entity={entity}
                    distanceKm={entity.distanceKm}
                    onPress={() => onOpenBusiness(entity.id)}
                  />
                ))}
              </ScrollView>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={styles.carouselRow}>
                {featured.map((entity) => (
                  <FeaturedCard key={entity.id} entity={entity} onPress={() => onOpenBusiness(entity.id)} />
                ))}
              </ScrollView>
            )
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Por ahora solo está tu negocio</Text>
              <Text style={styles.emptyText}>Cuando haya más cerca, aparecerán aquí.</Text>
              <Button title="Ver todos" onPress={onSeeList} style={styles.emptyButton} />
            </View>
          )}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
    ...shadow,
  },
  handleWrap: { paddingVertical: 6, alignSelf: 'stretch', alignItems: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  title: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, flexShrink: 1, marginRight: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  seeAll: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.primary },
  body: { flex: 1 },
  // Sin flexGrow en 0, el ScrollView horizontal se estira a todo el alto de la hoja.
  carousel: { flexGrow: 0 },
  carouselRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.md },
  fullList: { paddingHorizontal: spacing.md, gap: spacing.md },
  empty: { alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  emptyTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  emptyButton: { alignSelf: 'stretch', paddingHorizontal: spacing.sm },
  // Píldora oscura con punto ámbar: discreta, alto contraste, no compite con el mapa.
  pill: {
    position: 'absolute',
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    ...shadow,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  pillText: { fontSize: 13, fontFamily: fonts.ui.bold, color: '#fff' },
});
