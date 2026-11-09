import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GroupId } from '@/lib/categoryGroups';
import { activeCount, NO_FILTERS, quickChips, seeLabel, sheetSections, toggleQuick, type FilterCaps, type SearchFilters } from '@/lib/searchFilters';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const GROUP_ICON: Record<GroupId, IconName> = {
  comer: 'restaurant-outline',
  salud: 'cut-outline',
  compras: 'bag-handle-outline',
  servicios: 'construct-outline',
  planes: 'airplane-outline',
};
const NEED_ICON: Record<string, IconName> = {
  open: 'time-outline',
  offer: 'pricetag-outline',
  delivery: 'bicycle-outline',
  verified: 'checkmark-circle-outline',
};

/**
 * La fila de filtros (3.66), igual en Inicio y en Finder: «Filtros» con cuántos hay, y al lado los rápidos. Lo elegido
 * se ve lleno con ✕ y se quita con un toque; con dos o más aparece «Quitar todo».
 */
export function FilterRow({
  value,
  onChange,
  caps,
  groupName,
  onOpenSheet,
  tone = 'light',
}: {
  value: SearchFilters;
  onChange: (f: SearchFilters) => void;
  caps: FilterCaps;
  groupName?: string;
  onOpenSheet: () => void;
  /** Sobre el mapa los filtros apagados llevan sombra para leerse. */
  tone?: 'light' | 'map';
}) {
  const n = activeCount(value);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled" accessibilityRole="toolbar" accessibilityLabel="Filtros de búsqueda">
      <Pressable accessibilityRole="button" accessibilityLabel={n ? `Filtros, ${n} activos` : 'Filtros'} onPress={onOpenSheet} style={({ pressed }) => [styles.filtersBtn, tone === 'map' && styles.onMap, pressed && styles.pressed]}>
        <Ionicons name="options-outline" size={17} color={colors.ink} />
        <Text style={styles.chipText}>Filtros</Text>
        {n ? (
          <View style={styles.count}>
            <Text style={styles.countText}>{n}</Text>
          </View>
        ) : null}
      </Pressable>
      <View style={styles.divider} />
      {quickChips(value, caps, groupName).map((c) => (
        <Pressable
          key={c.key}
          accessibilityRole="button"
          accessibilityState={{ selected: c.on }}
          accessibilityLabel={c.on && c.key !== 'group' ? `${c.label}, toca para quitar` : c.label}
          onPress={() => (c.key === 'group' ? (c.on ? onChange({ ...value, group: null }) : onOpenSheet()) : onChange(toggleQuick(value, c.key)))}
          style={({ pressed }) => [styles.chip, c.on ? styles.chipOn : tone === 'map' && styles.onMap, pressed && styles.pressed]}
        >
          {c.key === 'open' && !c.on ? <View style={styles.openDot} /> : null}
          <Text style={[styles.chipText, c.on && styles.chipTextOn]}>{c.label}</Text>
          {c.on ? <Ionicons name="close" size={14} color="#FFFFFF" /> : c.key === 'group' ? <Ionicons name="chevron-down" size={14} color={colors.ink} /> : null}
        </Pressable>
      ))}
      {n >= 2 ? (
        <Pressable accessibilityRole="button" onPress={() => onChange(NO_FILTERS)} style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
          <Text style={styles.clearText}>Quitar todo</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

/** La hoja de Filtros: Ordenar, Qué tan cerca, Qué tipo de negocio y Lo que necesitas. Cambia en vivo. */
export function FiltersSheet({
  visible,
  value,
  onChange,
  onClose,
  caps,
  groups,
  resultCount,
}: {
  visible: boolean;
  value: SearchFilters;
  onChange: (f: SearchFilters) => void;
  onClose: () => void;
  caps: FilterCaps;
  groups: { id: GroupId; name: string }[];
  /** Cuántos lugares quedan con estos filtros (lo que ya está cargado). */
  resultCount: number;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const sections = sheetSections(value, caps, groups);
  return (
    <Modal visible={visible} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Cerrar filtros" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} accessibilityViewIsModal>
          <View style={styles.head}>
            <Text style={styles.title} accessibilityRole="header">
              Filtros
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar filtros" onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {sections.map((s) => (
              <View key={s.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{s.title}</Text>
                <View style={styles.options}>
                  {s.options.map((o) => {
                    const icon = s.title === 'Qué tipo de negocio' ? GROUP_ICON[o.id as GroupId] : NEED_ICON[o.id];
                    return (
                      <Pressable
                        key={o.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: o.on }}
                        onPress={() => onChange(o.apply(value))}
                        style={({ pressed }) => [styles.option, o.on && styles.optionOn, pressed && styles.pressed]}
                      >
                        {icon ? <Ionicons name={icon} size={15} color={o.on ? '#FFFFFF' : colors.ink} /> : null}
                        <Text style={[styles.optionText, o.on && styles.chipTextOn]}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {s.note ? <Text style={styles.note}>{s.note}</Text> : null}
              </View>
            ))}
          </ScrollView>
          <View style={styles.foot}>
            <Pressable accessibilityRole="button" onPress={() => onChange(NO_FILTERS)} style={({ pressed }) => [styles.footClear, pressed && styles.pressed]}>
              <Text style={styles.footClearText}>Quitar todo</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.see, pressed && styles.pressed]}>
              <Text style={styles.seeText}>{seeLabel(resultCount)}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, alignItems: 'center', paddingHorizontal: 16 },
  filtersBtn: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  onMap: { ...softShadow },
  count: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
  divider: { width: 1, height: 24, backgroundColor: colors.line },
  chip: { minHeight: 44, paddingHorizontal: 13, borderRadius: 22, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  chipTextOn: { color: '#FFFFFF' },
  openDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#14B8B0' },
  clear: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  clearText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  backdrop: { flex: 1, backgroundColor: 'rgba(14, 35, 70, 0.45)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 10, paddingTop: 10, paddingBottom: 4 },
  title: { flex: 1, fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, gap: 18 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { minHeight: 44, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  optionText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  note: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.faint },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline },
  footClear: { minHeight: 52, paddingHorizontal: 12, justifyContent: 'center' },
  footClearText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  see: { flex: 1, minHeight: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  seeText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
  pressed: { opacity: 0.85 },
});
