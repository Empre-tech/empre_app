import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SectionPick } from '@/api/sections';
import { Button } from '@/components/Button';
import { SectionChooser } from '@/components/catalog/SectionChooser';
import { Chip } from '@/components/ledger/parts';
import { blocksByGroup, cleanLabel, groupCounts, groupOf, hasExact, searchSupplies } from '@/lib/supplies';
import { colors, fonts, radius, spacing } from '@/theme';

export interface PickerChoice {
  ref: string;
  name: string;
  group?: string;
  status: string;
  /** Aún no existe: se crea al guardar. */
  pending?: boolean;
}

export interface NewSupply {
  key: string;
  name: string;
  /** Nombre de su sección (para mostrar) y su id (para crearlo). */
  group: string;
  sectionId: string;
}

interface Props {
  visible: boolean;
  entityId: string;
  /** Para quién se eligen (el nombre del plato o producto). */
  forName: string;
  choices: PickerChoice[];
  selected: string[];
  onClose: () => void;
  /** Los elegidos y los insumos nuevos que se escribieron aquí (se crean al guardar la ficha). */
  onDone: (refs: string[], created: NewSupply[]) => void;
}

const DOT: Record<string, string> = { ok: colors.success, low: colors.accent, out: colors.danger };

type Row = { type: 'head'; title: string; count: number } | { type: 'item'; item: PickerChoice };

/**
 * Elegir insumos cuando hay cientos: buscar sin tildes, filtrar por sección, marcar varios y crear el que falta
 * (con su sección) sin salir de aquí.
 */
export function SupplyPicker(props: Props) {
  // Se monta al abrir: cada vez arranca con lo elegido en la ficha y sin búsqueda.
  if (!props.visible) return null;
  return <PickerBody {...props} />;
}

