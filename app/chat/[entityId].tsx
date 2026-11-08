import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { track } from '@/analytics/track';
import { answersApi, replyLabel } from '@/api/answers';
import { AiAnswerBubble, AiAnswerOwnerRow, AiStatusLine, TeachLink } from '@/components/chat/AiAnswerBubble';
import type { ChispaMood } from '@/components/ai/Chispa';
import { ChatVoices, HandoffLine, OwnerAvatar } from '@/components/chat/ChatVoices';
import { useAnswerData } from '@/components/chat/useAnswerData';
import { answer as buildAnswer, detectIntent, suggestQuestions, type Action, type Answer, type Intent } from '@/lib/answers';
import { autoAnswerStep, ownerRepliedSince } from '@/lib/chatAutoAnswer';
import { chatApi, entitiesApi } from '@/api/endpoints';
import type { ChatMessage } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { useChat } from '@/chat/ChatProvider';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { AppointmentCard } from '@/components/agenda/AppointmentCard';
import { ChatItemCard } from '@/components/chat/ChatItemCard';
import { CHAT_MAX_CONTENT_BYTES, CHAT_MAX_CONTENT_CHARS, FEATURES } from '@/config';
import { parseChatItem } from '@/lib/chatItem';
import { formatDayLabel, formatMessageTime } from '@/lib/format';
import { utf8Length } from '@/lib/text';
import { colors, fonts, radius, spacing } from '@/theme';

const LOCAL_PREFIX = 'local-';
const PHONE_RE = /^[+\d\s()-]{7,}$/;
const QUICK_REPLIES = ['¿Horario?', '¿Precios?', '¿Hacen envíos?'];

/** Lo que Empre AI agrega a la conversación (3.62, F1). Vive solo en este teléfono hasta F2. */
type AiRow =
  | { id: string; created_at: string; ai: 'answer'; intent: Intent; answer: Answer }
  | { id: string; created_at: string; ai: 'status'; text: string };
interface PendingQuestion {
  id: string;
  askedAt: string;
  text: string;
  intent: Intent;
  serviceId?: string;
  taughtId?: string;
  answer: Answer;
}

