import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Category } from '@/api/types';
import { categoryColor } from '@/lib/categoryColor';
import type { CategoryGroup } from '@/lib/categoryGroups';
import { colors, fonts, spacing } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Props {
  visible: boolean;
  groups: CategoryGroup<Category>[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onClose: () => void;
}

/** «Ver todas»: las categorías agrupadas, en tres columnas. Al elegir una se cierra; elegir la activa la quita. */
export function AllCategoriesModal({ visible, groups, selectedId, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.modal, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom }]}>
        <View style={styles.bar}>
          <Text style={styles.title} accessibilityRole="header">
            Todas las categorías
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.close}>
            <Text style={styles.link}>Cerrar</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {groups.map((g) => (
            <View key={g.id}>
              <Text style={styles.groupTitle} accessibilityRole="header">
                {g.name}
              </Text>
              <View style={styles.grid}>
                {g.categories.map((c) => {
                  const selected = c.id === selectedId;
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={c.name}
                      accessibilityHint={selected ? 'Toca para quitar el filtro' : undefined}
                      onPress={() => {
                        onSelect(selected ? undefined : c.id);
                        onClose();
                      }}
                      style={styles.tile}
                    >
                      <View style={[styles.disc, { backgroundColor: categoryColor(c.color).fg }, selected && styles.discOn]}>
                        <Ionicons name={(c.icon || 'storefront-outline') as IconName} size={24} color={colors.white} />
                      </View>
                      <Text style={styles.label} numberOfLines={2}>
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.surface },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { flex: 1, fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  link: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  groupTitle: { paddingHorizontal: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xs, fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: '33.333%', minHeight: 88, alignItems: 'center', gap: 6, paddingVertical: 6 },
  disc: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  // La elegida: anillo blanco por dentro y tinta por fuera, para que se note sin depender del color.
  discOn: { borderWidth: 3, borderColor: colors.white, outlineWidth: 3, outlineColor: colors.ink, outlineStyle: 'solid' },
  label: { fontSize: 11.5, lineHeight: 14, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
});
