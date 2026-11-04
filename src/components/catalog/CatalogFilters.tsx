import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Audience } from '@/lib/catalog';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  /** Las secciones con su conteo, en el orden del negocio (vacío = no se muestran). */
  sections: { section: string; count: number }[];
  /** Cuántos hay en total (para «Todo»). */
  total: number;
  /** Sección elegida ('' = todas). */
  section: string;
  onSection: (s: string) => void;
  /** Filtros «Para» (vacío = no se muestran). */
  audiences?: { key: Audience; label: string; count: number }[];
  audience?: Audience | null;
  onAudience?: (a: Audience | null) => void;
}

/**
 * Los filtros del catálogo que ve el cliente: las secciones como fichas que se deslizan (con 100 secciones la lista
 * no crece: se filtra) y, en ropa, calzado y deporte, «Para: Todos · Hombre · Mujer · Niños».
 */
export function CatalogFilters({ sections, total, section, onSection, audiences = [], audience = null, onAudience }: Props) {
  return (
    <View style={{ gap: spacing.sm }}>
      {sections.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
          {[{ section: '', count: total }, ...sections].map((s) => {
            const on = s.section === section;
            return (
              <Pressable
                key={s.section || 'all'}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${s.section || 'Todo'}, ${s.count}`}
                onPress={() => onSection(s.section)}
                style={[styles.chip, on && styles.chipOn, !on && s.count === 0 && styles.chipEmpty]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {s.section || 'Todo'} <Text style={[styles.count, on && styles.chipTextOn]}>{s.count}</Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {audiences.length > 0 && onAudience ? (
        <View style={styles.audRow} accessibilityRole="radiogroup" accessibilityLabel="Para quién">
          <Text style={styles.audLabel}>Para</Text>
          {[{ key: null, label: 'Todos' }, ...audiences].map((a) => {
            const on = a.key === audience;
            return (
              <Pressable key={a.key ?? 'all'} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onAudience(a.key)} style={[styles.aud, on && styles.audOn]}>
                <Text style={[styles.audText, on && styles.chipTextOn]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  chipEmpty: { opacity: 0.5 },
  chipText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  chipTextOn: { color: colors.selected },
  count: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  audRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  audLabel: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted, marginRight: 2 },
  aud: { minHeight: 34, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.primarySoft, justifyContent: 'center' },
  audOn: { backgroundColor: colors.selectedSoft },
  audText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
});