export default function ChatScreen() {
  // `draft`: un mensaje ya escrito (por ejemplo, preguntar por un ítem del catálogo); la persona lo revisa y lo envía.
  // `item`: el producto por el que se pregunta (JSON); va como tarjeta con el primer mensaje.
  const { entityId, userId, name, avatar, draft, item: itemParam } = useLocalSearchParams<{ entityId: string; userId?: string; name?: string; avatar?: string; draft?: string; item?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { status: authStatus, user } = useAuth();
  const chat = useChat();

  // Cliente: la conversación es entre yo y el negocio. Dueño: llega ?userId= del cliente.
  const customerId = userId ?? user?.id;
  const sentByEntity = Boolean(userId && userId !== user?.id);

  const [text, setText] = useState(() => (typeof draft === 'string' ? draft.slice(0, 1000) : ''));
  const [error, setError] = useState<string | null>(null);
  // La tarjeta del producto que se va a mandar con el próximo mensaje (se puede quitar).
  const [attached, setAttached] = useState(() => parseChatItem(itemParam));
  // Mensajes nuevos de esta sesión (más nuevo primero): entrantes + los que enviamos nosotros.
  const [live, setLive] = useState<ChatMessage[]>([]);
  // Empre AI (3.62): lo que respondió, las preguntas en espera y qué intenciones ya respondió.
  const [aiRows, setAiRows] = useState<AiRow[]>([]);
  const [pending, setPending] = useState<PendingQuestion[]>([]);
  // La Chispa (3.63) cuenta lo que pasa: buscando, respondió, se lo pasó al dueño o te sirvió; luego vuelve al reposo.
  const [mood, setMood] = useState<ChispaMood>('reposo');
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMood = useCallback((m: ChispaMood, ms?: number) => {
    if (moodTimer.current) clearTimeout(moodTimer.current);
    setMood(m);
    moodTimer.current = ms ? setTimeout(() => setMood('reposo'), ms) : null;
  }, []);
  useEffect(() => () => {
    if (moodTimer.current) clearTimeout(moodTimer.current);
  }, []);
  // La hora con que se arman las respuestas guardadas (si una oferta ya venció, no se presenta como vigente).
  const [openedAt] = useState(() => Date.now());

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
    queryFn: () => chatApi.presence(entityId, userId, business.data?.owner_id),
    enabled:
      authStatus === 'signedIn' &&
      Boolean(entityId && customerId) &&
      (sentByEntity || Boolean(business.data?.owner_id)),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  const otherOnline = presence.data?.online ?? false;
  const answerData = useAnswerData(entityId, true, authStatus === 'signedIn');
  const aiOn = Boolean(answerData && !answerData.aiChatOff);
  const replyTime = useQuery({ queryKey: ['reply-time', entityId], queryFn: () => answersApi.replyTime(entityId), enabled: !sentByEntity && Boolean(entityId), staleTime: 30 * 60_000 });
  const replyText = replyTime.data?.minutes ? `Suele responder en ~${replyLabel(replyTime.data.minutes)}` : null;

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

  const sendQuick = (content: string): boolean => {
    if (!entityId || !customerId || !user || chat.status !== 'open') return false;
    const sent = chat.send({ entity_id: entityId, user_id: customerId, sent_by_entity: sentByEntity, content });
    if (!sent) return false;
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
    return true;
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

  // Empre AI responde con lo que publicó el negocio (3.62, F1). Las reglas viven en `lib/chatAutoAnswer`.
  const latest = useRef({ messages, otherOnline, aiRows, pending });
  useEffect(() => {
    latest.current = { messages, otherOnline, aiRows, pending };
  }, [messages, otherOnline, aiRows, pending]);
  const answeredIntents = useMemo(() => {
    const today = new Date().toDateString();
    const saved = messages.filter((m) => m.kind === 'ai_answer' && m.ai_intent && new Date(m.created_at).toDateString() === today).map((m) => m.ai_intent!);
    return new Set<string>([...saved, ...aiRows.flatMap((r) => (r.ai === 'answer' ? [r.intent] : []))]);
  }, [aiRows, messages]);

  const resolvePending = useCallback(() => {
    const { messages: msgs, otherOnline: online, aiRows: rows, pending: list } = latest.current;
    if (!list.length) return;
    const today = new Date().toDateString();
    const answered = new Set<string>([
      ...msgs.filter((m) => m.kind === 'ai_answer' && m.ai_intent && new Date(m.created_at).toDateString() === today).map((m) => m.ai_intent!),
      ...rows.flatMap((r) => (r.ai === 'answer' ? [r.intent] : [])),
    ]);
    const hasStatus = rows.some((r) => r.ai === 'status');
    const keep: PendingQuestion[] = [];
    const add: AiRow[] = [];
    const saveToServer: PendingQuestion[] = [];
    {
      for (const q of list) {
        const step = autoAnswerStep({
          answerable: !q.answer.unanswered && q.intent !== 'unknown',
          intent: q.intent,
          ownerOnline: online,
          ownerReplied: ownerRepliedSince(msgs, q.askedAt),
          elapsedMs: Date.now() - Date.parse(q.askedAt),
          answered,
        });
        if (step === 'wait') keep.push(q);
        else if (step === 'answer') {
          answered.add(q.intent);
          saveToServer.push(q);
        } else if (step === 'status') {
          const asked = msgs.find((m) => m.sender_id === user?.id && m.content === q.text && !m.id.startsWith(LOCAL_PREFIX) && Date.parse(m.created_at) >= Date.parse(q.askedAt) - 60_000);
          if (asked) void chatApi.aiUnknown(entityId, asked.id).catch(() => undefined);
          if (hasStatus || add.some((r) => r.ai === 'status')) continue;
          const who = answerData?.name ?? name ?? 'El negocio';
          add.push({ id: `ai-${q.id}`, created_at: new Date().toISOString(), ai: 'status', text: online ? `Empre AI no sabe esto. Se lo pasó al dueño de ${who}, que está en línea.` : `Empre AI no sabe esto. Se lo pasó al dueño de ${who}; te llega un aviso cuando conteste.` });
        }
      }
    }
    setPending(keep);
    if (add.length) setAiRows((prev) => [...add, ...prev]);
    if (saveToServer.length || add.some((r) => r.ai === 'answer')) showMood('responde', 1400);
    else if (add.some((r) => r.ai === 'status')) showMood('nosabe', 2200);
    else if (keep.length) showMood('reposo');
    for (const q of saveToServer) {
      chatApi
        .aiAnswer(entityId, q.intent, q.serviceId, q.taughtId)
        .then((m) => setLive((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev])))
        .catch(() => setAiRows((prev) => [{ id: `ai-${q.id}`, created_at: new Date().toISOString(), ai: 'answer', intent: q.intent, answer: q.answer }, ...prev]));
    }
  }, [answerData?.name, name, entityId, user?.id, showMood]);

  // Mientras haya preguntas en espera, se revisa cada segundo (el dueño puede contestar o pasar los 45 s).
  useEffect(() => {
    if (!pending.length) return;
    const id = setInterval(resolvePending, 1000);
    return () => clearInterval(id);
  }, [pending.length, resolvePending]);

  /** Después de enviar una pregunta del cliente: Empre AI prepara la respuesta con los datos del negocio. */
  const askEmpreAI = async (content: string, preset?: Intent) => {
    if (sentByEntity || !answerData || answerData.aiChatOff || !entityId) return;
    showMood('pensando');
    let found: { intent: Intent; services: { id: string }[]; taughtId?: string } = preset ? { intent: preset, services: [] } : detectIntent(content, answerData.services, answerData.taught);
    // F4: si las reglas no la entienden, el servidor la clasifica (solo la intención; la respuesta sale de lo publicado).
    if (found.intent === 'unknown') {
      const c = await chatApi.classify(entityId, content).catch(() => null);
      if (c && c.intent !== 'unknown') found = { intent: c.intent as Intent, services: [], taughtId: c.answer_id };
    }
    const now = new Date();
    const ans = buildAnswer(answerData, found.intent, { serviceId: found.services.length === 1 ? found.services[0].id : undefined, taughtId: found.taughtId, text: content, weekday: now.getDay(), now: now.getTime() });
    track('question_asked', entityId, { intent: found.intent, answered: !ans.unanswered });
    const serviceId = found.services.length === 1 ? found.services[0].id : undefined;
    const q: PendingQuestion = { id: String(now.getTime()), askedAt: now.toISOString(), text: content, intent: found.intent, serviceId, taughtId: found.taughtId, answer: ans };
    latest.current = { ...latest.current, pending: [...latest.current.pending, q] };
    setPending((list) => [...list, q]);
    // Un momento de «escribiendo», no un salto instantáneo.
    setTimeout(resolvePending, 700);
  };

  const onAiAction = (a: Action) => {
    if (a.kind === 'open_offer') router.push({ pathname: '/offer/[id]', params: { id: a.offerId, entityId } });
    else if (a.kind === 'see_slots') router.push({ pathname: '/business/[id]', params: { id: entityId } });
  };
  const onAiChoose = (intent: Intent) => (serviceId: string) => {
    if (!answerData) return;
    const now = new Date();
    const ans = buildAnswer(answerData, intent, { serviceId, weekday: now.getDay(), now: now.getTime() });
    setAiRows((prev) => [{ id: `ai-${now.getTime()}`, created_at: now.toISOString(), ai: 'answer', intent, answer: ans }, ...prev]);
  };

  const rows = useMemo<(ChatMessage | AiRow)[]>(
    () => (aiRows.length ? [...aiRows, ...messages].sort((a, b) => b.created_at.localeCompare(a.created_at)) : messages),
    [aiRows, messages],
  );
  // «Dos voces» (3.62): dónde empieza un grupo de mensajes del dueño (para su avatar y nombre) y dónde entra el dueño
  // después de una respuesta de Empre AI (el relevo).
  const voices = useMemo(() => {
    const ownerStart = new Set<string>();
    const handoff = new Set<string>();
    let prevOwner = false;
    let sawAi = false;
    for (const r of [...rows].reverse()) {
      const isAi = 'ai' in r ? r.ai === 'answer' : r.kind === 'ai_answer';
      const isOwner = !('ai' in r) && r.sent_by_entity && r.kind !== 'ai_answer';
      if (isOwner && !prevOwner) ownerStart.add(r.id);
      if (isOwner && sawAi) handoff.add(r.id);
      if (isAi) sawAi = true;
      if (isOwner) sawAi = false;
      prevOwner = isOwner;
    }
    return { ownerStart, handoff };
  }, [rows]);
  const businessName = answerData?.name ?? name ?? 'el negocio';

  const suggestions = useMemo(() => (answerData && aiOn ? suggestQuestions(answerData, answeredIntents as ReadonlySet<Intent>, 3) : []), [answerData, aiOn, answeredIntents]);
  const teach = (params: { intent?: string; question?: string }) => router.push({ pathname: '/business/teach/[id]', params: { id: entityId, ...params } });

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

    const sent = chat.send({ entity_id: entityId, user_id: customerId, sent_by_entity: sentByEntity, content, ...(attached ? { item_id: attached.id } : {}) });
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
        ...(attached ? { item_id: attached.id, item: attached } : {}),
      },
      ...prev,
    ]);
    setAttached(null);
    setText('');
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    void askEmpreAI(content);
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

      {!sentByEntity && (todayHours || (!aiOn && replyText)) ? (
        <View style={styles.infoBar}>
          <Ionicons name="time-outline" size={13} color={colors.muted} />
          <Text style={styles.infoBarText} numberOfLines={1}>
            {[todayHours, aiOn ? null : replyText].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}
      {!sentByEntity && aiOn ? <ChatVoices avatar={avatar} businessName={businessName} online={connected && otherOnline} ownerSub={connected && otherOnline ? 'En línea ahora' : replyText ?? 'Te responde por aquí'} mood={mood} /> : null}

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
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messages}
            renderItem={({ item: row }) => {
            if ('ai' in row) {
              return row.ai === 'answer' ? (
                <AiAnswerBubble
                  answer={row.answer}
                  businessName={answerData?.name ?? name ?? 'el negocio'}
                  onAction={onAiAction}
                  onChoose={onAiChoose(row.intent)}
                  onFeedback={(useful) => {
                    track('ai_answer_feedback', entityId, { intent: row.intent, useful });
                    if (useful) showMood('contento', 1400);
                  }}
                />
              ) : (
                <AiStatusLine text={row.text} />
              );
            }
            const item = row;
            if (item.kind === 'ai_answer' && item.ai_intent) {
              const intent = item.ai_intent as Intent;
              const when = new Date(item.created_at);
              const built = answerData ? buildAnswer(answerData, intent, { serviceId: item.ai_service_id, taughtId: item.ai_answer_id, weekday: when.getDay(), now: openedAt }) : null;
              if (sentByEntity) return <AiAnswerOwnerRow summary={item.content} answer={built} onCorrect={() => teach({ intent: intent === 'custom' ? '' : intent })} />;
              return built ? (
                <AiAnswerBubble
                  answer={built}
                  businessName={answerData?.name ?? name ?? 'el negocio'}
                  onAction={onAiAction}
                  onChoose={onAiChoose(intent)}
                  onFeedback={(useful) => {
                    track('ai_answer_feedback', entityId, { intent, useful });
                    if (useful) showMood('contento', 1400);
                  }}
                />
              ) : null;
            }
            const mine = item.sender_id === user?.id;
            const ownerVoice = !sentByEntity && aiOn && !mine && item.sent_by_entity;
            return (
              <View>
                {dayStarts.has(item.id) ? (
                  <View style={styles.daySeparator}>
                    <Text style={styles.daySeparatorText}>{formatDayLabel(item.created_at)}</Text>
                  </View>
                ) : null}
                {!sentByEntity && voices.handoff.has(item.id) ? <HandoffLine /> : null}
                {FEATURES.agenda && item.kind === 'appointment' && item.appointment_id ? (
                  <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                    <AppointmentCard appointmentId={item.appointment_id} />
                  </View>
                ) : (
                <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs, ownerVoice && styles.ownerRow]}>
                  {ownerVoice ? <View style={styles.ownerAvatarSlot}>{voices.ownerStart.has(item.id) ? <OwnerAvatar uri={avatar} name={businessName} /> : null}</View> : null}
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, item.item && styles.bubbleWithItem, ownerVoice && styles.ownerBubble]}>
                    {ownerVoice && voices.ownerStart.has(item.id) ? <Text style={styles.ownerLabel}>{`El dueño · ${businessName}`}</Text> : null}
                    {item.item ? (
                      <ChatItemCard
                        item={item.item}
                        mine={mine}
                        onPress={() => router.push({ pathname: '/business/product', params: { entityId, itemId: item.item!.id } })}
                      />
                    ) : null}
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
                )}
                {sentByEntity && item.ai_unanswered ? <TeachLink onPress={() => teach({ question: item.content })} /> : null}
              </View>
            );
            }}
          />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {authStatus === 'signedIn' && !sentByEntity && suggestions.length ? <Text style={styles.faqLabel}>Preguntas frecuentes · respuesta al instante</Text> : null}
      {authStatus === 'signedIn' && !sentByEntity ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRepliesScroll}
          contentContainerStyle={styles.quickReplies}
        >
          {(suggestions.length ? suggestions : QUICK_REPLIES.map((label) => ({ label, intent: undefined as Intent | undefined }))).map(({ label, intent }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              onPress={() => {
                if (sendQuick(label)) void askEmpreAI(label, intent);
              }}
              disabled={!connected}
              style={({ pressed }) => [styles.quickReplyChip, (pressed || !connected) && { opacity: 0.6 }]}
            >
              {intent ? <Ionicons name="sparkles" size={12} color={colors.ink} /> : null}
              <Text style={styles.quickReplyText}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {authStatus === 'signedIn' && attached ? (
        <View style={styles.attached}>
          <Text style={styles.attachedLabel}>Preguntas por</Text>
          <ChatItemCard item={attached} onRemove={() => setAttached(null)} />
        </View>
      ) : null}

      {authStatus === 'signedIn' ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            value={text}
            onChangeText={(value) => {
              setText(value);
              if (error) setError(null);
            }}
            placeholder={!sentByEntity && aiOn ? 'Escríbele al dueño o pregunta' : 'Escribe un mensaje'}
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
  faqLabel: { paddingHorizontal: spacing.lg, paddingTop: 6, fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted },
  ownerRow: { alignItems: 'flex-end', gap: 8 },
  ownerAvatarSlot: { width: 28 },
  ownerBubble: { shadowColor: '#0E2346', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  ownerLabel: { marginBottom: 2, fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.verified },
  quickReplies: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  // Preguntas frecuentes (3.62): blancas, en tinta y de 44 px; el destello marca las que responde Empre AI.
  quickReplyChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  quickReplyText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
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
  bubbleWithItem: { gap: spacing.xs, paddingTop: spacing.xs + 2, paddingHorizontal: spacing.xs + 2 },
  attached: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 4, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  attachedLabel: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
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
