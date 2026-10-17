import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Category } from '@/api/types';
import { categoryColor } from '@/lib/categoryColor';
import type { CategoryGroup, GroupId } from '@/lib/categoryGroups';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  groups: CategoryGroup<Category>[];
  groupId?: GroupId;
  categoryId?: string;
  onGroup: (id: GroupId | undefined) => void;
  onCategory: (id: string | undefined) => void;
  onSeeAll: () => void;
  /** Lo que va antes de los grupos en la primera fila (la cápsula de la zona). */
  leading?: React.ReactNode;
  /** Filtros que no son de categoría (subcategoría, distancia, abiertos), tras los grupos. */
  trailing?: React.ReactNode;
}

/**
 * Los grupos de categorías, arriba junto a la zona: cinco píldoras de texto, sin discos. Al elegir un grupo (que
 * filtra por todas sus categorías) aparece una segunda fila con sus categorías para afinar. El grupo elegido lleva
 * una ✕ y se quita tocándolo de nuevo.
 */
export function GroupRow({ groups, groupId, categoryId, onGroup, onCategory, onSeeAll, leading, trailing }: Props) {
  const group = groups.find((g) => g.id === groupId);
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row} style={styles.scroll}>
        {leading}
        {groups.map((g) => {
          const on = g.id === groupId;
          return (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={on ? `${g.name}, activo` : g.name}
              accessibilityHint={on ? 'Toca para quitar el filtro' : `Muestra sus ${g.categories.length} categorías`}
              onPress={() => onGroup(on ? undefined : g.id)}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
              style={[styles.pill, on && styles.pillOn]}
            >
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{g.name}</Text>
              {on ? (
                <Text style={styles.x} accessible={false}>
                  ×
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Ver todas las categorías" onPress={onSeeAll} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }} style={styles.pill}>
          <Text style={styles.pillText}>Ver todas ›</Text>
        </Pressable>
        {trailing}
      </ScrollView>
      {group ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row} style={styles.scroll} accessibilityLabel={`Categorías de ${group.name}`}>
          {group.categories.map((c) => {
            const on = c.id === categoryId;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c.name}
                accessibilityHint={on ? 'Toca para volver a todo el grupo' : undefined}
                onPress={() => onCategory(on ? undefined : c.id)}
                hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                style={[styles.small, on && styles.smallOn]}
              >
                <View style={[styles.dot, { backgroundColor: categoryColor(c.color).fg }]} />
                <Text style={[styles.smallText, on && styles.smallTextOn]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md },
  pill: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow },
  pillOn: { backgroundColor: colors.ink, paddingRight: 8 },
  pillText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  pillTextOn: { color: '#fff' },
  x: { fontSize: 18, lineHeight: 20, fontFamily: fonts.ui.extrabold, color: '#fff' },
  small: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.92)' },
  smallOn: { backgroundColor: colors.primary },
  smallText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  smallTextOn: { color: '#fff' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
