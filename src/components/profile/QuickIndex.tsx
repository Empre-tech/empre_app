import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SECTION_LABEL, type SectionId } from '@/lib/profileLayout';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  sections: SectionId[];
  active: SectionId;
  onGo: (id: SectionId) => void;
}

/**
 * El índice rápido del perfil: «Ofertas · Servicios · Fotos · Reseñas». Un toque lleva a la sección y la que se está
 * viendo queda marcada. Va fijo bajo la portada cuando el perfil tiene 3 o más secciones.
 */
export function QuickIndex({ sections, active, onGo }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row} accessibilityLabel="Ir a una sección">
      {sections.map((id) => {
        const on = id === active;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Ir a ${SECTION_LABEL[id]}`}
            onPress={() => onGo(id)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.text, on && styles.textOn]}>{SECTION_LABEL[id]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: spacing.md },
  row: { gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  text: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  textOn: { color: '#fff' },
});
