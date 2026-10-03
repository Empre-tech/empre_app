import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatApi, entitiesApi } from '@/api/endpoints';
import type { ChatMessage } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { useChat } from '@/chat/ChatProvider';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { CHAT_MAX_CONTENT_BYTES, CHAT_MAX_CONTENT_CHARS } from '@/config';
import { formatDayLabel, formatMessageTime } from '@/lib/format';
import { utf8Length } from '@/lib/text';
import { colors, fonts, radius, spacing } from '@/theme';

const LOCAL_PREFIX = 'local-';
const PHONE_RE = /^[+\d\s()-]{7,}$/;
const QUICK_REPLIES = ['¿Horario?', '¿Precios?', '¿Hacen envíos?'];

export default function ChatScreen() {
  const { entityId, userId, name, avatar } = useLocalSearchParams<{ entityId: string; userId?: string; name?: string; avatar?: string }>();
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

  // Info del negocio (categoría, horario, teléfono): solo aplica cuando YO soy
  // el cliente hablando con un negocio, no cuando soy el dueño viendo a un cliente.
  const business = useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => entitiesApi.get(entityId),
    enabled: !sentByEntity && Boolean(entityId),
  });

  // Si la otra persona de la conversación (el negocio, o el cliente cuando
  // soy el dueño) tiene una sesión abierta ahora mismo. Se repite cada rato
  // mientras el chat está en pantalla para que el estado no quede obsoleto.
  const presence = useQuery({
    queryKey: ['presence', entityId, customerId],
    queryFn: () => chatApi.presence(entityId, userId),
    enabled: authStatus === 'signedIn' && Boolean(entityId && customerId),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  const otherOnline = presence.data?.online ?? false;

  const todayHours = useMemo(() => {
    const hours = business.data?.hours;
    if (!hours || hours.length === 0) return null;
    const today = hours.find((h) => h.weekday === new Date().getDay());
    if (!today) return null;
    if (today.closed) return 'Hoy: cerrado';
    if (today.is_24h) return 'Hoy: abierto 24 horas';
    return `Hoy: ${today.open_time} - ${today.close_time}`;
  }, [business.data?.hours]);

  const contact = business.data?.contact_info?.trim();
  const hasPhone = Boolean(contact && PHONE_RE.test(contact));

  const sendQuick = (content: string) => {
    if (!entityId || !customerId || !user || chat.status !== 'open') return;
    const sent = chat.send({ entity_id: entityId, user_id: customerId, sent_by_entity: sentByEntity, content });
    if (!sent) return;
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
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  // Cada vez que el socket (re)conecta mientras esta pantalla está abierta,
  // refrescamos el historial: si estuvimos desconectados un momento (p. ej.
  // la app pasó a segundo plano), esto trae los mensajes que el servidor no
  // pudo entregar en tiempo real.
  useEffect(() => {
    if (chat.status === 'open') {
      void history.refetch();
      void presence.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status]);

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

  // Avisos en vivo de "ya te leyeron": el otro lado acaba de abrir esta
  // conversación, así que todo lo que YO mandé pasa a leído de una, sin
  // esperar a que se vuelva a pedir el historial.
  useEffect(() => {
    return chat.subscribeRead((readEntityId) => {
      if (readEntityId !== entityId || !user?.id) return;
      const markRead = (list: ChatMessage[]) =>
        list.map((m) => (m.sender_id === user.id && !m.is_read ? { ...m, is_read: true } : m));
      setLive((prev) => markRead(prev));
      queryClient.setQueryData<ChatMessage[]>(['history', entityId, customerId], (prev) =>
        prev ? markRead(prev) : prev,
      );
    });
  }, [chat.subscribeRead, entityId, customerId, user?.id, queryClient]);

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

  // Ids del mensaje más antiguo de cada día (separador "Hoy"/"Ayer" arriba de ese mensaje).
  const dayStarts = useMemo(() => {
    const set = new Set<string>();
    const dayKey = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const next = messages[i + 1];
      if (!next || dayKey(current.created_at) !== dayKey(next.created_at)) {
        set.add(current.id);
      }
    }
    return set;
  }, [messages]);

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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={styles.headerButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.headerAvatarWrap}>
          <Avatar uri={avatar} name={name ?? '?'} size={38} />
        </View>
        <View style={styles.headerTitle}>
          <Text style={styles.title} numberOfLines={1}>
            {name ?? 'Chat'}
          </Text>
          <Text style={[styles.status, connected && otherOnline && styles.statusOnline]} numberOfLines={1}>
            {!connected ? 'Conectando…' : otherOnline ? 'En línea' : 'Desconectado'}
          </Text>
        </View>
        {!sentByEntity && hasPhone ? (
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Llamar"
              hitSlop={8}
              onPress={() => void Linking.openURL(`tel:${contact!.replace(/[^\d+]/g, '')}`)}
              style={styles.headerActionBtn}
            >
              <Ionicons name="call-outline" size={19} color={colors.primary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="WhatsApp"
              hitSlop={8}
              onPress={() => void Linking.openURL(`https://wa.me/${contact!.replace(/[^\d]/g, '')}`)}
              style={styles.headerActionBtn}
            >
              <Ionicons name="logo-whatsapp" size={19} color={colors.success} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {!sentByEntity && (todayHours || business.data) ? (
        <View style={styles.infoBar}>
          <Ionicons name="time-outline" size={13} color={colors.muted} />
          <Text style={styles.infoBarText} numberOfLines={1}>
            {[todayHours, 'Suele responder en 1 hora'].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}

      {authStatus !== 'signedIn' ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Inicia sesión para chatear.</Text>
          <Button title="Iniciar sesión" onPress={() => router.push('/(auth)/login')} />
        </View>
      ) : history.isLoading ? (
        <ActivityIndicator style={styles.center} color={colors.primary} />
      ) : (
        <View style={styles.listWrap}>
          {messages.length === 0 ? (
            // Texto del estado vacío FUERA del FlatList invertido: antes vivía
            // como ListEmptyComponent con un scaleY(-1) manual para
            // "contrarrestar" el flip de `inverted`, pero en la práctica
            // seguía viéndose al revés (hallazgo de UI confirmado con build
            // nuevo). Renderizarlo como hermano normal, no invertido, evita
            // el problema de raíz en vez de intentar contrarrestarlo.
            <View style={styles.emptyWrap} pointerEvents="none">
              <Text style={styles.muted}>
                {history.isError ? 'No pudimos cargar el historial.' : 'Escribe el primer mensaje.'}
              </Text>
            </View>
          ) : null}
          <FlatList
            style={styles.messagesList}
            inverted
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messages}
            renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View>
                {dayStarts.has(item.id) ? (
                  <View style={styles.daySeparator}>
                    <Text style={styles.daySeparatorText}>{formatDayLabel(item.created_at)}</Text>
                  </View>
                ) : null}
                <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
                    <View style={styles.bubbleMeta}>
                      <Text style={[styles.time, mine && styles.timeMine]}>{formatMessageTime(item.created_at)}</Text>
                      {mine ? (
                        <Ionicons
                          name={item.id.startsWith(LOCAL_PREFIX) ? 'checkmark' : 'checkmark-done'}
                          size={14}
                          color={
                            item.is_read
                              ? colors.accent
                              : item.id.startsWith(LOCAL_PREFIX)
                                ? 'rgba(255,255,255,0.6)'
                                : '#fff'
                          }
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            );
            }}
          />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {authStatus === 'signedIn' && !sentByEntity ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRepliesScroll}
          contentContainerStyle={styles.quickReplies}
        >
          {QUICK_REPLIES.map((label) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              onPress={() => sendQuick(label)}
              disabled={!connected}
              style={({ pressed }) => [styles.quickReplyChip, (pressed || !connected) && { opacity: 0.6 }]}
            >
              <Text style={styles.quickReplyText}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

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
  headerAvatarWrap: { position: 'relative' },
  headerTitle: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  status: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  statusOnline: { color: colors.success },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  infoBarText: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  quickRepliesScroll: { flexGrow: 0, flexShrink: 0 },
  quickReplies: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  quickReplyChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  quickReplyText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  muted: { color: colors.muted, textAlign: 'center' },
  // El FlatList de mensajes debe ocupar todo el espacio disponible entre el
  // header y los chips/composer; sin esto, con la conversación vacía se
  // encogía a su contenido y dejaba un hueco que otros elementos (los chips
  // de mensajes rápidos) terminaban ocupando de forma rara.
  listWrap: { flex: 1 },
  messagesList: { flex: 1 },
  emptyWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  messages: { padding: spacing.md, gap: spacing.sm },
  daySeparator: { alignItems: 'center', marginVertical: spacing.sm },
  daySeparatorText: {
    fontSize: 11,
    fontFamily: fonts.ui.bold,
    color: colors.muted,
    backgroundColor: colors.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink },
  bubbleTextMine: { color: '#fff' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  time: { fontSize: 11, color: colors.muted },
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
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontFamily: fonts.ui.medium,
    color: colors.ink,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
});
