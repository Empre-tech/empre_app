import Ionicons from '@expo/vector-icons/Ionicons';
import { AccessibilityInfo, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { removedAnnouncement } from '@/lib/context';
import { colors, DENSE_TEXT_SCALE, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onOpenFilters: () => void;
  /** Filtros activos; si hay alguno, el botón lo muestra con un contador. */
  filterCount: number;
}

/**
 * Buscador de Explorar con el botón de Filtros dentro, a la derecha. Reúne en
 * una sola fila lo que antes eran el buscador, el botón Filtros y el
 * interruptor mapa/lista.
 */
export function SearchBar({ value, onChangeText, onOpenFilters, filterCount }: Props) {
  const active = filterCount > 0;
  return (
    <View style={styles.box}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Busca un negocio, categoría o barrio"
        placeholderTextColor={colors.muted}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="Buscar negocios"
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar búsqueda" onPress={() => {
            onChangeText('');
            AccessibilityInfo.announceForAccessibility(removedAnnouncement('search'));
          }}
          style={styles.clearHit}
        >
          <View style={styles.clearDot}>
            <Ionicons name="close" size={15} color={colors.ink} />
          </View>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? `Abrir filtros, ${filterCount} activos` : 'Abrir filtros'}
        onPress={onOpenFilters}
        hitSlop={6}
        style={({ pressed }) => [styles.filterButton, active && styles.filterButtonActive, pressed && styles.pressed]}
      >
        <Ionicons name="options-outline" size={18} color={active ? colors.white : colors.primary} />
        {active ? (
          <View style={styles.badge}>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.badgeText}>{filterCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 44,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  input: { flex: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink, height: '100%' },
  // Zona de toque de 44 × 44 pt (la caja mide 44 de alto: no la agranda).
  clearHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  clearDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  filterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  filterButtonActive: { backgroundColor: colors.primary },
  pressed: { opacity: 0.8 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  // Texto en tinta sobre ámbar: el blanco no llega a 4,5:1.
  badgeText: { fontSize: 10, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
