import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeIn } from '@/components/explore/LoadingMotion';
import { answer, detectIntent, followUps, priceLabel, suggestQuestions, type Action, type Answer, type AnswerData, type Block, type Intent } from '@/lib/answers';
import { formatEndsWhen } from '@/lib/offer';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { alpha, colors, fonts, radius, spacing } from '@/theme';
import { SectionHeader } from './SectionHeader';

/**
 * «Pregúntale» (CONVERSACIONES_Y_AGENDA.md, fase 1; mockup `conversaciones_agenda.html`). Preguntas según lo que el
 * negocio publicó y respuestas al instante con esos mismos datos. Las respuestas NO se envían al negocio: si falta un
 * dato, se ofrece escribirle con la pregunta ya escrita.
 */

export interface AskHandlers {
  onSeeSlots: (serviceId?: string) => void;
  onMessage: (draft: string) => void;
  onOpenOffer: (offerId: string) => void;
  onAsked?: (intent: Intent, answered: boolean) => void;
}

/** Tarjeta del perfil: 3 preguntas y «Más preguntas»; tocar una abre la hoja con la respuesta. */
export function AskEmpreCard({ data, onAsk }: { data: AnswerData; onAsk: (q: { intent: Intent; label: string } | { text: string }) => void }) {
  const qs = suggestQuestions(data, new Set(), 3);
  if (qs.length === 0) return null;
  return (
    <View style={styles.card}>
      <SectionHeader title={`Pregúntale a ${data.name}`} />
      <Text style={styles.cardSub}>Al instante, con lo que publicó el negocio.</Text>
      <View style={styles.chipsWrap}>
        {qs.map((q) => (
          <Pressable key={q.intent} accessibilityRole="button" onPress={() => onAsk(q)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
            <Text style={styles.chipText}>{q.label}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Escribir otra pregunta" onPress={() => onAsk({ text: '' })} style={({ pressed }) => [styles.chip, styles.chipMore, pressed && styles.pressed]}>
          <Text style={[styles.chipText, styles.chipMoreText]}>Otra pregunta</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface Turn {
  id: number;
  question: string;
  answer: Answer;
}

/** La hoja de respuestas. `start` es la primera pregunta (o `{text:''}` para abrir solo con el campo). */
export function AskEmpreSheet({ data, start, onClose, handlers }: { data: AnswerData; start: { intent: Intent; label: string } | { text: string } | null; onClose: () => void; handlers: AskHandlers }) {
  const reduce = useReduceMotion();
  return (
    <Modal visible={start !== null} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
      {start !== null ? <SheetBody data={data} start={start} onClose={onClose} handlers={handlers} /> : null}
    </Modal>
  );
}

function SheetBody({ data, start, onClose, handlers }: { data: AnswerData; start: { intent: Intent; label: string } | { text: string }; onClose: () => void; handlers: AskHandlers }) {
  const insets = useSafeAreaInsets();
  const ask = (intent: Intent, question: string, serviceId?: string): Turn => {
    const now = Date.now();
    const a = answer(data, intent, { serviceId, text: question, weekday: new Date(now).getDay(), now });
    handlers.onAsked?.(a.intent, !a.unanswered);
    return { id: now + Math.random(), question, answer: a };
  };
  const fromText = (text: string): Turn => {
    const d = detectIntent(text, data.services);
    return ask(d.intent, text, d.services.length === 1 ? d.services[0].id : undefined);
  };
  const [turns, setTurns] = useState<Turn[]>(() => ('intent' in start ? [ask(start.intent, start.label)] : start.text ? [fromText(start.text)] : []));
  const [showOld, setShowOld] = useState(false);
  const [text, setText] = useState('');
  const asked = useMemo(() => new Set(turns.map((t) => t.answer.intent)), [turns]);
  const last = turns[turns.length - 1];
  const older = turns.slice(0, -1);
  const follow = last ? followUps(data, last.answer.intent, asked) : suggestQuestions(data, asked, 3);

  const push = (t: Turn) => {
    setTurns((all) => [...all, t]);
    setShowOld(false);
  };
  const onAction = (a: Action) => {
    if (a.kind === 'see_slots') handlers.onSeeSlots(a.serviceId);
    else if (a.kind === 'message') handlers.onMessage(a.draft);
    else handlers.onOpenOffer(a.offerId);
  };
  const submit = () => {
    const v = text.trim();
    if (!v) return;
    setText('');
    push(fromText(v));
  };

  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} accessibilityRole="header">
              Respuestas al instante
            </Text>
            <View style={styles.subRow}>
              <Text style={styles.auto}>AUTOMÁTICO</Text>
              <Text style={styles.sub} numberOfLines={1}>
                Con lo que publicó {data.name}
              </Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.close} hitSlop={6}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView style={styles.thread} contentContainerStyle={{ paddingBottom: spacing.md }} keyboardShouldPersistTaps="handled">
          {older.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showOld }} onPress={() => setShowOld((v) => !v)} style={styles.olderToggle}>
              <Text style={styles.olderText}>
                {showOld ? 'Ocultar' : 'Preguntas anteriores'} ({older.length})
              </Text>
            </Pressable>
          ) : null}
          {showOld ? older.map((t) => <TurnView key={t.id} turn={t} muted />) : null}
          {last ? (
            <FadeIn key={last.id}>
              <TurnView
                turn={last}
                onAction={onAction}
                onChoose={(id, label) => push(ask(last.answer.intent === 'book' ? 'book' : last.answer.intent, label, id))}
              />
            </FadeIn>
          ) : (
            <Text style={styles.empty}>Escribe tu pregunta o elige una abajo.</Text>
          )}
        </ScrollView>
        <View style={styles.dock}>
          {follow.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.followRow} keyboardShouldPersistTaps="handled">
              {follow.map((q) => (
                <Pressable key={q.intent} accessibilityRole="button" onPress={() => push(ask(q.intent, q.label))} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                  <Text style={styles.chipText}>{q.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.askRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={submit}
              returnKeyType="send"
              placeholder="Pregunta otra cosa"
              placeholderTextColor={colors.muted}
              style={styles.input}
              accessibilityLabel="Escribe tu pregunta"
              maxLength={200}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Preguntar" disabled={!text.trim()} onPress={submit} style={({ pressed }) => [styles.send, !text.trim() && styles.sendOff, pressed && styles.pressed]}>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function TurnView({ turn, muted, onAction, onChoose }: { turn: Turn; muted?: boolean; onAction?: (a: Action) => void; onChoose?: (id: string, label: string) => void }) {
  const a = turn.answer;
  return (
    <View style={[styles.turn, muted && styles.turnMuted]}>
      <View style={styles.q}>
        <Text style={styles.qText}>{turn.question}</Text>
      </View>
      <View style={styles.ans} accessible={false}>
        {a.blocks.map((b, i) => (
          <BlockView key={i} b={b} onChoose={muted ? undefined : onChoose} />
        ))}
        {a.source ? <Text style={styles.source}>{a.source}</Text> : null}
        {!muted && a.actions.length > 0 ? (
          <View style={{ gap: 6, marginTop: spacing.sm }}>
            {a.actions.map((act, i) => (
              <Pressable key={i} accessibilityRole="button" onPress={() => onAction?.(act)} style={({ pressed }) => [i === 0 ? styles.primary : styles.ghost, pressed && styles.pressed]}>
                <Text style={i === 0 ? styles.primaryText : styles.ghostText}>{act.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function BlockView({ b, onChoose }: { b: Block; onChoose?: (id: string, label: string) => void }) {
  switch (b.kind) {
    case 'text':
      return (
        <View>
          <Text style={styles.bTitle}>{b.title}</Text>
          {b.body ? <Text style={styles.bBody}>{b.body}</Text> : null}
        </View>
      );
    case 'missing':
      return (
        <View>
          <Text style={styles.bTitle}>{b.title}</Text>
          <Text style={styles.bBody}>{b.body}</Text>
        </View>
      );
    case 'services':
      return (
        <View>
          <Text style={styles.bTitle}>{b.title}</Text>
          {b.items.map((s) => (
            <View key={s.id} style={styles.svcRow}>
              <Text style={styles.svcName} numberOfLines={1}>
                {s.name}
                {s.duration_min ? <Text style={styles.svcDur}>{`  ${s.duration_min} min`}</Text> : null}
              </Text>
              <Text style={styles.svcPrice}>{priceLabel(s) ?? 'Consultar'}</Text>
            </View>
          ))}
          {b.more > 0 ? <Text style={styles.bBody}>y {b.more} más en su perfil</Text> : null}
        </View>
      );
    case 'offer':
      return (
        <View style={styles.offer}>
          <Text style={styles.offerTitle}>{b.title}</Text>
          {b.appliesTo ? <Text style={styles.offerText}>Aplica a: {b.appliesTo}</Text> : null}
          {b.conditions ? <Text style={styles.offerText}>{b.conditions}</Text> : null}
          <Text style={styles.offerText}>Vigente hasta {formatEndsWhen(b.endsAt)}</Text>
          <Text style={styles.offerNote}>Se reclama aparte, con su QR.</Text>
        </View>
      );
    case 'choose':
      return (
        <View>
          <Text style={styles.bTitle}>{b.title}</Text>
          <View style={styles.chipsWrap}>
            {b.options.map((o) => (
              <Pressable key={o.id} accessibilityRole="button" disabled={!onChoose} onPress={() => onChoose?.(o.id, o.label)} style={({ pressed }) => [styles.chip, styles.chipAct, pressed && styles.pressed]}>
                <Text style={[styles.chipText, styles.chipActText]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 6 },
  cardSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  chipMore: { borderStyle: 'dashed' },
  chipMoreText: { color: colors.muted },
  chipAct: { borderColor: colors.primary },
  chipActText: { color: colors.primaryDark },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: alpha(colors.ink, 0.45) },
  sheet: { height: '86%', backgroundColor: colors.bg, borderTopLeftRadius: radius.lg + 2, borderTopRightRadius: radius.lg + 2, overflow: 'hidden' },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginTop: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  title: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  auto: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, letterSpacing: 0.4, color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  sub: { flexShrink: 1, fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  thread: { flex: 1, paddingHorizontal: spacing.lg },
  olderToggle: { minHeight: 44, justifyContent: 'center' },
  olderText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  empty: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  turn: { marginBottom: spacing.md },
  turnMuted: { opacity: 0.75 },
  q: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: colors.primary, borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 8, marginBottom: spacing.sm },
  qText: { fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.white },
  ans: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  bTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  bBody: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 2 },
  svcRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  svcName: { flex: 1, fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  svcDur: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  svcPrice: { fontSize: 13.5, fontFamily: fonts.display.bold, color: colors.ink },
  offer: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.sm + 2, gap: 2 },
  offerTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  offerText: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.accentInk },
  offerNote: { fontSize: 11.5, fontFamily: fonts.ui.medium, color: colors.accentInk, marginTop: 2 },
  source: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: 4 },
  primary: { minHeight: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.white },
  ghost: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  dock: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  followRow: { gap: 6 },
  askRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: spacing.md, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink, backgroundColor: colors.surface },
  send: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.45 },
});
