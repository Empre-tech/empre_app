import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Lens, LensKey } from '@/lib/offerLenses';
import { displayIcon } from '@/lib/mapView';
import type { MarketSort } from '@/lib/offerMarket';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const LENS_ICON: Record<LensKey, IconName> = {
  parati: 'sparkles-outline',
  terminan: 'time-outline',
  buscado: 'search-outline',
  canjea: 'flame-outline',
  valoradas: 'star-outline',
};

/** Las lentes de tendencia (3.61): una sola forma de dividir las ofertas. Con una sola lente no se dibujan. */
export function LensTabs({ lenses, active, onPick }: { lenses: Lens[]; active: LensKey | null; onPick: (k: LensKey) => void }) {
  if (lenses.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Ver ofertas por">
      {lenses.map((l) => {
        const on = l.key === active;
        return (
          <Pressable key={l.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onPick(l.key)} style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}>
            <Ionicons name={LENS_ICON[l.key]} size={16} color={on ? '#FFFFFF' : colors.ink} />
            <Text style={[styles.tabText, on && { color: '#FFFFFF' }]}>{l.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export interface FilterTag {
  key: string;
  label: string;
  onRemove: () => void;
}

/** Tipo de negocio + el botón «Filtros» (con cuántos hay puestos) + las etiquetas que se quitan con un toque. */
export function FilterRow({ cats, catId, onCat, tags, onOpen }: { cats: { id: string; name: string; icon: string }[]; catId?: string; onCat: (id: string | undefined) => void; tags: FilterTag[]; onOpen: () => void }) {
  return (
    <View style={styles.filterWrap}>
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} style={{ flex: 1 }} accessibilityLabel="Tipo de negocio">
          {cats.map((c) => {
            const on = catId === c.id;
            return (
              <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onCat(on ? undefined : c.id)} style={({ pressed }) => [styles.cat, on && styles.catOn, pressed && styles.pressed]}>
                <Ionicons name={displayIcon(c.icon) as IconName} size={16} color={colors.ink} />
                <Text style={styles.catText} numberOfLines={1}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel={tags.length ? `Filtros, ${tags.length} puestos` : 'Filtros'} onPress={onOpen} style={({ pressed }) => [styles.filterBtn, pressed && styles.pressed]}>
          <Ionicons name="options-outline" size={16} color="#FFFFFF" />
          <Text style={styles.filterBtnText}>Filtros</Text>
          {tags.length ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{tags.length}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {tags.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tags}>
          {tags.map((t) => (
            <Pressable key={t.key} accessibilityRole="button" accessibilityLabel={`Quitar filtro ${t.label}`} onPress={t.onRemove} style={styles.tag}>
              <Text style={styles.tagText}>{t.label}</Text>
              <Ionicons name="close" size={14} color={colors.ink} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Option({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.opt, on && styles.optOn]}>
      <Text style={styles.optText}>{label}</Text>
    </Pressable>
  );
}

export type ShowFilter = 'all' | 'offers' | 'services';

/** Lo que antes eran cuatro filas (zona, mostrar, orden y abiertos), en una hoja. */
export function FiltersSheet({
  visible,
  zones,
  onZone,
  show,
  onShow,
  sorts,
  sort,
  onSort,
  openOnly,
  onOpenOnly,
  onClear,
  onClose,
}: {
  visible: boolean;
  zones: { id: string; name: string; on: boolean }[];
  onZone: (id: string) => void;
  show: ShowFilter;
  onShow: (s: ShowFilter) => void;
  sorts: { key: MarketSort; label: string }[];
  sort: MarketSort;
  onSort: (s: MarketSort) => void;
  openOnly: boolean;
  onOpenOnly: (v: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  return (
    <Modal visible={visible} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel="Cerrar filtros" onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal onPress={(e) => e.stopPropagation()}>
          <View style={styles.grab} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Filtros
            </Text>
            <Pressable accessibilityRole="button" onPress={onClear} style={styles.clear}>
              <Text style={styles.clearText}>Quitar todo</Text>
            </Pressable>
          </View>
          {zones.length ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Zona</Text>
              <View style={styles.opts}>
                {zones.map((z) => (
                  <Option key={z.id || 'aqui'} label={z.name} on={z.on} onPress={() => onZone(z.id)} />
                ))}
              </View>
            </View>
          ) : null}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Mostrar</Text>
            <View style={styles.opts}>
              <Option label="Ofertas y catálogo" on={show === 'all'} onPress={() => onShow('all')} />
              <Option label="Solo ofertas" on={show === 'offers'} onPress={() => onShow('offers')} />
              <Option label="Solo catálogo" on={show === 'services'} onPress={() => onShow('services')} />
            </View>
          </View>
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Ordenar</Text>
            <View style={styles.opts}>
              {sorts.map((o) => (
                <Option key={o.key} label={o.label} on={sort === o.key} onPress={() => onSort(o.key)} />
              ))}
            </View>
          </View>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: openOnly }} onPress={() => onOpenOnly(!openOnly)} style={styles.switchRow}>
            <Text style={styles.switchText}>Solo abiertos ahora</Text>
            <View style={[styles.track, openOnly && styles.trackOn]}>
              <View style={styles.knob} />
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.apply}>
            <Text style={styles.applyText}>Ver resultados</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: 6, paddingHorizontal: 20, paddingVertical: 2 },
  tab: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  pressed: { transform: [{ scale: 0.97 }] },
  filterWrap: { gap: 8 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 20 },
  cats: { gap: 6, paddingLeft: 20, paddingRight: 4 },
  cat: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  catOn: { backgroundColor: colors.selectedSoft, borderColor: colors.selected, borderWidth: 1.5 },
  catText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  filterBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.ink },
  filterBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  badgeText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tags: { gap: 6, paddingHorizontal: 20 },
  tag: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 10, borderRadius: radius.pill, backgroundColor: colors.selectedSoft },
  tagText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,35,70,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, gap: 16, ...softShadow },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  clear: { minHeight: 44, justifyContent: 'center' },
  clearText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  group: { gap: 8 },
  groupLabel: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opt: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  optOn: { borderColor: colors.selected, backgroundColor: colors.selectedSoft },
  optText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  switchRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.bg },
  switchText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  track: { width: 46, height: 28, padding: 3, borderRadius: 14, backgroundColor: colors.placeholder, alignItems: 'flex-start' },
  trackOn: { backgroundColor: colors.ink, alignItems: 'flex-end' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface },
  apply: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primary },
  applyText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
});
