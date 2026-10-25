import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { ledgerApi, type VoiceAction, type VoiceResult } from '@/api/ledger';
import { Button } from '@/components/Button';
import { AmountField, Chip, MethodChips, PartyPicker } from '@/components/ledger/parts';
import { categoryLabel, formatPesos } from '@/lib/ledger';
import { invalidateLedger } from '@/ledger/ledgerStore';
import { speechAvailable, startDictation } from '@/ledger/speech';
import { colors, fonts, radius, spacing } from '@/theme';

const TYPE_LABEL: Record<VoiceAction['type'], string> = { sale: 'Venta', expense: 'Gasto', payment: 'Abono' };
const TYPE_ICON: Record<VoiceAction['type'], keyof typeof Ionicons.glyphMap> = { sale: 'cash-outline', expense: 'arrow-down-circle-outline', payment: 'swap-horizontal-outline' };

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'El dictado no está disponible en este momento. Registra a mano mientras tanto.';
    if (e.status === 429) return 'Llegaste al límite de dictados de este mes. Puedes seguir registrando a mano.';
    if (e.status === 0) return 'El dictado necesita conexión a internet.';
    return e.message;
  }
  return 'No pudimos interpretar el dictado. Inténtalo de nuevo.';
}

/** ¿Falta algo para poder confirmar esta tarjeta? Devuelve el motivo o null. */
export function actionProblem(a: VoiceAction): string | null {
  if (a.amount <= 0) return 'Falta el monto.';
  const needsParty = a.method === 'credit' || a.type === 'payment';
  if (needsParty && !a.party_id && !(a.new_party && a.party_name?.trim())) {
    return a.candidates?.length ? 'Elige a quién.' : a.type === 'payment' ? 'No sé quién abonó.' : 'Falta el cliente o proveedor.';
  }
  return null;
}

/**
 * Dictado: el dueño habla (o escribe) lo que pasó en el día y la IA lo convierte en tarjetas. NADA se guarda hasta que
 * confirma: cada tarjeta muestra el monto en letras, el medio de pago y a quién, con las dudas marcadas. Solo viaja el
 * texto, nunca el audio.
 */
