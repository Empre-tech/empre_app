import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Category } from '@/api/types';
import { categoryColor } from '@/lib/categoryColor';
import { alphabetical } from '@/lib/categoryShelf';
import { colors, fonts, spacing } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface ShelfProps {
  categories: Category[];
  selectedId?: string;
  /** Categorías con negocios abiertos ahora: llevan un punto verde. */
  openIds: Set<string>;
  onSelect: (id: string | undefined) => void;
  onSeeAll: () => void;
}

function Disc({ category, selected, open }: { category: Category; selected: boolean; open: boolean }) {
  return (
    <View style={[styles.disc, { backgroundColor: categoryColor(category.color).fg }, selected && styles.discOn]}>
      <Ionicons name={(category.icon || 'storefront-outline') as IconName} size={24} color="#fff" />
      {open ? <View style={styles.openDot} /> : null}
    </View>
  );
}

function Tile({ category, selected, open, onPress }: { category: Category; selected: boolean; open: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${category.name}${open ? ', con negocios abiertos ahora' : ''}`}
      accessibilityHint={selected ? 'Toca para quitar el filtro' : undefined}
      onPress={onPress}
      style={styles.tile}
    >
      <Disc category={category} selected={selected} open={open} />
      <Text style={styles.label} numberOfLines={2}>
        {category.name}
      </Text>
    </Pressable>
  );
}

/**
 * «Explora por categoría»: una fila que se desplaza, la primera del panel. Mismo icono y color que el pin en el mapa,
 * así la fila explica el mapa sin leyenda aparte. Tocar la activa la quita.
 */
export function CategoryShelf({ categories, selectedId, openIds, onSelect, onSeeAll }: ShelfProps) {
  if (categories.length === 0) return null;
  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.headText}>Explora por categoría</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver todas las categorías" onPress={onSeeAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.seeAll}>
          <Text style={styles.link}>Ver todas ›</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row} accessibilityLabel="Categorías">
        {categories.map((c) => (
          <Tile key={c.id} category={c} selected={c.id === selectedId} open={openIds.has(c.id)} onPress={() => onSelect(c.id === selectedId ? undefined : c.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

interface AllProps {
  visible: boolean;
  categories: Category[];
  selectedId?: string;
  openIds: Set<string>;
  onSelect: (id: string | undefined) => void;
  onClose: () => void;
}

/** «Ver todas»: la rejilla completa, por nombre, en tres columnas. Al elegir se cierra. */
export function AllCategoriesModal({ visible, categories, selectedId, openIds, onSelect, onClose }: AllProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.modal, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom }]}>
        <View style={styles.modalBar}>
          <Text style={styles.modalTitle} accessibilityRole="header">
            Todas las categorías
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.close}>
            <Text style={styles.link}>Cerrar</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {alphabetical(categories).map((c) => (
            <View key={c.id} style={styles.cell}>
              <Tile
                category={c}
                selected={c.id === selectedId}
                open={openIds.has(c.id)}
                onPress={() => {
                  onSelect(c.id === selectedId ? undefined : c.id);
                  onClose();
                }}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headText: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  seeAll: { minHeight: 44, justifyContent: 'center' },
  link: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  scroll: { flexGrow: 0 },
  row: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  tile: { width: 74, minHeight: 88, alignItems: 'center', gap: 6, paddingVertical: 6 },
  disc: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  // Anillo de la elegida: blanco por dentro y tinta por fuera, para que se note sin depender del color.
  discOn: { borderWidth: 3, borderColor: '#fff', outlineWidth: 3, outlineColor: colors.ink, outlineStyle: 'solid' },
  openDot: { position: 'absolute', right: -1, top: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#2E9E5B', borderWidth: 2, borderColor: '#fff' },
  label: { fontSize: 11.5, lineHeight: 14, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
  modal: { flex: 1, backgroundColor: colors.surface },
  modalBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  modalTitle: { flex: 1, fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  cell: { width: '33.333%', alignItems: 'center' },
});
