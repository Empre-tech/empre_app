import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { ledgerApi } from '@/api/ledger';
import { Button } from '@/components/Button';
import { GroupChooser } from '@/components/inventory/SupplyPicker';
import { Chip } from '@/components/ledger/parts';
import { fmtQty, normalize } from '@/lib/inventory';
import { newClientId } from '@/lib/ledger';
import { cleanLabel } from '@/lib/supplies';
import { colors, fonts, radius, spacing } from '@/theme';

const UNITS = [
  { key: 'unidad', label: 'Unidades' },
  { key: 'kg', label: 'kg' },
  { key: 'g', label: 'g' },
  { key: 'litro', label: 'Litros' },
  { key: 'ml', label: 'ml' },
];

interface Props {
  visible: boolean;
  entityId: string;
  /** Grupos que ya usa el negocio. */
  groups: string[];
  /** Nombres de los insumos que ya existen (para no repetirlos). */
  existing: string[];
  /** Grupo con el que arranca (el del filtro que se esté viendo). */
  initialGroup?: string;
  onClose: () => void;
  onAdded: () => void;
}

/** Agregar un insumo: nombre, grupo y cómo llevas la cuenta (semáforo, o cuántos hay y en qué unidad). */
export function NewSupplySheet(props: Props) {
  // Se monta al abrir: cada vez arranca vacía.
  if (!props.visible) return null;
  return <Body {...props} />;
}

function Body({ entityId, groups, existing, initialGroup, onClose, onAdded }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [group, setGroup] = useState(initialGroup ?? '');
  const [mode, setMode] = useState<'light' | 'exact'>('light');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('unidad');
  const [error, setError] = useState<string | null>(null);
  const [another, setAnother] = useState(false);

  const n = Number(qty.replace(',', '.'));
  const clean = cleanLabel(name);
  const dup = clean.length >= 2 && existing.some((e) => normalize(e) === normalize(clean));

  const add = useMutation({
    mutationFn: () =>
      ledgerApi.createSupply(entityId, {
        client_id: newClientId(),
        name: clean,
        group: cleanLabel(group) || undefined,
        mode,
        unit,
        ...(mode === 'exact' && qty.trim() !== '' ? { qty: n } : {}),
      }),
    onSuccess: () => {
      onAdded();
      if (another) {
        // Para cargar varios seguidos: mismo grupo y modo, nombre en blanco.
        setName('');
        setQty('');
        setError(null);
        return;
      }
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError && e.status === 400 ? e.message : 'No se pudo guardar. Revisa tu conexión.'),
  });

  const submit = (keepOpen: boolean) => {
    if (clean.length < 2) return setError('Escribe el nombre (mínimo 2 letras).');
    if (dup) return setError(`Ya tienes «${clean}» en tus insumos.`);
    if (mode === 'exact' && qty.trim() !== '' && !(Number.isFinite(n) && n >= 0)) return setError('La cantidad debe ser un número, por ejemplo 12.');
    setError(null);
    setAnother(keepOpen);
    add.mutate();
  };
  const step = (d: number) => setQty(fmtQty(Math.max(0, (Number.isFinite(n) ? n : 0) + d)));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <Text style={styles.title}>Nuevo insumo</Text>
          <Text style={styles.meta}>Lo que gastas para atender o preparar y no vendes solo: ingredientes, vasos, bolsas, tinte…</Text>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Ej. Carne molida"
                placeholderTextColor={colors.muted}
                style={styles.input}
                maxLength={60}
                autoFocus
                autoCapitalize="sentences"
                accessibilityLabel="Nombre del insumo"
              />
              {dup ? <Text style={styles.warn}>Ya tienes «{clean}» en tus insumos.</Text> : null}
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text style={styles.label}>Grupo</Text>
              <GroupChooser groups={groups} value={group} onChange={setGroup} />
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>¿Cómo llevas la cuenta?</Text>
              <View style={styles.seg} accessibilityRole="radiogroup">
                {(
                  [
                    ['light', 'Semáforo', 'hay · poco · no'],
                    ['exact', 'Cuento', 'cuánto hay'],
                  ] as const
                ).map(([k, label, hint]) => (
                  <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: mode === k }} onPress={() => setMode(k)} style={[styles.segBtn, mode === k && styles.segOn]}>
                    <Text style={[styles.segText, mode === k && styles.segTextOn]}>{label}</Text>
                    <Text style={styles.segHint}>{hint}</Text>
                  </Pressable>
                ))}
              </View>
              {mode === 'exact' ? (
                <>
                  <View style={styles.wrap}>
                    {UNITS.map((u) => (
                      <Chip key={u.key} label={u.label} selected={unit === u.key} onPress={() => setUnit(u.key)} />
                    ))}
                  </View>
                  <View style={styles.stepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Uno menos" onPress={() => step(-1)} style={styles.stepBtn}>
                      <Ionicons name="remove" size={22} color={colors.ink} />
                    </Pressable>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <TextInput value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.count} accessibilityLabel="Cuánto tienes hoy" />
                      <Text style={styles.meta}>tienes hoy (opcional)</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="Uno más" onPress={() => step(1)} style={styles.stepBtn}>
                      <Ionicons name="add" size={22} color={colors.ink} />
                    </Pressable>
                  </View>
                </>
              ) : (
                <Text style={styles.meta}>Marcas «hay», «queda poco» o «se acabó» cuando cambie.</Text>
              )}
            </View>
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Button title="Guardar y otro" variant="secondary" disabled={add.isPending} onPress={() => submit(true)} style={{ flex: 1 }} />
            <Button title="Guardar" loading={add.isPending && !another} disabled={add.isPending} onPress={() => submit(false)} style={{ flex: 1 }} />
          </View>
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
  meta: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  label: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  input: { minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: spacing.md, fontSize: 16, fontFamily: fonts.ui.semibold, color: colors.ink },
  warn: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: '#E8EEF6' },
  segBtn: { flex: 1, minHeight: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface },
  segText: { fontSize: 14, fontFamily: fonts.ui.bold, color: '#55657C' },
  segTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  segHint: { fontSize: 11, fontFamily: fonts.ui.bold, color: '#55657C' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 30, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center', minWidth: 120, paddingVertical: 0 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
