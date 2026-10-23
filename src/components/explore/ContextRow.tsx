import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ContextChip, FilterId } from '@/lib/context';
import type { ZoneName } from '@/lib/zoneName';
import { colors, fonts, radius, shadow, DENSE_TEXT_SCALE } from '@/theme';
import { ZoneCapsule } from './ZoneCapsule';

interface Props {
  chips: ContextChip[];
  zoneName: ZoneName | null;
  onRemoveScope: () => void;
  onRemoveFilter: (id: FilterId) => void;
  onClear: () => void;
  onSearchArea: () => void;
}

/**
 * Una sola fila bajo el buscador mientras se busca: la zona, el alcance, los filtros y «Buscar en
 * esta zona». Cada cosa activa se quita con su ✕ (zona de toque de 44 pt). Se desplaza hacia el lado
 * si no cabe, también con la letra del sistema al 200 %.
 */
export function ContextRow({ chips, zoneName, onRemoveScope, onRemoveFilter, onClear, onSearchArea }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.row}
      accessibilityRole="toolbar"
      accessibilityLabel="Contexto de la búsqueda"
    >
      {chips.map((chip) => {
        if (chip.kind === 'zone') return zoneName ? <ZoneCapsule key="zone" name={zoneName} /> : null;
        if (chip.kind === 'scope') {
          return (
            <RemovableChip
              key="scope"
              label={chip.label}
              icon="navigate"
              onRemove={chip.removable ? onRemoveScope : null}
              removeLabel={`Quitar alcance: ${chip.label.toLowerCase()}`}
            />
          );
        }
        if (chip.kind === 'filter') {
          return (
            <RemovableChip
              key={chip.id}
              label={chip.label}
              icon="pricetag-outline"
              onRemove={() => onRemoveFilter(chip.id)}
              removeLabel={`Quitar filtro: ${chip.label.toLowerCase()}`}
            />
          );
        }
        if (chip.kind === 'clear') {
          return (
            <Pressable key="clear" accessibilityRole="button" accessibilityLabel="Quitar alcance y filtros" onPress={onClear} style={styles.clear}>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.clearText}>Quitar todo</Text>
            </Pressable>
          );
        }
        return (
          <Pressable key="area" accessibilityRole="button" accessibilityLabel="Buscar en esta zona" onPress={onSearchArea} style={styles.areaHit}>
            <View style={styles.areaPill}>
              <Ionicons name="refresh" size={14} color="#fff" />
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.areaText}>Buscar en esta zona</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function RemovableChip({
  label,
  icon,
  onRemove,
  removeLabel,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onRemove: (() => void) | null;
  removeLabel: string;
}) {
  return (
    <View style={[styles.chip, onRemove ? styles.chipRemovable : null]} accessible={!onRemove} accessibilityLabel={onRemove ? undefined : label}>
      <Ionicons name={icon} size={13} color={colors.primary} />
      <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={removeLabel} onPress={onRemove} style={styles.removeHit}>
          <View style={styles.removeDot}>
            <Ionicons name="close" size={14} color={colors.ink} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { alignItems: 'center', gap: 8, paddingVertical: 4, paddingRight: 24 },
  chip: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.97)',
    ...shadow,
  },
  chipRemovable: { paddingRight: 2 },
  chipText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  // La ✕ mide 44 × 44 aunque el chip mida 32: los márgenes negativos no agrandan la fila.
  removeHit: { width: 44, height: 44, marginVertical: -6, marginLeft: -4, marginRight: -2, alignItems: 'center', justifyContent: 'center' },
  removeDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  clear: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center', marginVertical: -6 },
  clearText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark, textDecorationLine: 'underline' },
  areaHit: { minHeight: 44, justifyContent: 'center', marginVertical: -6, paddingHorizontal: 2 },
  areaPill: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    ...shadow,
  },
  areaText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
