import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '@/api/client';
import { ledgerApi, type AdjustReason, type InventoryItem, type StockLevel, type StockMode } from '@/api/ledger';
import { Button } from '@/components/Button';
import { GroupChooser } from '@/components/inventory/SupplyPicker';
import { Chip } from '@/components/ledger/parts';
import { fmtQty, itemLine, missingIngredients, MODE_LABEL } from '@/lib/inventory';
import { formatPesos, newClientId } from '@/lib/ledger';
import { colors, fonts, radius, spacing } from '@/theme';

const LEVELS: { level: StockLevel; label: string; color: string }[] = [
  { level: 'ok', label: 'Hay', color: colors.success },
  { level: 'low', label: 'Queda poco', color: '#D98E04' },
  { level: 'out', label: 'Se acabó', color: colors.danger },
];

const REASONS: { key: AdjustReason; label: string }[] = [
  { key: 'danado', label: 'Se dañó' },
  { key: 'vencido', label: 'Se venció' },
  { key: 'perdida', label: 'Se perdió' },
  { key: 'consumo', label: 'Lo usé yo' },
  { key: 'otro', label: 'Otro' },
];

/** Una fila del inventario. Si es un producto, también ofrece editarlo o quitarlo: producto e inventario son una sola cosa. */
export function StockRow({ entityId, item, onChanged, onError, onEdit, onRetire }: { entityId: string; item: InventoryItem; onChanged: () => void; onError: () => void; onEdit?: () => void; onRetire?: () => void }) {
  const [open, setOpen] = useState(false);
  const exact = item.mode === 'exact';
  const light = item.mode === 'light';
  const controlled = exact || light;
  const usedIn = item.used_in ?? [];
  const missing = missingIngredients(item);
  const blocked = missing.out.length > 0;
  const dot = blocked ? colors.danger : item.status === 'out' ? colors.danger : item.status === 'low' ? '#D98E04' : item.status === 'ok' ? colors.success : colors.line;

  const level = useMutation({
    mutationFn: (l: StockLevel) => ledgerApi.setLevel(entityId, item.ref, newClientId(), l),
    onSuccess: onChanged,
    onError,
  });
  const mode = useMutation({
    mutationFn: (m: StockMode) => ledgerApi.stockSettings(entityId, item.ref, { mode: m }),
    onSuccess: onChanged,
    onError,
  });

  const [pack, setPack] = useState(item.pack_size ? String(item.pack_size) : '');
  const savePack = useMutation({
    mutationFn: (n: number | null) => ledgerApi.stockSettings(entityId, item.ref, n ? { pack_size: n } : { clear_pack: true }),
    onSuccess: onChanged,
    onError,
  });

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}: ${itemLine(item)}`} onPress={() => setOpen((o) => !o)} style={styles.rowHead}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta}>{[item.kind === 'product' && item.price ? formatPesos(item.price) : null, item.mode === 'none' || item.mode === 'unset' ? null : itemLine(item), item.kind === 'supply' && usedIn.length > 0 ? `lo usan ${usedIn.length}` : null].filter(Boolean).join(' · ')}</Text>
          {blocked ? <Text style={styles.warn}>Falta: {missing.out.join(', ')}</Text> : missing.low.length > 0 ? <Text style={styles.warnSoft}>Queda poco: {missing.low.join(', ')}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>

      {light ? (
        <View style={styles.levels}>
          {LEVELS.map((l) => {
            const on = item.status === l.level;
            return (
              <Pressable
                key={l.level}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${item.name}: ${l.label}`}
                disabled={level.isPending}
                onPress={() => level.mutate(l.level)}
                style={[styles.level, { borderColor: l.color }, on && { backgroundColor: l.color }]}
              >
                <Text style={[styles.levelText, { color: on ? '#fff' : l.color }]}>{l.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {exact ? <ExactControls entityId={entityId} item={item} onChanged={onChanged} onError={onError} /> : null}

      {open ? (
        <View style={styles.more}>
          {!controlled ? (
            <Text style={styles.meta}>Este producto no lleva control. Si quieres saber cuándo se acaba, actívalo:</Text>
          ) : (
            <Text style={styles.meta}>Cómo lo controlas</Text>
          )}
          <View style={styles.wrap}>
            {(['light', 'exact', 'none'] as const).map((m) => (
              <Chip key={m} label={MODE_LABEL[m]} selected={item.mode === m} onPress={() => mode.mutate(m)} />
            ))}
          </View>
          <View style={styles.countRow}>
            <Text style={styles.meta}>Viene en pacas de</Text>
            <TextInput
              value={pack}
              onChangeText={setPack}
              onEndEditing={() => {
                const n = Math.round(Number(pack));
                const next = Number.isFinite(n) && n > 1 ? n : null;
                if (next !== (item.pack_size ?? null)) savePack.mutate(next);
              }}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor={colors.muted}
              style={[styles.countInput, { maxWidth: 80 }]}
              accessibilityLabel={`Unidades por paca de ${item.name}`}
            />
            <Text style={styles.meta}>unidades</Text>
          </View>
          {item.kind === 'supply' && usedIn.length > 0 ? <Text style={styles.meta}>Lo usan: {usedIn.map((u) => u.name).join(', ')}</Text> : null}
          {item.sold_28 > 0 ? <Text style={styles.meta}>Vendiste {fmtQty(item.sold_28)} en las últimas 4 semanas.</Text> : null}
          {item.kind === 'supply' ? <ArchiveSupply entityId={entityId} item={item} onChanged={onChanged} onError={onError} /> : null}
          {item.kind === 'product' && (onEdit || onRetire) ? (
            <View style={styles.countRow}>
              {onEdit ? <Button title="Editar" variant="secondary" onPress={onEdit} style={{ flex: 1 }} /> : null}
              {onRetire ? <Button title="Quitar" variant="ghost" onPress={onRetire} style={{ flex: 1 }} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Cantidad exacta: contar («tengo 12») o restar lo que se dañó, venció o se perdió (con motivo, para saber cuánto pierdes). */
function ExactControls({ entityId, item, onChanged, onError }: { entityId: string; item: InventoryItem; onChanged: () => void; onError: () => void }) {
  const [counting, setCounting] = useState(item.status === 'unknown');
  const [text, setText] = useState(item.counted ? fmtQty(item.qty) : '');
  const [losing, setLosing] = useState(false);
  const [lose, setLose] = useState('1');

  const parse = (t: string) => Number(t.replace(',', '.'));
  const count = useMutation({
    mutationFn: (n: number) => ledgerApi.adjust(entityId, { client_id: newClientId(), ref: item.ref, counted: n }),
    onSuccess: () => {
      setCounting(false);
      onChanged();
    },
    onError,
  });
  const loss = useMutation({
    mutationFn: (v: { n: number; reason: AdjustReason }) => ledgerApi.adjust(entityId, { client_id: newClientId(), ref: item.ref, delta: -v.n, reason: v.reason }),
    onSuccess: () => {
      setLosing(false);
      setLose('1');
      onChanged();
    },
    onError,
  });

  if (counting) {
    const n = parse(text);
    return (
      <View style={styles.countBox}>
        <Text style={styles.meta}>{item.status === 'unknown' ? '¿Cuántos tienes hoy?' : 'Cuenta de nuevo y escribe cuántos hay'}</Text>
        <View style={styles.countRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            style={styles.countInput}
            accessibilityLabel={`Cuántos ${item.name} hay`}
            autoFocus={item.status !== 'unknown'}
          />
          <Button title="Guardar" loading={count.isPending} disabled={text.trim() === '' || !Number.isFinite(n) || n < 0} onPress={() => count.mutate(n)} style={{ minWidth: 110 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.exactRow}>
        <Text style={styles.exactQty}>{fmtQty(item.qty)}</Text>
        <Text style={styles.meta}>{item.unit || 'unidades'}</Text>
        <View style={{ flex: 1 }} />
        <Chip label="Contar" icon="create-outline" selected={false} onPress={() => setCounting(true)} />
        <Chip label="Se perdió algo" icon="remove-circle-outline" selected={losing} onPress={() => setLosing((v) => !v)} />
      </View>
      {losing ? (
        <View style={styles.countBox}>
          <View style={styles.countRow}>
            <Text style={styles.meta}>¿Cuántos?</Text>
            <TextInput value={lose} onChangeText={setLose} keyboardType="decimal-pad" style={[styles.countInput, { maxWidth: 90 }]} accessibilityLabel="Cuántos se perdieron" />
          </View>
          <Text style={styles.meta}>¿Qué pasó?</Text>
          <View style={styles.wrap}>
            {REASONS.map((r) => (
              <Chip key={r.key} label={r.label} selected={false} onPress={() => parse(lose) > 0 && loss.mutate({ n: parse(lose), reason: r.key })} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ArchiveSupply({ entityId, item, onChanged, onError }: { entityId: string; item: InventoryItem; onChanged: () => void; onError: () => void }) {
  const archive = useMutation({ mutationFn: () => ledgerApi.archiveSupply(entityId, item.ref), onSuccess: onChanged, onError });
  return <Button title="Quitar de mi lista" variant="ghost" loading={archive.isPending} onPress={() => archive.mutate()} />;
}

/** Insumos: lo que no vendes pero se gasta (lechuga, vasos, harina). Se agregan escribiendo el nombre. */
export function AddSupply({ entityId, groups = [], onAdded, onError }: { entityId: string; groups?: string[]; onAdded: () => void; onError: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [group, setGroup] = useState('');
  const add = useMutation({
    mutationFn: (n: string) => ledgerApi.createSupply(entityId, { client_id: newClientId(), name: n, mode: 'light', group: group || undefined }),
    onSuccess: () => {
      setName('');
      setProblem(null);
      setOpen(false);
      onAdded();
    },
    onError: (e) => {
      // Un 400 trae el motivo en palabras (por ejemplo, que ese nombre ya es un producto).
      if (e instanceof ApiError && e.status === 400) setProblem(e.message);
      else onError();
    },
  });
  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.supplyLink}>
        <Ionicons name="leaf-outline" size={18} color={colors.primary} />
        <Text style={styles.link}>Agregar un insumo (algo que gastas pero no vendes)</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.add}>
      <Text style={styles.sectionTitle}>Insumos: lo que gastas y no vendes</Text>
      <Text style={styles.meta}>Ingredientes, vasos, bolsas… Si lo vendes, no va aquí: agrégalo como producto.</Text>
      {problem ? <Text style={styles.error}>{problem}</Text> : null}
      <View style={styles.countRow}>
        <TextInput value={name} onChangeText={setName} placeholder="Ej. lechuga" placeholderTextColor={colors.muted} style={[styles.countInput, { textAlign: 'left' }]} maxLength={60} accessibilityLabel="Nombre del insumo" />
        <Button title="Agregar" loading={add.isPending} disabled={name.trim().length < 2} onPress={() => add.mutate(name.trim())} style={{ minWidth: 110 }} />
      </View>
      <Text style={styles.meta}>Grupo (opcional): así lo encuentras rápido cuando tengas muchos.</Text>
      <GroupChooser groups={groups} value={group} onChange={setGroup} />
    </View>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  link: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.primary, paddingVertical: spacing.xs },
  sectionTitle: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  row: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { fontSize: 15.5, fontFamily: fonts.ui.bold, color: colors.ink },
  warn: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.danger },
  warnSoft: { fontSize: 13, fontFamily: fonts.ui.bold, color: '#B87400' },
  meta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  levels: { flexDirection: 'row', gap: spacing.sm },
  level: { flex: 1, minHeight: 48, borderWidth: 2, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  levelText: { fontSize: 14, fontFamily: fonts.ui.bold, textAlign: 'center' },
  more: { gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  exactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  exactQty: { fontSize: 28, fontFamily: fonts.display.bold, color: colors.ink },
  countBox: { gap: spacing.sm },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countInput: { flex: 1, minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 18, fontFamily: fonts.ui.bold, color: colors.ink, backgroundColor: colors.bg, textAlign: 'center' },
  supplyLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  add: { gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
});
