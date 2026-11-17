import { Ionicons } from '@/components/Icon';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi } from '@/api/ledger';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { fmtQty, unitFor } from '@/lib/inventory';
import { countDiffs, countDraftKey, countPayload, countRows, matches, parseCount, readDraft, type CountDraft, type CountEntry, type CountReason, type CountRow } from '@/lib/inventoryCount';
import { formatPesos, newClientId } from '@/lib/ledger';
import { getPhoneFlag, setPhoneFlag } from '@/lib/phoneFlags';
import { colors, fonts, radius, spacing } from '@/theme';

type Level = 'ok' | 'low' | 'out';
const LEVELS: { key: Level; label: string }[] = [
  { key: 'ok', label: 'Hay' },
  { key: 'low', label: 'Poco' },
  { key: 'out', label: 'Se acabó' },
];
const LEVEL_TEXT: Record<Level, string> = { ok: 'Hay', low: 'Queda poco', out: 'Se acabó' };
const REASONS: { key: CountReason; label: string }[] = [
  { key: 'conteo', label: 'Fue el conteo' },
  { key: 'danado', label: 'Se dañó' },
  { key: 'vencido', label: 'Venció' },
  { key: 'perdida', label: 'Se perdió' },
];

type Item = { type: 'group'; key: string; name: string } | { type: 'row'; key: string; row: CountRow };

/**
 * Contar una sección (tablero «Inventario», teléfonos 10 y 11). Casi todo cuadra, así que «Igual» cuenta en un toque; si
 * no, se escribe cuántos hay (o se elige hay / poco / se acabó en lo que va por semáforo). Lo que llevas se guarda en el
 * teléfono: si te interrumpen, sigues donde ibas. Antes de guardar se revisa solo lo que no cuadra, con su motivo; se
 * guarda todo junto y lo vendido mientras contabas no se pierde (el servidor aplica la diferencia frente a lo que había
 * al empezar).
 */
