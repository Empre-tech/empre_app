import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
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
import { chatApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { useChat } from '@/chat/ChatProvider';
import { Chispa, type ChispaMood } from '@/components/ai/Chispa';
import { Avatar } from '@/components/Avatar';
import { detectIntent } from '@/lib/answers';
import {
  answerMany,
  askDraft,
  MANY_LABEL,
  manyIntentOf,
  manySuggestions,
  toRow,
  unknownMany,
  type ManyAnswer,
  type ManyIntent,
  type ManyLine,
  type ManyRow,
} from '@/lib/askMany';
import { chatItemParam } from '@/lib/chatItem';
import type { MarketItem } from '@/lib/offerMarket';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius, softShadow } from '@/theme';

/** De dónde salió la respuesta (modelo de uso, 3.64): reglas, clasificador del servidor o el dueño. */
type Source = 'rule' | 'classify' | 'owner';

interface Turn {
  id: string;
  question: string;
  text?: string;
  answer: ManyAnswer | null;
  /** Negocios a los que ya se les preguntó por chat en este turno. */
  sent: string[];
}

// Lo que ya clasificó el servidor en esta sesión: la misma pregunta no se paga dos veces (3.64).
const classified = new Map<string, ManyIntent | null>();
const keyOf = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ICON: Record<ManyIntent, keyof typeof Ionicons.glyphMap> = {
  price: 'cash-outline',
  open: 'time-outline',
  offers: 'pricetag-outline',
  duration: 'hourglass-outline',
};
const TINT: Record<ManyIntent, { bg: string; ink: string }> = {
  price: { bg: colors.selectedSoft, ink: colors.ink },
  open: { bg: colors.verifiedSoft, ink: colors.verified },
  offers: { bg: colors.accentSoft, ink: colors.warning },
  duration: { bg: colors.selectedSoft, ink: colors.ink },
};

interface Props {
  visible: boolean;
  /** El producto o servicio por el que se pregunta («Corte clásico»). */
  product: string;
  /** El negocio de la ficha primero y los demás que ofrecen lo mismo (`sameItemPeers`). */
  items: MarketItem[];
  onClose: () => void;
}

/**
 * «Pregúntales a los N» (3.64): una conversación tipo IA con varios negocios a la vez. Empre AI responde con plantillas
 * sobre lo que cada uno publicó; la IA del servidor solo clasifica, una vez, lo que las reglas no entienden; lo que nadie
 * publicó se le pregunta al dueño por el chat.
 */
export function AskManySheet({ visible, product, items, onClose }: Props) {
  const reduce = useReduceMotion();
  return (
    <Modal visible={visible} animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose} presentationStyle="fullScreen">
      {visible ? <Panel product={product} items={items} onClose={onClose} /> : null}
    </Modal>
  );
}