export function VoiceSheet({ entityId, visible, onClose, hints }: { entityId: string; visible: boolean; onClose: () => void; hints: string[] }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [actions, setActions] = useState<VoiceAction[]>([]);
  const [done, setDone] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const canSpeak = speechAvailable();

  useEffect(() => {
    if (visible) {
      setText('');
      setError(null);
      setResult(null);
      setActions([]);
      setDone(false);
      setBusy(false);
    } else {
      stopRef.current?.();
    }
  }, [visible]);

  const listen = async () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setError(null);
    setListening(true);
    const stop = await startDictation(
      {
        onText: (t) => setText(t),
        onEnd: () => setListening(false),
        onError: (m) => {
          setError(m);
          setListening(false);
        },
      },
      hints,
    );
    if (stop) stopRef.current = stop;
    else setListening(false);
  };

  const interpret = async () => {
    const t = text.trim();
    if (!t || busy) return;
    stopRef.current?.();
    setBusy(true);
    setError(null);
    try {
      const r = await ledgerApi.voiceParse(entityId, t);
      setResult(r);
      setActions(r.actions);
      if (r.actions.length === 0) setError(r.message ?? 'No entendí qué registrar.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const patch = (i: number, p: Partial<VoiceAction>) => setActions((list) => list.map((a, k) => (k === i ? { ...a, ...p } : a)));

  const confirm = async () => {
    if (!result || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ledgerApi.voiceConfirm(entityId, result.draft_id, actions);
      void invalidateLedger(entityId, ['sale', 'expense', 'payment']);
      setDone(true);
      setTimeout(onClose, 1100);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    if (result) void ledgerApi.voiceDiscard(entityId, result.draft_id).catch(() => undefined);
    onClose();
  };

  const blocked = actions.some((a) => actionProblem(a) !== null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={result ? undefined : onClose} accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          {done ? (
            <View style={styles.doneBox}>
              <View style={styles.doneIcon}>
                <Ionicons name="checkmark" size={32} color="#fff" />
              </View>
              <Text style={styles.title}>Registrado</Text>
            </View>
          ) : !result || actions.length === 0 ? (
            <>
              <Text style={styles.title}>Dicta lo que pasó</Text>
              <Text style={styles.hint}>Por ejemplo: «vendí dos empanadas por seis mil, y le fié veinte mil a Don Jorge».</Text>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={canSpeak ? 'Toca el micrófono y habla, o escribe aquí' : 'Escribe aquí lo que quieres registrar (puedes usar el micrófono de tu teclado)'}
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                multiline
                maxLength={400}
                accessibilityLabel="Lo que quieres registrar"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.row}>
                {canSpeak ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Dejar de escuchar' : 'Hablar'} onPress={() => void listen()} style={[styles.mic, listening && styles.micOn]}>
                    <Ionicons name={listening ? 'stop' : 'mic'} size={26} color="#fff" />
                  </Pressable>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Button title={busy ? 'Interpretando…' : 'Interpretar'} onPress={() => void interpret()} loading={busy} disabled={!text.trim()} />
                </View>
              </View>
              {listening ? <Text style={styles.listening}>Escuchando…</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.title}>{actions.length === 1 ? 'Revisa y confirma' : `Revisa y confirma (${actions.length})`}</Text>
              <Text style={styles.heard} numberOfLines={3}>
                Escuché: «{result.text}»
              </Text>
              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
                {actions.map((a, i) => (
                  <ActionCard key={a.client_id} entityId={entityId} action={a} problem={actionProblem(a)} onChange={(p) => patch(i, p)} onRemove={() => setActions((l) => l.filter((_, k) => k !== i))} />
                ))}
              </ScrollView>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={{ gap: spacing.sm }}>
                <Button title={`Confirmar${actions.length > 1 ? ` (${actions.length})` : ''}`} onPress={() => void confirm()} loading={busy} disabled={blocked} />
                <Button title="No era eso" variant="ghost" onPress={discard} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const PARTY_WARN = /¿A quién|¿Quién|¿A qué proveedor|Hay varios|No encontré/;
const AMOUNT_WARN = /monto|Entendí|Los productos suman/;

function ActionCard({ entityId, action: a, problem, onChange, onRemove }: { entityId: string; action: VoiceAction; problem: string | null; onChange: (p: Partial<VoiceAction>) => void; onRemove: () => void }) {
  const setParty = (p: Partial<VoiceAction>) => onChange({ ...p, warnings: (a.warnings ?? []).filter((w) => !PARTY_WARN.test(w)) });
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons name={TYPE_ICON[a.type]} size={18} color={colors.primary} />
        <Text style={styles.cardType}>{TYPE_LABEL[a.type]}</Text>
        {a.type === 'expense' && a.category ? <Text style={styles.cardMeta}>· {categoryLabel(a.category)}</Text> : null}
        {a.days_ago > 0 ? <Text style={styles.cardMeta}>· hace {a.days_ago} {a.days_ago === 1 ? 'día' : 'días'}</Text> : null}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Quitar esta tarjeta" onPress={onRemove} hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <AmountField value={a.amount} onChange={(n) => onChange({ amount: n, words: '', warnings: (a.warnings ?? []).filter((w) => !AMOUNT_WARN.test(w)) })} />

      {a.lines && a.lines.length > 0 ? (
        <View style={{ gap: 2 }}>
          {a.lines.map((l, k) => (
            <Text key={`${l.name}${k}`} style={styles.cardMeta}>
              {l.qty} × {l.name}
              {l.unit_price != null ? ` · ${formatPesos(l.unit_price)} c/u${l.from_catalog ? ' (de tu catálogo)' : ''}` : ' · sin precio'}
            </Text>
          ))}
        </View>
      ) : null}

      <MethodChips value={a.method} onChange={(m) => onChange({ method: m })} expense={a.type === 'expense'} noCredit={a.type === 'payment'} />

      {a.party_id || a.new_party || (a.candidates && a.candidates.length > 0) || a.type === 'payment' || a.method === 'credit' ? (
        <View style={{ gap: spacing.xs }}>
          {a.candidates && a.candidates.length > 0 && !a.party_id ? (
            <>
              <Text style={styles.cardMeta}>¿Cuál de estos?</Text>
              <View style={styles.wrap}>
                {a.candidates.map((c) => (
                  <Chip key={c.id} label={c.name} selected={false} onPress={() => setParty({ party_id: c.id, party_name: c.name, new_party: false, candidates: [] })} />
                ))}
              </View>
            </>
          ) : a.party_id || a.new_party ? (
            <View style={styles.partyRow}>
              <Text style={[styles.party, { flex: 1 }]} numberOfLines={1}>
                {a.type === 'expense' ? 'Proveedor' : 'Cliente'}
                {a.new_party && !a.party_id ? ' nuevo' : ''}: {a.party_name}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cambiar" onPress={() => onChange({ party_id: undefined, party_name: '', new_party: false, candidates: [] })} hitSlop={8}>
                <Text style={styles.link}>Cambiar</Text>
              </Pressable>
            </View>
          ) : (
            <PartyPicker
              entityId={entityId}
              kind={a.type === 'expense' ? 'supplier' : 'customer'}
              value={null}
              onChange={(p) => p && setParty({ party_id: p.id, party_name: p.name, new_party: false, candidates: [] })}
              onNew={(name) => setParty({ party_id: undefined, party_name: name, new_party: true, candidates: [] })}
            />
          )}
        </View>
      ) : null}

      {[...(a.warnings ?? []), ...(problem && !(a.warnings ?? []).includes(problem) ? [problem] : [])].map((w) => (
        <View key={w} style={styles.warn}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.accentInk} />
          <Text style={styles.warnText}>{w}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22,35,58,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  hint: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  heard: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, fontStyle: 'italic' },
  textArea: { minHeight: 96, maxHeight: 160, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md, fontSize: 16, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mic: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: colors.danger },
  listening: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.danger, textAlign: 'center' },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardType: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  cardMeta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.primary },
  party: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: radius.sm, padding: spacing.sm },
  warnText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.accentInk },
  doneBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
});
