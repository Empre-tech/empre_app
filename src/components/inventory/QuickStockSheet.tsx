import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type AdjustReason, type InventoryItem, type StockLevel, type StockMode } from '@/api/ledger';
import { Button } from '@/components/Button';
import { GroupChooser } from '@/components/inventory/SupplyPicker';
import { Chip } from '@/components/ledger/parts';
import { fmtQty, MODE_LABEL } from '@/lib/inventory';
import { newClientId } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

const LEVELS: { level: StockLevel; label: string; color: string; ink: string }[] = [
  { level: 'ok', label: 'Hay suficiente', color: colors.success, ink: '#1D6B3D' },
  { level: 'low', label: 'Queda poco', color: colors.accent, ink: colors.accentInk },
  { level: 'out', label: 'Se acabó', color: colors.danger, ink: '#B3261E' },
];

const REASONS: { key: AdjustReason; label: string }[] = [
  { key: 'danado', label: 'Se dañó' },
  { key: 'vencido', label: 'Se venció' },
  { key: 'perdida', label: 'Se perdió' },
  { key: 'consumo', label: 'Lo usé yo' },
  { key: 'otro', label: 'Otro' },
];

interface Props {
  entityId: string;
  item: InventoryItem | null;
  onClose: () => void;
  onChanged: () => void;
  /** Abre la ficha completa (solo productos y servicios). */
  onOpenDetail?: (item: InventoryItem) => void;
  /** Grupos de insumos que ya usa el negocio (para cambiar el de un insumo). */
  groups?: string[];
}

/**
 * Ajuste de un toque desde la lista: el semáforo (hay · queda poco · se acabó) o, si se cuenta exacto, cuántos hay.
 * Cada toque se guarda al instante. Lo demás del producto vive en su ficha.
 */
export function QuickStockSheet(props: Props) {
  // Cada ítem abre la hoja desde cero (la llave reinicia el estado).
  if (!props.item) return null;
  return <SheetBody key={props.item.ref} {...props} item={props.item} />;
}

