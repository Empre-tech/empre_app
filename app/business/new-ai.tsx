import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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

const STARTER_SUGGESTIONS = ['Tengo una tienda de ropa', 'Vendo comida casera', 'Ofrezco un servicio a domicilio'];

type DisplayMessage = AIChatMessage & { id: string };

function mergeDraft(prev: BusinessDraft, incoming: AIBusinessDraft): BusinessDraft {
  return {
    // Un nombre ya confirmado por el dueño gana y no vuelve a pedirse; si la
    // IA solo trae sugerencias, esas se muestran para elegir una.
    name: incoming.name || prev.name,
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

const PROGRESS_STEPS: { key: string; label: string; check: (draft: BusinessDraft) => boolean }[] = [
  { key: 'name', label: 'Nombre', check: (d) => Boolean(d.name || (d.nameSuggestions && d.nameSuggestions.length > 0)) },
  { key: 'category', label: 'Categoría', check: (d) => Boolean(d.categoryId) },
  { key: 'description', label: 'Descripción', check: (d) => Boolean(d.description) },
  { key: 'hours', label: 'Horario', check: (d) => Boolean(d.hours && d.hours.length > 0) },
];

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

  const send = async (override?: string) => {
    const content = (override ?? input).trim();
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
    // Antes usaba router.replace, lo que sacaba esta pantalla del stack de
    // navegación: al volver atrás desde el formulario no había a dónde
    // volver, y si el dueño entraba de nuevo al asistente se perdía toda la
    // conversación. Con push, esta pantalla (y su conversación) se queda
    // viva debajo, así que "atrás" regresa aquí tal como se dejó.
    router.push({ pathname: '/business/new', params: { aiDraft: JSON.stringify(draft) } });
  };

  const canReview = hasAnyDraftInfo(draft);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.headerIconWrap}>
          <Ionicons name="sparkles" size={18} color={colors.accent} />
        </View>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Asistente de IA</Text>
          <Text style={styles.subtitle}>Crea tu negocio charlando</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.progressRow}
        contentContainerStyle={styles.progressRowContent}
      >
        {PROGRESS_STEPS.map((step) => {
          const done = step.check(draft);
          return (
            <View key={step.key} style={[styles.progressChip, done && styles.progressChipDone]}>
              {done ? (
                <Ionicons name="checkmark" size={12} color={colors.accent} />
              ) : (
                <View style={styles.progressChipDot} />
              )}
              <Text style={[styles.progressLabel, done && styles.progressLabelDone]}>{step.label}</Text>
            </View>
          );
        })}
      </ScrollView>

      <FlatList
        ref={listRef}
        inverted
        data={[...displayMessages].reverse()}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.role === 'user' ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
            {item.role === 'assistant' ? (
              <View style={styles.aiAvatar}>
                <Ionicons name="sparkles" size={13} color="#fff" />
              </View>
            ) : null}
            <View style={[styles.bubble, item.role === 'user' ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={[styles.bubbleText, item.role === 'user' && styles.bubbleTextMine]}>{item.content}</Text>
            </View>
          </View>
        )}
        ListHeaderComponent={
          sending ? (
            <View style={[styles.bubbleRow, styles.bubbleRowTheirs]}>
              <View style={styles.aiAvatar}>
                <Ionicons name="sparkles" size={13} color="#fff" />
              </View>
              <View style={[styles.bubble, styles.bubbleTheirs]}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            </View>
          ) : null
        }
        // Lista invertida: el "footer" visualmente queda debajo del saludo,
        // justo donde tiene sentido ofrecer por dónde empezar a escribir.
        ListFooterComponent={
          conversation.length === 0 && !sending ? (
            <View style={styles.startersWrap}>
              {STARTER_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  onPress={() => void send(suggestion)}
                  style={({ pressed }) => [styles.starterChip, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.starterChipText}>{suggestion}</Text>
                </Pressable>
              ))}
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
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  subtitle: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  messages: { padding: spacing.md, gap: spacing.sm },
  startersWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  starterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: '#fff',
  },
  starterChipText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.accent },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.accentSoft, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  // Avatar con chispa para distinguir de un chat con una persona real.
  aiAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    alignSelf: 'flex-end',
  },
  progressRow: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  progressRowContent: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  progressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  progressChipDone: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  progressChipDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: colors.line },
  progressLabel: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.muted },
  progressLabelDone: { color: colors.accent },
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
