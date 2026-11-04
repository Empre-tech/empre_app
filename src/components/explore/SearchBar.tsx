import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { removedAnnouncement } from '@/lib/context';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onOpenFilters: () => void;
  /** Filtros activos; si hay alguno, el botón lo muestra con un contador. */
  filterCount: number;
  /** En el mapa usamos versión compacta de 1 línea para dejar más área de mapa libre. */
  compact?: boolean;
}

/**
 * Buscador de Explorar en doble nivel (pregunta principal + contexto debajo cuando está en reposo)
 * o versión compacta de 1 línea sobre el mapa, con el botón de Filtros dentro a la derecha.
 */
export function SearchBar({ value, onChangeText, onOpenFilters, filterCount, compact }: Props) {
  const active = filterCount > 0;
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const showTwoLevel = !compact && !focused && value.length === 0;

  return (
    <View style={[styles.box, compact && styles.boxCompact, focused && styles.boxFocused]}>
      <Ionicons name="search" size={18} color={focused ? colors.ink : colors.muted} />
      <View style={styles.inputArea}>
        {showTwoLevel ? (
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={() => inputRef.current?.focus()}
            style={styles.twoLevelOverlay}
          >
            <Text style={styles.titleLine} numberOfLines={1}>
              ¿Qué buscas en tu barrio?
            </Text>
            <Text style={styles.subLine} numberOfLines={1}>
              Negocios, ofertas o servicios · Abiertos ahora
            </Text>
          </Pressable>
        ) : null}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={showTwoLevel ? '' : compact ? 'Busca negocios, ofertas o servicios…' : 'Busca un negocio, categoría o barrio'}
          placeholderTextColor={colors.muted}
          style={[styles.input, showTwoLevel && styles.inputTransparent]}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Buscar negocios, ofertas o barrios"
        />
      </View>
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quitar búsqueda"
          onPress={() => {
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
        <Ionicons name="options-outline" size={18} color={active ? colors.selected : colors.ink} />
        {active ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{filterCount}</Text>
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
    gap: spacing.sm,
    minHeight: 52,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  boxCompact: {
    minHeight: 46,
  },
  boxFocused: {
    borderColor: colors.selected,
  },
  inputArea: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  twoLevelOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
  },
  titleLine: {
    fontSize: 13.5,
    fontFamily: fonts.ui.extrabold,
    color: colors.ink,
  },
  subLine: {
    fontSize: 12,
    fontFamily: fonts.ui.semibold,
    color: colors.muted,
    marginTop: 1,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: fonts.ui.semibold,
    color: colors.ink,
    minHeight: 44,
  },
  inputTransparent: {
    opacity: 0.02,
  },
  clearHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  clearDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.selectedSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterButtonActive: { backgroundColor: colors.selectedSoft, borderColor: colors.selected },
  pressed: { opacity: 0.8 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