function PickerBody({ visible, entityId, forName, choices, selected, onClose, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<string[]>(selected);
  const [created, setCreated] = useState<NewSupply[]>([]);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  // Sección del insumo nuevo (obligatoria).
  const [newSection, setNewSection] = useState<SectionPick | null>(null);

  const all = useMemo<PickerChoice[]>(
    () => [...choices, ...created.map((c) => ({ ref: c.key, name: c.name, group: c.group, status: 'none', pending: true }))],
    [choices, created],
  );
  const groups = useMemo(() => groupCounts(all), [all]);
  const byRef = useMemo(() => new Map(all.map((c) => [c.ref, c])), [all]);

  const q = query.trim();
  const inGroup = group ? all.filter((c) => groupOf(c) === group) : all;
  const rows = useMemo<Row[]>(() => {
    if (q) {
      const found = searchSupplies(inGroup, q);
      return found.length ? [{ type: 'head', title: found.length === 1 ? '1 coincide' : `${found.length} coinciden`, count: -1 }, ...found.map((item) => ({ type: 'item' as const, item }))] : [];
    }
    return blocksByGroup(inGroup).flatMap((b) => [{ type: 'head' as const, title: b.title, count: b.items.length }, ...b.items.map((item) => ({ type: 'item' as const, item }))]);
  }, [inGroup, q]);
  const canCreate = q.length >= 2 && !hasExact(all, q);

  const toggle = (ref: string) => setSel((s) => (s.includes(ref) ? s.filter((r) => r !== ref) : [...s, ref]));
  const create = () => {
    if (!newSection) return;
    const name = cleanLabel(q);
    const key = `new:${Date.now()}`;
    setCreated((c) => [...c, { key, name, group: newSection.name, sectionId: newSection.id }]);
    setSel((s) => [...s, key]);
    setQuery('');
  };

  const createBox = canCreate ? (
    <View style={styles.create}>
      <View style={styles.createHead}>
        <View style={styles.plus}>
          <Ionicons name="add" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.createTitle}>{rows.length ? '¿No es ninguno? ' : ''}Crear «{cleanLabel(q)}»</Text>
          <Text style={styles.meta}>Se crea al guardar y queda en tu lista de Insumos</Text>
        </View>
      </View>
      <Text style={styles.label}>¿En qué sección va?</Text>
      <SectionChooser entityId={entityId} kind="supply" value={newSection} onChange={setNewSection} />
      <Button title={newSection ? 'Agregar' : 'Elige la sección'} disabled={!newSection} onPress={create} />
    </View>
  ) : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sin cambiar" onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Insumos</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {forName || 'Producto nuevo'}
            </Text>
          </View>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={choices.length > 0 ? `Buscar o crear · tienes ${choices.length.toLocaleString('es-CO')}` : 'Escribe el primero, ej. arroz'}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            accessibilityLabel="Buscar o crear un insumo"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {groups.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            <Chip label={`Todos ${all.length}`} selected={group === null} onPress={() => setGroup(null)} />
            {groups.map((g) => (
              <Chip key={g.name} label={`${g.name} ${g.count}`} selected={group === g.name} onPress={() => setGroup(group === g.name ? null : g.name)} />
            ))}
          </ScrollView>
        ) : null}

        {sel.length > 0 ? (
          <View style={styles.picked}>
            <Text style={styles.pickedLabel}>Elegidos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
              {sel.map((ref) => (
                <Pressable key={ref} accessibilityRole="button" accessibilityLabel={`Quitar ${byRef.get(ref)?.name ?? ''}`} onPress={() => toggle(ref)} style={styles.pickedChip}>
                  <Text style={styles.pickedText} numberOfLines={1}>
                    {byRef.get(ref)?.name ?? 'Insumo'}
                  </Text>
                  <Ionicons name="close" size={14} color={colors.primaryDark} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <FlatList
          data={rows}
          keyExtractor={(r, i) => (r.type === 'head' ? `h:${r.title}:${i}` : r.item.ref)}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={30}
          windowSize={9}
          contentContainerStyle={{ paddingBottom: spacing.lg }}
          ListHeaderComponent={rows.length === 0 ? createBox : null}
          ListFooterComponent={rows.length > 0 ? createBox : null}
          ListEmptyComponent={
            !canCreate ? (
              <Text style={[styles.meta, { padding: spacing.lg }]}>
                {choices.length === 0 ? 'Aún no tienes insumos. Escribe arriba el primero.' : 'No hay ninguno así. Escribe al menos 2 letras para crearlo.'}
              </Text>
            ) : null
          }
          renderItem={({ item: r }) => {
            if (r.type === 'head') {
              return <Text style={styles.head}>{r.count >= 0 ? `${r.title} · ${r.count}` : r.title}</Text>;
            }
            const c = r.item;
            const on = sel.includes(c.ref);
            return (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(c.ref)} style={styles.row}>
                <View style={[styles.box, on && styles.boxOn]}>{on ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {c.pending ? `Nuevo${c.group ? ` · ${c.group}` : ''} · se crea al guardar` : q || group ? groupOf(c) : ''}
                  </Text>
                </View>
                <View style={[styles.dot, { backgroundColor: DOT[c.status] ?? colors.line }]} />
              </Pressable>
            );
          }}
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button title={sel.length ? `Listo · ${sel.length} ${sel.length === 1 ? 'insumo' : 'insumos'}` : 'Listo · sin insumos'} onPress={() => onDone(sel, created.filter((c) => sel.includes(c.key)))} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  picked: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
  pickedLabel: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted },
  pickedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#C9D9EF', maxWidth: 180 },
  pickedText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark, flexShrink: 1 },
  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs, fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase', borderTopWidth: 1, borderTopColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 54, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#D5DEEA', alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  name: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  dot: { width: 10, height: 10, borderRadius: 5 },
  create: { margin: spacing.lg, padding: spacing.md, gap: spacing.sm, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#D5DEEA' },
  createHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  createTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  label: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  otherInput: { flex: 1, minHeight: 46, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink, backgroundColor: colors.bg },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
});
