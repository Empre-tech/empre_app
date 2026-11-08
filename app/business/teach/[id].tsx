import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { answersApi } from '@/api/answers';
import { Button } from '@/components/Button';
import { notifyError } from '@/components/Notice';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import type { TaughtAnswer } from '@/lib/answers';
import { colors, fonts, radius } from '@/theme';

const TOPICS: { intent: string; label: string }[] = [
  { intent: '', label: 'Otra pregunta' },
  { intent: 'hours', label: 'Horario' },
  { intent: 'price', label: 'Precios' },
  { intent: 'delivery', label: 'Domicilio' },
  { intent: 'availability', label: 'Disponibilidad' },
  { intent: 'book', label: 'Reservas' },
  { intent: 'offers', label: 'Ofertas' },
  { intent: 'services', label: 'Lo que ofreces' },
];
const topicLabel = (intent: string) => TOPICS.find((t) => t.intent === intent)?.label ?? 'Otra pregunta';
const MAX = 500;

interface Draft {
  id?: string;
  intent: string;
  question: string;
  answer: string;
}

/**
 * «Enséñale a Empre AI» (3.62, F3): lo que responde por el dueño en su chat. Aquí ve las preguntas que no supo
 * responder, le enseña respuestas (para un tema o para una pregunta propia) y puede apagarlo.
 */