function Panel({ product, items, onClose }: Omit<Props, 'visible'>) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduce = useReduceMotion();
  const { status, user } = useAuth();
  const chat = useChat();
  const rows = useMemo(() => items.map(toRow), [items]);
  const n = rows.length;
  const suggestions = useMemo(() => manySuggestions(rows), [rows]);
  const near = rows.every((r) => r.item.distance_meters !== null && r.item.distance_meters < 1000);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<ChispaMood>('reposo');
  const scroll = useRef<ScrollView>(null);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const busy = turns.some((t) => t.answer === null);
  const entityId = rows[0]?.entityId;

  const finish = (id: string, a: ManyAnswer, source: Source) => {
    const t = setTimeout(
      () => {
        setTurns((all) => all.map((x) => (x.id === id ? { ...x, answer: a } : x)));
        setMood(a.intent === 'unknown' ? 'nosabe' : 'responde');
        if (entityId) track('ai_answer_source', entityId, { intent: a.intent, source, businesses: n });
      },
      reduce ? 250 : 1100,
    );
    timers.current.push(t);
  };

  const ask = async (intent: ManyIntent | null, question: string, typed?: string) => {
    if (busy || !n) return;
    seq.current += 1;
    const id = `t${seq.current}`;
    setTurns((all) => [...all, { id, question, text: typed, answer: null, sent: [] }]);
    setMood('pensando');
    // Niveles 0 y 1: tocada o entendida por reglas. Cero costo.
    let mi = intent;
    let source: Source = 'rule';
    if (!mi && typed) {
      const d = detectIntent(typed, []);
      mi = manyIntentOf(d.intent);
      // Nivel 3: nadie la entendió. Una sola clasificación por pregunta, no por negocio, y guardada.
      if (!mi && d.intent === 'unknown' && status === 'signedIn' && entityId) {
        const key = keyOf(typed);
        if (classified.has(key)) mi = classified.get(key) ?? null;
        else {
          const c = await chatApi.classify(entityId, typed).catch(() => null);
          mi = c ? manyIntentOf(c.intent) : null;
          if (c) classified.set(key, mi);
        }
        if (mi) source = 'classify';
      }
    }
    // Nivel 4: tampoco se entendió o no es algo que la Vitrina sepa: se les pregunta a los dueños.
    finish(id, mi ? answerMany(mi, rows, product) : unknownMany(rows), mi ? source : 'owner');
  };

  const submit = () => {
    const q = text.trim();
    if (!q) return;
    setText('');
    void ask(null, q, q);
  };

  const sendTo = (turn: Turn, targets: ManyRow[]) => {
    if (status !== 'signedIn' || !user) {
      onClose();
      router.push('/(auth)/login');
      return;
    }
    const intent = turn.answer?.intent ?? 'unknown';
    const draft = askDraft(intent, product, turn.text);
    const ok: string[] = [];
    let failed: ManyRow | null = null;
    for (const r of targets) {
      const sent = chat.send({ entity_id: r.entityId, user_id: user.id, sent_by_entity: false, content: draft, ...(r.item.service_id ? { item_id: r.item.service_id } : {}) });
      if (sent) {
        ok.push(r.entityId);
        track('contact_started', r.entityId);
      } else if (!failed) failed = r;
    }
    if (ok.length) {
      setTurns((all) => all.map((x) => (x.id === turn.id ? { ...x, sent: [...x.sent, ...ok] } : x)));
      setMood('nosabe');
    }
    // Sin conexión en vivo: se abre el chat con la pregunta ya escrita, para enviarla a mano.
    if (failed) {
      onClose();
      router.push({
        pathname: '/chat/[entityId]',
        params: {
          entityId: failed.entityId,
          name: failed.name,
          draft,
          item: chatItemParam({ id: failed.item.service_id ?? failed.item.id, name: failed.item.title, price: failed.item.service_price ?? null, price_from: Boolean(failed.item.price_from), ...(failed.item.photo ? { photo: failed.item.photo } : {}) }),
        },
      });
    }
  };

  const openBusiness = (r: ManyRow) => {
    onClose();
    router.push({ pathname: '/business/[id]', params: { id: r.entityId } });
  };
  const openProduct = (r: ManyRow) => {
    onClose();
    if (r.item.service_id) router.push({ pathname: '/business/product', params: { entityId: r.entityId, itemId: r.item.service_id } });
    else router.push({ pathname: '/business/[id]', params: { id: r.entityId } });
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTurns([]);
    setMood('reposo');
  };

  const last = turns[turns.length - 1];
  const moodText = !last ? 'Responde al instante con lo publicado' : last.answer === null ? `Revisando ${n} negocios…` : last.sent.length ? 'Le pasó la pregunta a los dueños' : last.answer.intent === 'unknown' ? 'Esto lo saben los dueños' : 'Respondió con lo publicado';

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Empre AI
          </Text>
          <Text style={styles.headerSub} accessibilityLiveRegion="polite">
            {moodText}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Nueva pregunta" disabled={!turns.length} onPress={reset} style={[styles.iconBtn, !turns.length && styles.dim]}>
          <Ionicons name="create-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.context} accessible accessibilityLabel={`${product}, en ${n} negocios${near ? ' a menos de 1 kilómetro' : ''}`}>
        <View style={styles.contextIcon}>
          <Ionicons name="pricetag" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.contextTitle} numberOfLines={1}>
            {product}
          </Text>
          <Text style={styles.contextSub}>{`${n} negocios${near ? ' a menos de 1 km' : ' cerca'}`}</Text>
        </View>
        <View style={styles.faces}>
          {rows.map((r, i) => (
            <View key={r.entityId} style={[styles.face, i > 0 && { marginLeft: -7 }]}>
              <Avatar name={r.name} size={24} />
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: !reduce })}
      >
        {!turns.length ? (
          <View>
            <View style={styles.hero}>
              <Chispa size={92} mood="reposo" />
              <Text style={styles.heroTitle}>{`Pregúntales a los ${n}\nde una vez`}</Text>
              <Text style={styles.heroBody}>Te respondo al instante con lo que cada negocio publicó. Lo que no sé, se lo pregunto a ellos por chat.</Text>
            </View>
            <View style={styles.grid}>
              {suggestions.map((s, i) => (
                <Enter key={s} delay={i * 70} style={styles.gridCell}>
                  <Pressable accessibilityRole="button" onPress={() => void ask(s, MANY_LABEL[s].ask)} style={({ pressed }) => [styles.sugCard, pressed && styles.pressed]}>
                    <View style={[styles.sugIcon, { backgroundColor: TINT[s].bg }]}>
                      <Ionicons name={ICON[s]} size={15} color={TINT[s].ink} />
                    </View>
                    <Text style={styles.sugText}>{MANY_LABEL[s].ask}</Text>
                  </Pressable>
                </Enter>
              ))}
            </View>
          </View>
        ) : (
          turns.map((t) => (
            <TurnView
              key={t.id}
              turn={t}
              rows={rows}
              live={t === last}
              mood={mood}
              suggestions={suggestions}
              onAsk={(s) => void ask(s, MANY_LABEL[s].ask)}
              onSend={(targets) => sendTo(t, targets)}
              onOpenBusiness={openBusiness}
              onOpenProduct={openProduct}
            />
          ))
        )}
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            returnKeyType="send"
            placeholder={`Pregúntales a los ${n}…`}
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            accessibilityLabel={`Pregunta para los ${n} negocios`}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar pregunta"
            disabled={!text.trim() || busy}
            onPress={submit}
            style={[styles.sendBtn, (!text.trim() || busy) && styles.sendOff]}
          >
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>Responde con lo publicado. Los precios los confirma el negocio.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Entrada de 10 px con la curva enfática; sin movimiento con «Reducir movimiento». */
function Enter({ delay = 0, style, children }: { delay?: number; style?: object; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) return;
    Animated.timing(v, { toValue: 1, duration: 340, delay, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }, [reduce, v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}

function TurnView({
  turn,
  rows,
  live,
  mood,
  suggestions,
  onAsk,
  onSend,
  onOpenBusiness,
  onOpenProduct,
}: {
  turn: Turn;
  rows: ManyRow[];
  live: boolean;
  mood: ChispaMood;
  suggestions: ManyIntent[];
  onAsk: (s: ManyIntent) => void;
  onSend: (targets: ManyRow[]) => void;
  onOpenBusiness: (r: ManyRow) => void;
  onOpenProduct: (r: ManyRow) => void;
}) {
  const a = turn.answer;
  const thinking = a === null;
  const steps = ['Entendí la pregunta', `Revisé lo publicado por ${rows.length} negocios`, 'Separé precios de ofertas'];
  const pending = a ? a.missing.filter((r) => !turn.sent.includes(r.entityId)) : [];
  const next = a ? suggestions.filter((s) => s !== a.intent).slice(0, 3) : [];
  const status = thinking ? 'Revisando…' : turn.sent.length ? 'Le preguntó a los dueños' : a.intent === 'unknown' ? 'No está en lo publicado' : `Respondió · ${rows.length} negocios`;

  return (
    <View style={styles.turn}>
      <Enter style={styles.mine}>
        <Text style={styles.mineText}>{turn.question}</Text>
      </Enter>

      <View style={styles.aiRow}>
        <Chispa size={30} mood={live ? mood : 'reposo'} animated={live && mood !== 'reposo'} />
        <Text style={styles.aiName}>Empre AI</Text>
        <Text style={styles.aiStatus}>{status}</Text>
      </View>

      <View style={styles.aiBody}>
        {thinking ? (
          <View style={styles.steps} accessibilityLabel="Empre AI está revisando lo que publicaron los negocios">
            {steps.map((s, i) => (
              <Enter key={i} delay={i * 320} style={styles.step}>
                <View style={[styles.stepDot, i === 0 && styles.stepDotDone]}>{i === 0 ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}</View>
                <Text style={styles.stepText}>{s}</Text>
              </Enter>
            ))}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sources} accessibilityLabel={`Consultó a ${rows.map((r) => r.name).join(', ')}`}>
          {rows.map((r, i) => (
            <Enter key={r.entityId} delay={thinking ? 400 + i * 120 : 0} style={styles.source}>
              <Avatar name={r.name} size={20} />
              <Text style={styles.sourceText} numberOfLines={1}>
                {r.name}
              </Text>
            </Enter>
          ))}
        </ScrollView>

        {a ? (
          <>
            <Enter>
              <Text style={styles.summary} accessibilityLiveRegion="polite">
                {a.summary.lead}
                <Text style={styles.summaryBold}>{a.summary.bold}</Text>
                {a.summary.tail}
              </Text>
            </Enter>

            {a.top ? <TopCard line={a.top} tag={a.topTag} onBook={() => onOpenProduct(a.top!.row)} onOpen={() => onOpenBusiness(a.top!.row)} /> : null}

            {a.rest.length || (a.intent === 'unknown' && a.missing.length) ? (
              <Enter delay={200} style={styles.list}>
                {(a.intent === 'unknown' ? a.missing.map<ManyLine>((r) => ({ row: r, main: null, sub: '', known: false })) : a.rest).map((l, i) => (
                  <RowView key={l.row.entityId} line={l} first={i === 0} sent={turn.sent.includes(l.row.entityId)} intent={a.intent} onAsk={() => onSend([l.row])} onOpen={() => onOpenBusiness(l.row)} />
                ))}
              </Enter>
            ) : null}

            {a.intent === 'offers' && a.rest.length === 0 && a.top && rows.length > 1 ? (
              <Text style={styles.note}>{`Los otros ${rows.length - 1} no tienen oferta publicada para esto.`}</Text>
            ) : null}

            {pending.length > 1 ? (
              <Pressable accessibilityRole="button" onPress={() => onSend(pending)} style={({ pressed }) => [styles.askAll, pressed && styles.pressed]}>
                <Ionicons name="chatbubbles-outline" size={17} color="#FFFFFF" />
                <Text style={styles.askAllText}>{`Preguntarles a los ${pending.length} por chat`}</Text>
              </Pressable>
            ) : null}

            {turn.sent.length ? (
              <Enter style={styles.handoff}>
                <View style={styles.handoffLine} />
                <Text style={styles.handoffText}>{turn.sent.length === 1 ? 'Le pregunté al dueño · te aviso cuando responda' : `Les pregunté a ${turn.sent.length} dueños · te aviso cuando respondan`}</Text>
                <View style={styles.handoffLine} />
              </Enter>
            ) : null}

            {a.intent !== 'unknown' ? <Text style={styles.note}>Orden: abiertos y más cerca primero. Nadie paga por aparecer.</Text> : null}

            {next.length ? (
              <View style={styles.nextRow}>
                {next.map((s) => (
                  <Pressable key={s} accessibilityRole="button" accessibilityLabel={MANY_LABEL[s].ask} onPress={() => onAsk(s)} style={({ pressed }) => [styles.nextChip, pressed && styles.pressed]}>
                    <Ionicons name="arrow-forward" size={13} color={colors.ink} style={{ transform: [{ rotate: '-45deg' }] }} />
                    <Text style={styles.nextText}>{MANY_LABEL[s].short}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

function TopCard({ line, tag, onBook, onOpen }: { line: ManyLine; tag: string; onBook: () => void; onOpen: () => void }) {
  const r = line.row;
  return (
    <Enter delay={120} style={styles.top}>
      <Text style={styles.topTag}>{tag}</Text>
      <View style={styles.topRow}>
        <Avatar name={r.name} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.topName} numberOfLines={1}>
            {r.name}
          </Text>
          <Text style={[styles.rowSub, { color: r.open ? colors.verified : colors.muted }]} numberOfLines={1}>
            {openText(r)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {line.main ? <Text style={styles.topValue}>{line.main}</Text> : null}
          {line.sub ? <Text style={styles.valueSub}>{line.sub}</Text> : null}
        </View>
      </View>
      {r.offer ? (
        <View style={styles.offerTag}>
          <Text style={styles.offerTagText} numberOfLines={1}>{`Oferta aparte · ${r.offer}`}</Text>
        </View>
      ) : null}
      <View style={styles.topActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${r.item.bookable ? 'Reservar' : 'Ver'} ${r.item.title} en ${r.name}`} onPress={onBook} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{r.item.bookable ? 'Reservar' : 'Ver producto'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${r.name}`} onPress={onOpen} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Ver negocio</Text>
        </Pressable>
      </View>
    </Enter>
  );
}

const MISSING_TEXT: Record<ManyIntent | 'unknown', string> = {
  price: 'No publicó su precio',
  duration: 'No publicó cuánto demora',
  open: 'No publicó su horario',
  offers: '',
  unknown: 'Puede responderte el dueño',
};

function openText(r: ManyRow): string {
  const open = r.open === null ? null : r.open ? (r.openUntil ? `Abierto · cierra ${r.openUntil}` : 'Abierto ahora') : 'Cerrado ahora';
  return [open, r.dist].filter(Boolean).join(' · ');
}

function RowView({ line, first, sent, intent, onAsk, onOpen }: { line: ManyLine; first: boolean; sent: boolean; intent: ManyIntent | 'unknown'; onAsk: () => void; onOpen: () => void }) {
  const r = line.row;
  const sub = line.known ? openText(r) : [MISSING_TEXT[intent], r.dist].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${r.name}. ${line.main ?? MISSING_TEXT[intent]}. ${sub}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.row, !first && styles.rowSep, pressed && styles.pressed]}
    >
      <Avatar name={r.name} size={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {r.name}
        </Text>
        <Text style={[styles.rowSub, line.known && r.open ? { color: colors.verified } : null]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {line.known ? (
        <View style={{ alignItems: 'flex-end' }}>
          {line.main ? <Text style={[styles.rowValue, line.main === 'Cerrado' && { color: colors.muted }]}>{line.main}</Text> : null}
          {line.sub ? <Text style={styles.valueSub}>{line.sub}</Text> : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sent ? `Ya le preguntaste a ${r.name}` : `Preguntarle a ${r.name} por chat`}
          accessibilityState={{ disabled: sent }}
          disabled={sent}
          onPress={onAsk}
          style={({ pressed }) => [styles.askBtn, sent && styles.askBtnSent, pressed && styles.pressed]}
        >
          <Ionicons name={sent ? 'checkmark' : 'chatbubble-outline'} size={14} color={sent ? colors.verified : '#FFFFFF'} />
          <Text style={[styles.askText, sent && { color: colors.verified }]}>{sent ? 'Preguntado' : 'Preguntarle'}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingTop: 6 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
  headerMid: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: fonts.display.bold, fontSize: 17, color: colors.ink },
  headerSub: { fontFamily: fonts.ui.bold, fontSize: 11.5, color: colors.muted },
  context: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 4, padding: 8, paddingRight: 12, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  contextIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  contextTitle: { fontFamily: fonts.ui.extrabold, fontSize: 14, color: colors.ink },
  contextSub: { fontFamily: fonts.ui.bold, fontSize: 12, color: colors.muted },
  faces: { flexDirection: 'row' },
  face: { borderRadius: 13, borderWidth: 2, borderColor: colors.surface },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 18 },
  hero: { alignItems: 'center', gap: 10, paddingTop: 22 },
  heroTitle: { marginTop: 6, fontFamily: fonts.display.bold, fontSize: 22, lineHeight: 26, color: colors.ink, textAlign: 'center' },
  heroBody: { maxWidth: 300, fontFamily: fonts.ui.semibold, fontSize: 13.5, lineHeight: 19, color: colors.muted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  gridCell: { width: '48.6%' },
  sugCard: { minHeight: 80, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'space-between', gap: 8 },
  sugIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sugText: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, lineHeight: 17, color: colors.ink },
  turn: { gap: 10 },
  mine: { alignSelf: 'flex-end', maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: 6, backgroundColor: colors.ink },
  mineText: { fontFamily: fonts.ui.bold, fontSize: 14, lineHeight: 19, color: '#FFFFFF' },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiName: { fontFamily: fonts.ui.extrabold, fontSize: 13, color: colors.ink },
  aiStatus: { fontFamily: fonts.ui.bold, fontSize: 12, color: colors.muted },
  aiBody: { marginLeft: 38, gap: 10 },
  steps: { gap: 6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: '#14B8B0' },
  stepText: { fontFamily: fonts.ui.bold, fontSize: 12.5, color: colors.muted },
  sources: { gap: 6, paddingRight: 16 },
  source: { height: 30, paddingLeft: 4, paddingRight: 10, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceText: { maxWidth: 140, fontFamily: fonts.ui.extrabold, fontSize: 12, color: colors.ink },
  summary: { fontFamily: fonts.ui.semibold, fontSize: 14.5, lineHeight: 21, color: colors.ink },
  summaryBold: { fontFamily: fonts.ui.extrabold },
  top: { padding: 12, borderRadius: 18, backgroundColor: colors.surface, gap: 10, ...softShadow },
  topTag: { fontFamily: fonts.ui.extrabold, fontSize: 11.5, letterSpacing: 0.2, color: colors.verified },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topName: { fontFamily: fonts.ui.extrabold, fontSize: 14.5, color: colors.ink },
  topValue: { fontFamily: fonts.display.bold, fontSize: 19, color: colors.ink },
  valueSub: { fontFamily: fonts.ui.bold, fontSize: 11.5, color: colors.muted },
  offerTag: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.accentSoft },
  offerTagText: { fontFamily: fonts.ui.extrabold, fontSize: 12, color: colors.warning },
  topActions: { flexDirection: 'row', gap: 6 },
  primaryBtn: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, color: '#FFFFFF' },
  secondaryBtn: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, color: colors.ink },
  list: { borderRadius: 18, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { minHeight: 58, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowSep: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowName: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, color: colors.ink },
  rowSub: { fontFamily: fonts.ui.bold, fontSize: 11.5, color: colors.muted },
  rowValue: { fontFamily: fonts.display.bold, fontSize: 15.5, color: colors.ink },
  askBtn: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', gap: 5 },
  askBtnSent: { backgroundColor: colors.verifiedSoft, borderWidth: 1.5, borderColor: '#14B8B0' },
  askText: { fontFamily: fonts.ui.extrabold, fontSize: 12.5, color: '#FFFFFF' },
  askAll: { minHeight: 46, borderRadius: 14, backgroundColor: colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  askAllText: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, color: '#FFFFFF' },
  handoff: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  handoffLine: { flex: 1, height: 1, backgroundColor: '#CFE9EC' },
  handoffText: { flexShrink: 1, fontFamily: fonts.ui.extrabold, fontSize: 12, color: colors.verified, textAlign: 'center' },
  note: { fontFamily: fonts.ui.bold, fontSize: 11.5, color: colors.muted },
  nextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nextChip: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextText: { fontFamily: fonts.ui.extrabold, fontSize: 13, color: colors.ink },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: colors.bg },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 16, padding: 6, borderRadius: 28, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  input: { flex: 1, minHeight: 44, fontFamily: fonts.ui.semibold, fontSize: 14.5, color: colors.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
  disclaimer: { marginTop: 6, textAlign: 'center', fontFamily: fonts.ui.bold, fontSize: 11, color: colors.faint },
  pressed: { opacity: 0.85 },
});
