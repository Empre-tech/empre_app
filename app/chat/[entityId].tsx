import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { chatApi } from '@/api/endpoints';
import type { ChatMessage } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { useChat } from '@/chat/ChatProvider';
import { Button } from '@/components/Button';
import { CHAT_MAX_CONTENT_BYTES, CHAT_MAX_CONTENT_CHARS } from '@/config';
import { formatMessageTime } from '@/lib/format';
import { utf8Length } from '@/lib/text';
import { colors, fonts, radius, spacing } from '@/theme';

const LOCAL_PREFIX = 'local-';

export default function ChatScreen() {
  const { entityId, userId, name } = useLocalSearchParams<{ entityId: string; userId?: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { status: authStatus, user } = useAuth();
  const chat = useChat();

  // Cliente: la conversación es entre yo y el negocio. Dueño: llega ?userId= del cliente.
  const customerId = userId ?? user?.id;
  const sentByEntity = Boolean(userId && userId !== user?.id);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Mensajes nuevos de esta sesión (más nuevo primero): entrantes + los que enviamos nosotros.
  const [live, setLive] = useState<ChatMessage[]>([]);

  const history = useQuery({
    queryKey: ['history', entityId, customerId],
    queryFn: () => chatApi.history(entityId, userId),
    enabled: authStatus === 'signedIn' && Boolean(entityId && customerId),
  });

  // Mensajes en tiempo real que pertenecen a esta conversación.
  useEffect(() => {
    return chat.subscribe((message) => {
      if (message.entity_id !== entityId || message.user_id !== customerId) return;
      setLive((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        // El servidor devuelve como eco el mensaje que enviamos (ya guardado, con su id real):
        // sustituye a la copia local más antigua con el mismo texto.
        if (message.sender_id === user?.id) {
          const index = prev.map((m) => m.id.startsWith(LOCAL_PREFIX) && m.content === message.content).lastIndexOf(true);
          if (index !== -1) return [...prev.slice(0, index), message, ...prev.slice(index + 1)];
        }
        return [message, ...prev];
      });
    });
  }, [chat.subscribe, entityId, customerId, user?.id]);

  // Si el eco no llegó, al recargar el historial esos mensajes ya vienen de la base de datos,
  // así que descartamos las copias locales que queden.
  useEffect(() => {
    if (!history.dataUpdatedAt) return;
    setLive((prev) => prev.filter((m) => !m.id.startsWith(LOCAL_PREFIX)));
  }, [history.dataUpdatedAt]);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    const out: ChatMessage[] = [];
    for (const message of [...live, ...(history.data ?? [])]) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      out.push(message);
    }
    return out; // ya viene más nuevo primero: encaja con FlatList `inverted`
  }, [live, history.data]);

  const onSend = () => {
    const content = text.trim();
    if (!content || !entityId || !customerId || !user) return;

    if (utf8Length(content) > CHAT_MAX_CONTENT_BYTES) {
      setError('El mensaje es demasiado largo. Divídelo en dos.');
      return;
    }

    const sent = chat.send({ entity_id: entityId, user_id: customerId, sent_by_entity: sentByEntity, content });
    if (!sent) {
      setError('Sin conexión con el chat. Reintentando…');
      return;
    }

    setLive((prev) => [
      {
        id: `${LOCAL_PREFIX}${Date.now()}`,
        sender_id: user.id,
        entity_id: entityId,
        user_id: customerId,
        sent_by_entity: sentByEntity,
        content,
        is_read: false,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setText('');
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const connected = chat.status === 'open';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.title} numberOfLines={1}>
            {name ?? 'Chat'}
          </Text>
          <Text style={[styles.status, { color: connected ? colors.success : colors.muted }]}>
            {connected ? 'En línea' : 'Conectando…'}
          </Text>
        </View>
      </View>

      {authStatus !== 'signedIn' ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Inicia sesión para chatear.</Text>
          <Button title="Iniciar sesión" onPress={() => router.push('/(auth)/login')} />
        </View>
      ) : history.isLoading ? (
        <ActivityIndicator style={styles.center} color={colors.primary} />
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messages}
          ListEmptyComponent={
            // En una lista invertida el vacío se ve al revés: lo volteamos.
            <Text style={[styles.muted, styles.emptyInverted]}>
              {history.isError ? 'No pudimos cargar el historial.' : 'Escribe el primer mensaje.'}
            </Text>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
                  <Text style={[styles.time, mine && styles.timeMine]}>{formatMessageTime(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {authStatus === 'signedIn' ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            value={text}
            onChangeText={(value) => {
              setText(value);
              if (error) setError(null);
            }}
            placeholder="Escribe un mensaje"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            maxLength={CHAT_MAX_CONTENT_CHARS}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            onPress={onSend}
            disabled={!text.trim() || !connected}
            style={[styles.send, (!text.trim() || !connected) && styles.sendDisabled]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : null}
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
  headerTitle: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  status: { fontSize: 12, fontFamily: fonts.ui.semibold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  muted: { color: colors.muted, textAlign: 'center' },
  emptyInverted: { transform: [{ scaleY: -1 }], marginTop: spacing.xxl },
  messages: { padding: spacing.md, gap: spacing.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink },
  bubbleTextMine: { color: '#fff' },
  time: { fontSize: 11, color: colors.muted, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.8)' },
  error: { color: colors.danger, fontSize: 13, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
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