export default function CountScreen() {
  const params = useLocalSearchParams<{ entityId: string; tab?: string; section?: string }>();
  const entityId = params.entityId ?? '';
  const tab: 'product' | 'supply' = params.tab === 'supply' ? 'supply' : 'product';
  const section = params.section ?? '';
  const draftKey = countDraftKey(entityId);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<CountDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<'count' | 'review' | 'done'>('count');
  const [editing, setEditing] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ changed: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sigue el conteo a medias de esta sección; si no hay, trae la sección completa (de 100 en 100) y empieza uno.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const saved = readDraft(await getPhoneFlag(draftKey));
      if (saved && saved.tab === tab && saved.section === section) {
        if (alive) setDraft(saved);
        return;
      }
      try {
        const items = [];
        const variants = [];
        let cursor: string | undefined;
        for (let i = 0; i < 10; i++) {
          const p = await ledgerApi.inventoryPage(entityId, { tab, section, cursor, limit: 100 });
          items.push(...p.items);
          variants.push(...p.variants);
          if (!p.next_cursor) break;
          cursor = p.next_cursor;
        }
        if (alive) setDraft({ v: 1, clientId: newClientId(), tab, section, startedAt: new Date().toISOString(), rows: countRows(items, variants), entries: {}, reasons: {} });
      } catch {
        if (alive) setLoadError('No pudimos traer esta sección. Revisa tu conexión e inténtalo de nuevo.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [entityId, tab, section, draftKey]);

  // Lo que llevas se guarda en el teléfono mientras cuentas (si ya marcaste algo).
  useEffect(() => {
    if (!draft || step === 'done' || Object.keys(draft.entries).length === 0) return;
    const t = setTimeout(() => void setPhoneFlag(draftKey, JSON.stringify(draft)), 400);
    return () => clearTimeout(t);
  }, [draft, draftKey, step]);

  const rows = useMemo(() => draft?.rows ?? [], [draft]);
  const entries = useMemo(() => draft?.entries ?? {}, [draft]);
  const reasons = useMemo(() => draft?.reasons ?? {}, [draft]);
  const done = rows.filter((r) => entries[r.ref]).length;
  const list: Item[] = useMemo(() => {
    const out: Item[] = [];
    let group: string | undefined;
    for (const r of rows) {
      if (r.group && r.group !== group) out.push({ type: 'group', key: `g:${r.ref}`, name: r.group });
      group = r.group;
      out.push({ type: 'row', key: r.ref, row: r });
    }
    return out;
  }, [rows]);
  const diffs = useMemo(() => countDiffs(rows, entries), [rows, entries]);

  const setEntry = (ref: string, entry: CountEntry | undefined) =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d.entries };
      if (entry) next[ref] = entry;
      else delete next[ref];
      return { ...d, entries: next };
    });
  const setReason = (ref: string, r: CountReason) => setDraft((d) => (d ? { ...d, reasons: { ...d.reasons, [ref]: r } } : d));
  const startEdit = (row: CountRow) => {
    const e = entries[row.ref];
    setTexts((t) => ({ ...t, [row.ref]: e && 'counted' in e ? fmtQty(e.counted) : row.expected !== null ? fmtQty(row.expected) : '' }));
    setEditing(row.ref);
  };
  const typeCount = (row: CountRow, text: string) => {
    setTexts((t) => ({ ...t, [row.ref]: text }));
    const n = parseCount(text);
    setEntry(row.ref, n === null ? undefined : { counted: n });
  };
  const step1 = (row: CountRow, by: number) => {
    const e = entries[row.ref];
    const from = e && 'counted' in e ? e.counted : (row.expected ?? 0);
    const n = Math.max(0, Math.round((from + by) * 1000) / 1000);
    setEntry(row.ref, { counted: n });
    setTexts((t) => ({ ...t, [row.ref]: fmtQty(n) }));
    setEditing(row.ref);
  };

  const save = useMutation({
    mutationFn: () => ledgerApi.countSection(entityId, { client_id: (draft as CountDraft).clientId, tab, section, lines: countPayload(rows, entries, reasons) }),
    onSuccess: (r) => {
      void setPhoneFlag(draftKey, '');
      void qc.invalidateQueries({ queryKey: ['ledger', entityId] });
      setResult({ changed: r.changed });
      setStep('done');
    },
    onError: () => setSaveError('No se pudo guardar. Tu conteo sigue en el teléfono: inténtalo de nuevo.'),
  });

  const title = `Contar ${section}`;
  if (loadError) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title={title} />
        <EmptyState icon="cloud-offline-outline" title="No pudimos traer esta sección" body={loadError} action={{ title: 'Volver', onPress: () => router.back() }} />
      </View>
    );
  }
  if (!draft) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title={title} />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.ink} />
      </View>
    );
  }
  if (rows.length === 0) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title={title} />
        <EmptyState icon="cube-outline" title="Aquí no hay nada que contar" body="En esta sección solo hay servicios o cosas que no llevas en el inventario." action={{ title: 'Volver', onPress: () => router.back() }} />
      </View>
    );
  }

  if (step === 'done') {
    const n = result?.changed ?? 0;
    return (
      <View style={styles.screen}>
        <SubScreenHeader title={title} />
        <View style={styles.doneWrap} accessibilityLiveRegion="polite">
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={28} color={colors.ink} />
          </View>
          <Text style={styles.doneTitle}>{`${section} contada`}</Text>
          <Text style={styles.meta}>{n === 0 ? 'Todo cuadraba: no hubo que cambiar nada.' : n === 1 ? '1 cambio guardado. Tus existencias ya están al día.' : `${n} cambios guardados. Tus existencias ya están al día.`}</Text>
          <Button title="Volver al inventario" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  if (step === 'review') {
    const mismatched = diffs.filter((d) => !d.first).length;
    const firsts = diffs.length - mismatched;
    const notCounted = rows.length - done;
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Revisar el conteo" />
        <FlatList
          data={diffs}
          keyExtractor={(d) => d.row.ref}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: 0 }}
          ListHeaderComponent={
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{`${section} · ${done} ${done === 1 ? 'contado' : 'contados'}`}</Text>
              <Text style={styles.meta}>
                {[mismatched === 0 ? 'Todo cuadra' : `${mismatched} no ${mismatched === 1 ? 'cuadra' : 'cuadran'}`, firsts > 0 ? `${firsts} por primera vez` : null, notCounted > 0 ? `${notCounted} sin contar quedan como estaban` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          }
          renderItem={({ item: d, index }) => {
            const r = d.row;
            const label = r.group ? `${r.group} · ${r.name}` : r.name;
            if (d.level) {
              return (
                <View style={[styles.diffRow, index > 0 && styles.line]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={styles.meta}>{`Antes: ${LEVEL_TEXT[r.level]}`}</Text>
                  </View>
                  <Text style={[styles.delta, d.level !== 'ok' && styles.red]}>{LEVEL_TEXT[d.level]}</Text>
                </View>
              );
            }
            const loss = !d.first && d.delta < 0;
            const money = loss && r.cost ? ` · ${formatPesos(Math.round(r.cost * Math.abs(d.delta)))}` : '';
            return (
              <View style={[index > 0 && styles.line]}>
                <View style={styles.diffRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={styles.meta}>{d.first ? 'Primer conteo' : `Había ${fmtQty(r.expected ?? 0)} · contaste ${fmtQty(d.counted ?? 0)}${money}`}</Text>
                  </View>
                  <Text style={[styles.delta, loss && styles.red]}>
                    {d.first ? `${fmtQty(d.counted ?? 0)} ${unitFor(r.unit, d.counted ?? 0)}` : `${d.delta > 0 ? '+' : '−'}${fmtQty(Math.abs(d.delta))}`}
                  </Text>
                </View>
                {loss ? (
                  <View style={styles.reasons} accessibilityLabel={`Por qué falta ${label}`}>
                    {REASONS.map((x) => {
                      const on = (reasons[r.ref] ?? 'conteo') === x.key;
                      return (
                        <Pressable key={x.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setReason(r.ref, x.key)} style={[styles.reason, on && styles.reasonOn]}>
                          <Text style={styles.reasonText}>{x.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          }}
          ListFooterComponent={
            <View style={{ gap: spacing.sm, paddingTop: spacing.md }}>
              <Text style={styles.meta}>Si entró una venta mientras contabas, no se pierde: se guarda la diferencia frente a lo que había al empezar. Lo dañado, vencido o perdido cuenta como pérdida.</Text>
              {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
            </View>
          }
        />
        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button title="Guardar el conteo" loading={save.isPending} onPress={() => save.mutate()} />
          <Pressable accessibilityRole="button" onPress={() => setStep('count')} style={styles.linkRow}>
            <Text style={styles.link}>Seguir contando</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SubScreenHeader title={title} />
      <View style={styles.progressWrap}>
        <View style={styles.progressRow}>
          <Text style={styles.meta}>Toca «Igual» si coincide. Si no, escribe cuántos hay.</Text>
          <Text style={styles.progressText} accessibilityLabel={`Llevas ${done} de ${rows.length}`}>{`${done} de ${rows.length}`}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round((done / rows.length) * 100)}%` }]} />
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(i) => i.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        initialNumToRender={16}
        windowSize={9}
        renderItem={({ item, index }) => {
          if (item.type === 'group') {
            return (
              <Text style={[styles.groupTitle, index > 0 && styles.line]} accessibilityRole="header">
                {item.name}
              </Text>
            );
          }
          const r = item.row;
          const e = entries[r.ref];
          const first = index === 0 || list[index - 1]?.type === 'group';
          const indent = Boolean(r.group);
          if (r.kind === 'light') {
            const chosen = e && 'level' in e ? e.level : undefined;
            return (
              <View style={[styles.row, !first && styles.line, indent && styles.child]}>
                <View style={styles.rowMain}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.meta}>{`Ahora: ${LEVEL_TEXT[r.level]}`}</Text>
                </View>
                <View style={styles.levels}>
                  {LEVELS.map((l) => (
                    <Pressable
                      key={l.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.name}: ${l.label}`}
                      accessibilityState={{ selected: chosen === l.key }}
                      onPress={() => setEntry(r.ref, chosen === l.key ? undefined : { level: l.key })}
                      style={[styles.levelChip, chosen === l.key && styles.levelOn]}
                    >
                      <Text style={styles.levelText}>{l.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          }
          const counted = e && 'counted' in e ? e.counted : undefined;
          const ok = matches(r, e);
          const showStepper = editing === r.ref || (counted !== undefined && !ok) || (r.expected === null && counted === undefined);
          const sub = r.expected !== null ? `Debería haber ${fmtQty(r.expected)} ${unitFor(r.unit, r.expected)}` : 'Sin contar todavía: escribe cuántos hay';
          return (
            <View style={[styles.row, !first && styles.line, indent && styles.child]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${r.name}. ${sub}. Escribir cuántos hay`} onPress={() => startEdit(r)} style={styles.rowMain}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={styles.meta}>{sub}</Text>
              </Pressable>
              {showStepper ? (
                <View style={styles.stepper}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Uno menos de ${r.name}`} onPress={() => step1(r, -1)} style={styles.stepBtn}>
                    <Ionicons name="remove" size={18} color={colors.ink} />
                  </Pressable>
                  <TextInput
                    value={texts[r.ref] ?? (counted !== undefined ? fmtQty(counted) : '')}
                    onChangeText={(t) => typeCount(r, t)}
                    onFocus={() => setEditing(r.ref)}
                    onBlur={() => setEditing((cur) => (cur === r.ref ? null : cur))}
                    keyboardType={tab === 'supply' ? 'decimal-pad' : 'number-pad'}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel={`Cuántos ${r.name} hay`}
                    style={[styles.input, counted !== undefined && !ok && r.expected !== null && styles.inputOff]}
                    selectTextOnFocus
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Uno más de ${r.name}`} onPress={() => step1(r, 1)} style={styles.stepBtn}>
                    <Ionicons name="add" size={18} color={colors.ink} />
                  </Pressable>
                </View>
              ) : ok && counted !== undefined ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`${r.name}: ${fmtQty(counted)}, cuadra. Cambiar`} onPress={() => startEdit(r)} style={styles.doneChip}>
                  <Ionicons name="checkmark" size={16} color={colors.finance} />
                  <Text style={styles.doneNum}>{fmtQty(counted)}</Text>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={`${r.name}: hay ${fmtQty(r.expected ?? 0)}, igual`} onPress={() => setEntry(r.ref, { counted: r.expected ?? 0 })} style={styles.igual}>
                  <Text style={styles.igualText}>Igual</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title={diffs.length > 0 ? 'Revisar lo que no cuadra' : 'Revisar el conteo'} disabled={done === 0} onPress={() => setStep('review')} />
        <Text style={styles.bottomNote}>Se guarda en el teléfono mientras cuentas</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  progressWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressText: { marginLeft: 'auto', fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted, fontVariant: ['tabular-nums'] },
  // La barra de avance: forma roja sobre arena (el rojo de referencia solo en formas).
  track: { height: 4, borderRadius: 2, backgroundColor: colors.sand, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.brandRef },
  meta: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  groupTitle: { paddingTop: spacing.md, paddingBottom: 4, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  child: { marginLeft: spacing.lg },
  rowMain: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: spacing.sm, justifyContent: 'center', gap: 1 },
  name: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  igual: { minHeight: 40, minWidth: 64, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  igualText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  doneChip: { minHeight: 44, minWidth: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  doneNum: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink, fontVariant: ['tabular-nums'] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  input: { minWidth: 52, height: 40, paddingHorizontal: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.line, textAlign: 'center', fontSize: 16, fontFamily: fonts.ui.semibold, color: colors.ink },
  // No cuadra con lo que había: anillo rojo (forma) y el número en rojo de texto.
  inputOff: { borderColor: colors.brandRef, color: colors.primaryDark },
  levels: { flexDirection: 'row', gap: 4 },
  levelChip: { minHeight: 40, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, justifyContent: 'center' },
  levelOn: { backgroundColor: colors.sand, borderColor: colors.sand },
  levelText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  bottom: { paddingTop: spacing.md, paddingHorizontal: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg, gap: 6 },
  bottomNote: { textAlign: 'center', fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  summary: { gap: 2, padding: spacing.md, marginBottom: spacing.sm, borderRadius: 16, backgroundColor: colors.well },
  summaryTitle: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 },
  delta: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink, fontVariant: ['tabular-nums'] },
  red: { color: colors.primaryDark },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: spacing.md },
  reason: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, justifyContent: 'center' },
  reasonOn: { backgroundColor: colors.sand, borderColor: colors.sand },
  reasonText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  linkRow: { minHeight: 44, justifyContent: 'center', alignSelf: 'center' },
  link: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 20, fontFamily: fonts.ui.semibold, color: colors.ink, textAlign: 'center' },
});