export default function TeachScreen() {
  const { id, intent: intentParam, question: questionParam } = useLocalSearchParams<{ id: string; intent?: string; question?: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(() =>
    intentParam !== undefined || questionParam ? { intent: intentParam ?? '', question: questionParam ?? '', answer: '' } : null,
  );

  const list = useQuery({ queryKey: ['business-answers', entityId], queryFn: () => answersApi.list(entityId), enabled: Boolean(entityId) });
  const unanswered = useQuery({ queryKey: ['answers-unanswered', entityId], queryFn: () => answersApi.unanswered(entityId), enabled: Boolean(entityId) });
  const taught = list.data?.data ?? [];
  const off = list.data?.ai_chat_off ?? false;
  const pending = (unanswered.data?.data ?? []).filter((u) => !taught.some((t) => t.question.trim().toLowerCase() === u.text.trim().toLowerCase()));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['business-answers', entityId] });
    void qc.invalidateQueries({ queryKey: ['answers-unanswered', entityId] });
  };
  const save = useMutation({
    mutationFn: (d: Draft) => answersApi.upsert(entityId, { id: d.id, intent: d.intent, question: d.question.trim(), answer: d.answer.trim() }),
    onSuccess: () => {
      setDraft(null);
      refresh();
    },
    onError: (e: Error) => notifyError('No se pudo guardar', e.message),
  });
  const remove = useMutation({
    mutationFn: (answerId: string) => answersApi.remove(entityId, answerId),
    onSuccess: refresh,
    onError: (e: Error) => notifyError('No se pudo borrar', e.message),
  });
  const toggle = useMutation({
    mutationFn: (next: boolean) => answersApi.setChatOff(entityId, next),
    onSuccess: refresh,
    onError: (e: Error) => notifyError('No se pudo cambiar', e.message),
  });

  const edit = (t: TaughtAnswer) => setDraft({ id: t.id, intent: t.intent, question: t.question, answer: t.answer });
  const canSave = Boolean(draft && draft.answer.trim() && (draft.intent || draft.question.trim().length >= 4) && draft.answer.length <= MAX);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubScreenHeader title="Enséñale a Empre AI" subtitle="Lo que responde por ti en tu chat" product="ai" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: !off }} disabled={toggle.isPending || list.isLoading} onPress={() => toggle.mutate(!off)} style={styles.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.switchTitle}>Empre AI responde en mi chat</Text>
            <Text style={styles.switchSub}>{off ? 'Apagado: tus clientes esperan tu respuesta.' : 'Responde con lo que publicaste cuando no alcanzas a contestar. Siempre dice que es Empre AI.'}</Text>
          </View>
          <View style={[styles.track, !off && styles.trackOn]}>
            <View style={styles.knob} />
          </View>
        </Pressable>

        {draft ? (
          <View style={styles.editor}>
            <Text style={styles.editorTitle} accessibilityRole="header">
              {draft.id ? 'Cambiar la respuesta' : 'Enseñar una respuesta'}
            </Text>
            <Text style={styles.label}>Tema</Text>
            <View style={styles.topics}>
              {TOPICS.map((t) => {
                const on = draft.intent === t.intent;
                return (
                  <Pressable key={t.intent || 'otra'} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setDraft({ ...draft, intent: t.intent })} style={[styles.topic, on && styles.topicOn]}>
                    <Text style={styles.topicText}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {draft.intent === '' ? (
              <>
                <Text style={styles.label}>La pregunta</Text>
                <TextInput value={draft.question} onChangeText={(q) => setDraft({ ...draft, question: q.slice(0, 200) })} placeholder="¿Atienden niños?" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="La pregunta" />
              </>
            ) : (
              <Text style={styles.hint}>Se suma a lo que Empre AI ya responde sobre {topicLabel(draft.intent).toLowerCase()} con lo que publicaste; si no habías publicado nada, responde con esto.</Text>
            )}
            <Text style={styles.label}>Tu respuesta</Text>
            <TextInput
              value={draft.answer}
              onChangeText={(a) => setDraft({ ...draft, answer: a.slice(0, MAX) })}
              placeholder="Sí, desde los 3 años. Los sábados hay más fila."
              placeholderTextColor={colors.placeholder}
              style={[styles.input, styles.multi]}
              multiline
              accessibilityLabel="Tu respuesta"
            />
            <Text style={styles.count}>{`${draft.answer.length}/${MAX}`}</Text>
            <View style={styles.editorActions}>
              <Button title="Guardar" onPress={() => draft && save.mutate(draft)} loading={save.isPending} disabled={!canSave} />
              <Button title="Cancelar" variant="secondary" onPress={() => setDraft(null)} />
            </View>
          </View>
        ) : (
          <Button title="Enseñar algo nuevo" variant="secondary" onPress={() => setDraft({ intent: '', question: '', answer: '' })} />
        )}

        {pending.length ? (
          <SystemSection title="No supo responder">
            <SystemGroup>
              {pending.map((u, i) => (
                <SystemRow key={u.message_id} first={i === 0} icon="help-circle-outline" tag="Pregunta de un cliente" title={u.text} sub="Toca para enseñarle la respuesta" alert onPress={() => setDraft({ intent: '', question: u.text, answer: '' })} />
              ))}
            </SystemGroup>
          </SystemSection>
        ) : !unanswered.isLoading ? (
          <Text style={styles.empty}>Por ahora Empre AI supo responder todo lo que te preguntaron.</Text>
        ) : null}

        {taught.length ? (
          <SystemSection title="Lo que le enseñaste">
            <SystemGroup>
              {taught.map((t, i) => (
                <View key={t.id} style={[styles.taughtRow, i > 0 && styles.taughtLine]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar: ${t.question || topicLabel(t.intent)}`} onPress={() => edit(t)} style={{ flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' }}>
                    <Text style={styles.taughtTag}>{t.intent ? topicLabel(t.intent) : t.question}</Text>
                    <Text style={styles.taughtAnswer} numberOfLines={2}>
                      {t.answer}
                    </Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Borrar esta respuesta" onPress={() => remove.mutate(t.id)} style={styles.trash}>
                    <Ionicons name="trash-outline" size={18} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </SystemGroup>
          </SystemSection>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, gap: 18 },
  switchRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.surface },
  switchTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  switchSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  track: { width: 46, height: 28, padding: 3, borderRadius: 14, backgroundColor: colors.placeholder, alignItems: 'flex-start' },
  trackOn: { backgroundColor: colors.ink, alignItems: 'flex-end' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface },
  editor: { gap: 8, padding: 16, borderRadius: 20, backgroundColor: colors.surface },
  editorTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  label: { marginTop: 4, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  hint: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  topic: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  topicOn: { borderColor: colors.selected, backgroundColor: colors.selectedSoft },
  topicText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  multi: { minHeight: 96, textAlignVertical: 'top' },
  count: { alignSelf: 'flex-end', fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.faint },
  editorActions: { gap: 8, marginTop: 4 },
  empty: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  taughtRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  taughtLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  taughtTag: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  taughtAnswer: { fontSize: 14, lineHeight: 19, fontFamily: fonts.ui.bold, color: colors.ink },
  trash: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