function SheetBody({ entityId, item, onClose, onChanged, onOpenDetail, groups = [] }: Props & { item: InventoryItem }) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(() => (item.counted ? fmtQty(item.qty) : ''));
  const [losing, setLosing] = useState(false);
  const [lose, setLose] = useState('1');
  const [editGroup, setEditGroup] = useState(false);
  // El grupo se ve cambiado al instante (la hoja recibe una copia del ítem).
  const [groupNow, setGroupNow] = useState(item.group ?? '');

  const done = () => {
    onChanged();
    onClose();
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo guardar. Revisa tu conexión.');

  const level = useMutation({ mutationFn: (l: StockLevel) => ledgerApi.setLevel(entityId, item.ref, newClientId(), l), onSuccess: done, onError: fail });
  const mode = useMutation({ mutationFn: (m: StockMode) => ledgerApi.stockSettings(entityId, item.ref, { mode: m }), onSuccess: onChanged, onError: fail });
  const counted = useMutation({ mutationFn: (n: number) => ledgerApi.adjust(entityId, { client_id: newClientId(), ref: item.ref, counted: n }), onSuccess: done, onError: fail });
  const loss = useMutation({
    mutationFn: (v: { n: number; reason: AdjustReason }) => ledgerApi.adjust(entityId, { client_id: newClientId(), ref: item.ref, delta: -v.n, reason: v.reason }),
    onSuccess: done,
    onError: fail,
  });
  const group = useMutation({
    mutationFn: (g: string) => ledgerApi.stockSettings(entityId, item.ref, { group: g }),
    onSuccess: (_d, g) => {
      setGroupNow(g);
      setEditGroup(false);
      onChanged();
    },
    onError: fail,
  });
  const archive = useMutation({ mutationFn: () => ledgerApi.archiveSupply(entityId, item.ref), onSuccess: done, onError: fail });

  const parse = (t: string) => Number(t.replace(',', '.'));
  const n = parse(count);
  const step = (d: number) => setCount(fmtQty(Math.max(0, (Number.isFinite(n) ? n : 0) + d)));
  const unit = !item.unit || item.unit === 'unidad' ? 'unidades' : item.unit;
  const isSupply = item.kind === 'supply';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <Text style={styles.title}>{item.name}</Text>
          {isSupply ? (
            <View style={{ gap: spacing.sm }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: editGroup }} onPress={() => setEditGroup((v) => !v)} style={styles.groupRow}>
                <Text style={styles.metaSmall}>Grupo</Text>
                <Text style={[styles.groupName, !groupNow && { color: colors.muted }]}>{groupNow || 'Sin grupo'}</Text>
                <Text style={styles.link}>{editGroup ? 'Listo' : 'Cambiar'}</Text>
              </Pressable>
              {editGroup ? <GroupChooser groups={groups} value={groupNow} onChange={(g) => group.mutate(g)} /> : null}
            </View>
          ) : null}

          {item.mode === 'light' ? (
            <>
              <Text style={styles.meta}>¿Cuánto queda hoy? Un toque y listo.</Text>
              {LEVELS.map((l) => {
                const on = item.status === l.level;
                return (
                  <Pressable
                    key={l.level}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    disabled={level.isPending}
                    onPress={() => level.mutate(l.level)}
                    style={[styles.level, { borderColor: l.color }, on && { backgroundColor: l.color }]}
                  >
                    <View style={[styles.dot, { backgroundColor: on ? '#fff' : l.color }]} />
                    <Text style={[styles.levelText, { color: on ? '#fff' : l.ink }]}>{l.label}</Text>
                    {on ? <Ionicons name="checkmark" size={20} color="#fff" style={{ marginLeft: 'auto' }} /> : null}
                  </Pressable>
                );
              })}
              {!isSupply ? <Text style={styles.meta}>Si marcas «Se acabó», tus clientes lo ven agotado en tu perfil hasta que vuelva a haber.</Text> : null}
            </>
          ) : null}

          {item.mode === 'exact' ? (
            <>
              <Text style={styles.meta}>{item.counted ? 'Se actualiza solo con ventas y compras. Corrige si al contar no cuadra.' : '¿Cuántos tienes hoy?'}</Text>
              <View style={styles.stepper}>
                <Pressable accessibilityRole="button" accessibilityLabel="Uno menos" onPress={() => step(-1)} style={styles.stepBtn}>
                  <Ionicons name="remove" size={24} color={colors.ink} />
                </Pressable>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <TextInput
                    value={count}
                    onChangeText={setCount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    style={styles.count}
                    accessibilityLabel={`Cuántos ${item.name} hay`}
                  />
                  <Text style={styles.meta}>{unit}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Uno más" onPress={() => step(1)} style={styles.stepBtn}>
                  <Ionicons name="add" size={24} color={colors.ink} />
                </Pressable>
              </View>
              <Button
                title={count.trim() === '' ? 'Escribe cuántos hay' : `Guardar: hay ${count.trim()}`}
                loading={counted.isPending}
                disabled={count.trim() === '' || !Number.isFinite(n) || n < 0 || (item.counted && n === item.qty)}
                onPress={() => counted.mutate(n)}
              />
              {item.counted ? (
                <Pressable accessibilityRole="button" onPress={() => setLosing((v) => !v)} style={styles.linkRow}>
                  <Text style={styles.link}>{losing ? 'Cancelar' : 'Se dañó, venció o perdió algo'}</Text>
                </Pressable>
              ) : null}
              {losing ? (
                <View style={{ gap: spacing.sm }}>
                  <View style={styles.row}>
                    <Text style={styles.meta}>¿Cuántos?</Text>
                    <TextInput value={lose} onChangeText={setLose} keyboardType="decimal-pad" style={styles.small} accessibilityLabel="Cuántos se perdieron" />
                  </View>
                  <View style={styles.wrap}>
                    {REASONS.map((r) => (
                      <Chip key={r.key} label={r.label} selected={false} onPress={() => parse(lose) > 0 && loss.mutate({ n: parse(lose), reason: r.key })} />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {item.mode === 'none' || item.mode === 'unset' ? (
            <Text style={styles.meta}>No llevas la cuenta de {isSupply ? 'este insumo' : 'este producto'}. Si quieres saber cuándo se acaba, elige cómo:</Text>
          ) : (
            <Text style={styles.metaSmall}>Cómo lo controlas</Text>
          )}
          <View style={styles.wrap}>
            {(['light', 'exact', 'none'] as const).map((m) => (
              <Chip key={m} label={MODE_LABEL[m]} selected={item.mode === m} onPress={() => mode.mutate(m)} />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!isSupply && onOpenDetail ? (
            <Pressable accessibilityRole="button" onPress={() => onOpenDetail(item)} style={styles.linkRow}>
              <Text style={styles.link}>Ver todo el producto</Text>
            </Pressable>
          ) : null}
          {isSupply ? <Button title="Quitar de mi lista" variant="ghost" loading={archive.isPending} onPress={() => archive.mutate()} /> : null}
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
  meta: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  metaSmall: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  level: { minHeight: 56, borderRadius: radius.md, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  dot: { width: 14, height: 14, borderRadius: 7 },
  levelText: { fontSize: 16, fontFamily: fonts.ui.extrabold },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: { width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 36, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center', minWidth: 120, paddingVertical: 0 },
  linkRow: { minHeight: 44, justifyContent: 'center', alignSelf: 'center' },
  link: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  small: { minWidth: 80, minHeight: 44, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  groupName: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
