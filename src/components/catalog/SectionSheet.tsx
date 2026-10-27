import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/ledger/parts';
import { normalize } from '@/lib/inventory';
import { cleanLabel } from '@/lib/supplies';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  visible: boolean;
  value: string;
  /** Las secciones que el negocio ya usa, con cuántos productos tiene cada una. */
  sections: { name: string; count: number }[];
  /** Ideas según el tipo de negocio (solo las que aún no usa). */
  ideas: string[];
  onPick: (section: string) => void;
  onClose: () => void;
}

/**
 * Elegir la sección de un producto: primero las tuyas (para no repetir «Bebidas» y «bebidas»), buscar o crear una
 * nueva, e ideas según tu tipo de negocio. Un toque elige y cierra.
 */
export function SectionSheet(props: Props) {
  // Se monta al abrir, así la búsqueda arranca vacía cada vez.
  if (!props.visible) return null;
  return <SectionBody {...props} />;
}

function SectionBody({ visible, value, sections, ideas, onPick, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const q = normalize(query);
  const mine = useMemo(() => (q ? sections.filter((s) => normalize(s.name).includes(q)) : sections), [sections, q]);
  const fresh = useMemo(() => {
    const used = new Set(sections.map((s) => normalize(s.name)));
    return ideas.filter((i) => !used.has(normalize(i)) && (!q || normalize(i).includes(q)));
  }, [ideas, sections, q]);
  const canCreate = cleanLabel(query).length >= 2 && !sections.some((s) => normalize(s.name) === q) && !ideas.some((i) => normalize(i) === q);
  const pick = (s: string) => {
    onPick(s);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <Text style={styles.title}>¿En qué sección va?</Text>
          <Text style={styles.meta}>Así se agrupa en tu perfil y en tu lista.</Text>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar o crear sección"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              maxLength={40}
              autoCapitalize="sentences"
              accessibilityLabel="Buscar o crear sección"
              onSubmitEditing={() => canCreate && pick(cleanLabel(query))}
            />
          </View>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm }}>
            {canCreate ? (
              <Pressable accessibilityRole="button" onPress={() => pick(cleanLabel(query))} style={styles.createRow}>
                <Ionicons name="add-circle" size={22} color={colors.primary} />
                <Text style={styles.createText}>Crear «{cleanLabel(query)}»</Text>
              </Pressable>
            ) : null}

            {mine.length > 0 ? <Text style={styles.label}>Tus secciones</Text> : null}
            <View accessibilityRole="radiogroup">
              {mine.map((s) => {
                const on = normalize(s.name) === normalize(value);
                return (
                  <Pressable key={s.name} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => pick(s.name)} style={styles.row}>
                    <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                    <Text style={styles.name}>{s.name}</Text>
                    <Text style={styles.meta}>{s.count}</Text>
                  </Pressable>
                );
              })}
              {!q ? (
                <Pressable accessibilityRole="radio" accessibilityState={{ checked: value.trim() === '' }} onPress={() => pick('')} style={styles.row}>
                  <View style={[styles.radio, value.trim() === '' && styles.radioOn]}>{value.trim() === '' ? <View style={styles.radioDot} /> : null}</View>
                  <Text style={[styles.name, { color: colors.muted }]}>Sin sección</Text>
                </Pressable>
              ) : null}
            </View>

            {fresh.length > 0 ? (
              <>
                <Text style={styles.label}>{sections.length ? 'Otras ideas' : 'Ideas para empezar'}</Text>
                <View style={styles.wrap}>
                  {fresh.map((i) => (
                    <Chip key={i} label={i} icon="add" selected={false} onPress={() => pick(i)} />
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center' },
  title: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  label: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 50, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B9C6D8', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  createText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
