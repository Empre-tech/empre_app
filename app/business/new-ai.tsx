import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aiApi } from '@/api/endpoints';
import type { AIBusinessDraft, AIChatMessage } from '@/api/types';
import type { BusinessDraft } from '@/components/BusinessForm';
import { colors, fonts, radius, spacing } from '@/theme';

const GREETING =
  '¡Hola! Cuéntame de tu negocio con tus palabras — qué vendes, a quién, y lo que se te ocurra — y entre los dos armamos el perfil. ¿Empezamos?';

type DisplayMessage = AIChatMessage & { id: string };

function mergeDraft(prev: BusinessDraft, incoming: AIBusinessDraft): BusinessDraft {
  return {
    name: prev.name,
    nameSuggestions:
      incoming.name_suggestions && incoming.name_suggestions.length > 0 ? incoming.name_suggestions : prev.nameSuggestions,
    description: incoming.description || prev.description,
    categoryId: incoming.category_id || prev.categoryId,
    subcategoryIds:
      incoming.subcategory_ids && incoming.subcategory_ids.length > 0 ? incoming.subcategory_ids : prev.subcategoryIds,
    serviceMode: incoming.service_mode || prev.serviceMode,
    hours: incoming.hours && incoming.hours.length > 0 ? incoming.hours : prev.hours,
  };
}

function hasAnyDraftInfo(draft: BusinessDraft): boolean {
  return Boolean(
    draft.description ||
      draft.categoryId ||
      (draft.subcategoryIds && draft.subcategoryIds.length > 0) ||
      draft.serviceMode ||
      (draft.hours && draft.hours.length > 0) ||
      (draft.nameSuggestions && draft.nameSuggestions.length > 0),
  );
}

/** Asistente conversacional de IA para crear un negocio: el dueño describe
 * su negocio charlando, y al final se pasa al formulario de siempre (ya
 * prellenado) para que revise y confirme todo antes de crear. La IA nunca
 * guarda nada directamente. */
export default function AIBusinessAssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<DisplayMessage>>(null);

  const [conversation, setConversation] = useState<AIChatMessage[]>([]);
  const [draft, setDraft] = useState<BusinessDraft>({});
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayMessages: DisplayMessage[] = [
    { id: 'greeting', role: 'assistant', content: GREETING },
    ...conversation.map((m, i) => ({ ...m, id: `m-${i}` })),
  ];

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;

    const next = [...conversation, { role: 'user' as const, content }];
    setConversation(next);
    setInput('');
    setError(null);
    setSending(true);
    try {
      const res = await aiApi.businessAssistant(next);
      setConversation((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      if (res.draft) setDraft((prev) => mergeDraft(prev, res.draft!));
      if (res.ready) setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos hablar con el asistente. Intenta de nuevo.');
    } finally {
      setSending(false);
    }
  };

  const reviewDraft = () => {
    router.replace({ pathname: '/business/new', params: { aiDraft: JSON.stringify(draft) } });
  };

  const canReview = hasAnyDraftInfo(draft);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Asistente de IA</Text>
          <Text style={styles.subtitle}>Crea tu negocio charlando</Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        inverted
        data={[...displayMessages].reverse()}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.role === 'user' ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
            <View style={[styles.bubble, item.role === 'user' ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={[styles.bubbleText, item.role === 'user' && styles.bubbleTextMine]}>{item.content}</Text>
            </View>
          </View>
        )}
        ListHeaderComponent={
          sending ? (
            <View style={[styles.bubbleRow, styles.bubbleRowTheirs]}>
              <View style={[styles.bubble, styles.bubbleTheirs]}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            </View>
          ) : null
        }
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {canReview ? (
        <Pressable
          accessibilityRole="button"
          onPress={reviewDraft}
          style={[styles.reviewButton, ready && styles.reviewButtonReady]}
        >
          <Ionicons name={ready ? 'checkmark-circle' : 'document-text-outline'} size={18} color="#fff" />
          <Text style={styles.reviewButtonText}>
            {ready ? '¡Listo! Revisar y crear negocio' : 'Revisar lo que llevamos hasta ahora'}
          </Text>
        </Pressable>
      ) : null}

      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Escribe tu respuesta…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
          maxLength={1000}
          editable={!sending}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar"
          onPress={() => void send()}
          disabled={!input.trim() || sending}
          style={[styles.send, (!input.trim() || sending) && styles.sendDisabled]}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  subtitle: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  messages: { padding: spacing.md, gap: spacing.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  error: { color: colors.danger, fontSize: 13, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  reviewButtonReady: { backgroundColor: colors.verified },
  reviewButtonText: { fontSize: 14, fontFamily: fonts.ui.bold, color: '#fff' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    fontFamily: fonts.ui.medium,
    color: colors.ink,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
});
