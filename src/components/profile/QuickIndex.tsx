import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { sectionLabel, type SectionId } from '@/lib/profileLayout';
import { colors, fonts, spacing } from '@/theme';

interface Props {
  sections: SectionId[];
  active: SectionId;
  onGo: (id: SectionId) => void;
  /** Cómo se llama el catálogo de este negocio («Carta», «Productos»…). */
  catalogNoun?: string;
  /**
   * Con el índice fijo arriba, el botón atrás va en su mismo renglón (3.28): antes flotaba encima y tapaba el primer
   * chip. Sin esto (el índice todavía no está fijo) no se dibuja: la portada tiene el suyo.
   */
  onBack?: () => void;
}

/**
 * El índice rápido del perfil: «Ofertas · Carta · Fotos · Reseñas · Info». Un toque lleva al apartado y el que se está
 * viendo queda marcado. Va fijo bajo la portada.
 */
export function QuickIndex({ sections, active, onGo, catalogNoun, onBack }: Props) {
  return (
    <View style={styles.bar}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row} accessibilityLabel="Ir a un apartado">
        {sections.map((id) => {
          const on = id === active;
          const label = sectionLabel(id, catalogNoun);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Ir a ${label}`}
              onPress={() => onGo(id)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.text, on && styles.textOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: spacing.md, paddingLeft: spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  scroll: { flex: 1 },
  row: { gap: 2, paddingHorizontal: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 12, borderBottomWidth: 3, borderBottomColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderBottomColor: colors.brand },
  text: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.muted },
  textOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
});
