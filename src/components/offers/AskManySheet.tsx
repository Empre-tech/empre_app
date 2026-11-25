import { Ionicons } from '@/components/Icon';
import { RememberSize } from '@/components/ai/RememberSize';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
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
import { TypeIn, typeMs } from '@/components/chat/EmpreVoice';
import { asksCommitment, detectIntent } from '@/lib/answers';
import {
  answerMany,
  askDraft,
  MANY_LABEL,
  bestIntentOf,
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
import { KeyboardSheet } from '@/components/KeyboardSheet';

/** De dónde salió la respuesta (modelo de uso, 3.64): reglas, clasificador, la ficha de cada negocio o el dueño. */
type Source = 'rule' | 'classify' | 'ficha' | 'owner';

/** Lo que Empre AI leyó en la ficha publicada de un negocio (nivel 3, 2026-11-14). */
interface FichaLine {
  row: ManyRow;
  text: string;
}

interface Turn {
  id: string;
  question: string;
  text?: string;
  answer: ManyAnswer | null;
  /** Negocios a los que ya se les preguntó por chat en este turno. */
  sent: string[];
  /** Lo que no estaba en las reglas pero sí en la ficha de algunos negocios. */
  ficha?: FichaLine[];
  /** Pide un compromiso (apartar, rebajar…): lo responden los dueños. */
  owner?: boolean;
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
  best: 'git-compare-outline',
  price: 'cash-outline',
  open: 'time-outline',
  offers: 'pricetag-outline',
  duration: 'hourglass-outline',
};
const TINT: Record<ManyIntent, { bg: string; ink: string }> = {
  best: { bg: colors.primarySoft, ink: colors.primaryDark },
  price: { bg: colors.selectedSoft, ink: colors.ink },
  open: { bg: colors.verifiedSoft, ink: colors.verified },
  offers: { bg: colors.accentSoft, ink: colors.accentInk },
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

  const finish = (id: string, a: ManyAnswer, source: Source, extra: { ficha?: FichaLine[]; owner?: boolean } = {}) => {
    const t = setTimeout(
      () => {
        setTurns((all) => all.map((x) => (x.id === id ? { ...x, answer: a, ...extra } : x)));
        setMood(a.intent === 'unknown' && !extra.ficha?.length ? 'nosabe' : 'responde');
        if (entityId) track('ai_answer_source', entityId, { intent: a.intent, source, businesses: n });
      },
      reduce ? 250 : 1100,
    );
    timers.current.push(t);
  };

  const ask = async (intent: ManyIntent | null, question: string, typed?: string) => {
    // Al preguntar se baja el teclado: la respuesta tiene que verse completa.
    Keyboard.dismiss();
    if (busy || !n) return;
    seq.current += 1;
    const id = `t${seq.current}`;
    setTurns((all) => [...all, { id, question, text: typed, answer: null, sent: [] }]);
    setMood('pensando');
    // Niveles 0 y 1: tocada o entendida por reglas. Cero costo.
    let mi = intent;
    let source: Source = 'rule';
    // Un compromiso (apartar, rebajar, encargar…) lo responden los dueños: Empre AI no lo intenta (2026-11-14).
    if (!mi && typed && asksCommitment(typed)) {
      finish(id, unknownMany(rows), 'owner', { owner: true });
      return;
    }
    if (!mi && typed) {
      const d = detectIntent(typed, []);
      // «¿Cuál es mejor?» se responde comparando lo que se sabe de cada uno.
      mi = bestIntentOf(typed) ?? manyIntentOf(d.intent);
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
    if (mi) {
      finish(id, answerMany(mi, rows, product), source);
      return;
    }
    // Nivel 3: Empre AI lee la ficha publicada de cada uno (descripción, carta, reseñas), en una sola lectura.
    let ficha: FichaLine[] = [];
    if (typed && status === 'signedIn') {
      const r = await chatApi.fichaMany(rows.slice(0, 5).map((x) => x.entityId), typed).catch(() => null);
      ficha = (r?.answers ?? []).flatMap((x) => {
        const row = rows.find((y) => y.entityId === x.entity_id);
        return row && x.known && x.text ? [{ row, text: x.text }] : [];
      });
    }
    // Nivel 4: lo que nadie publicó se les pregunta a los dueños.
    const base = unknownMany(rows);
    finish(id, { ...base, missing: base.missing.filter((r) => !ficha.some((f) => f.row.entityId === r.entityId)) }, ficha.length ? 'ficha' : 'owner', { ficha });
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

  return (
    // En Android un Modal de pantalla completa no se encoge con el teclado: sin «height», la caja quedaba debajo.
    <KeyboardSheet style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Empre AI
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {`${product} · ${n} negocios${near ? ' a menos de 1 km' : ' cerca'}`}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Nueva pregunta" disabled={!turns.length} onPress={reset} style={[styles.iconBtn, !turns.length && styles.dim]}>
          <Ionicons name="create-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        // Deslizar la conversación o tocar fuera de la caja baja el teclado.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: !reduce })}
      >
        {!turns.length ? (
          <View>
            <View style={styles.hero}>
              <Chispa size={92} mood="reposo" />
              <Text style={styles.heroTitle}>{`Pregúntales a los ${n}\nde una vez`}</Text>
              <Text style={styles.heroBody}>Te respondo al instante con lo que cada negocio publicó; los precios los confirma cada uno. Lo que no sé, se lo pregunto a ellos por chat.</Text>
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
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Seguir en Empre AI, en su propia pantalla"
              onPress={() => {
                onClose();
                router.push({ pathname: '/ask', params: { q: text.trim() || product } });
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.footLink, pressed && styles.pressed]}
            >
              <Text style={styles.footLinkText}>Seguir en Empre AI</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.ink} />
            </Pressable>
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
        {last ? <RememberSize text={last.question} /> : null}
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            returnKeyType="send"
            placeholder={`Pregúntales a los ${n}…`}
            placeholderTextColor={colors.faint}
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
            <Ionicons name="arrow-up" size={20} color={colors.ink} />
          </Pressable>
        </View>
      </View>
    </KeyboardSheet>
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
  const ficha = turn.ficha ?? [];
  // Lo que nadie publicó (o un compromiso): Empre AI no aparece; solo una línea y preguntarles por chat.
  const silent = a !== null && a.intent === 'unknown' && ficha.length === 0;
  const pending = a ? a.missing.filter((r) => !turn.sent.includes(r.entityId)) : [];
  const next = a && !silent ? suggestions.filter((s) => s !== a.intent).slice(0, 2) : [];
  // Cada frase se escribe después de la anterior; lo de abajo entra cuando terminó.
  const leads = a && a.intent === 'unknown' ? ficha.map((f) => [{ t: f.row.name, bold: true }, { t: `: ${f.text}` }]) : a ? [[{ t: a.summary.lead }, { t: a.summary.bold, bold: true }, { t: a.summary.tail }]] : [];
  const starts: number[] = [];
  let at = 0;
  for (const l of leads) {
    starts.push(at);
    at += typeMs(l) + 120;
  }
  const after = live ? at : 0;
  const sources = a && a.intent === 'unknown' ? ficha.map((f) => f.row) : rows;
  const quietText = turn.owner
    ? 'Esto lo responden los dueños.'
    : rows.length === 1
      ? 'No lo publicó.'
      : ficha.length
        ? `${pending.length === 1 ? pending[0].name : `Los otros ${pending.length}`} no lo publicaron.`
        : 'Ninguno lo publicó.';

  return (
    <View style={styles.turn}>
      <Enter style={styles.mine}>
        <Text style={styles.mineText}>{turn.question}</Text>
      </Enter>

      {thinking ? (
        <View style={styles.aiRow} accessibilityLabel="Empre AI está revisando lo que publicaron los negocios" accessibilityLiveRegion="polite">
          <Chispa size={20} mood="pensando" animated />
          <Text style={styles.thinking}>{`Revisando lo publicado por ${rows.length} negocios…`}</Text>
        </View>
      ) : null}

      {a && !silent ? (
        <>
          <View style={styles.aiRow}>
            <Chispa size={20} mood={live ? mood : 'reposo'} animated={live && mood !== 'reposo'} />
            <Text style={styles.aiName}>Empre AI</Text>
          </View>
          <View style={styles.aiBody}>
            {leads.map((l, i) => (
              <TypeIn key={i} parts={l} play={live} delay={starts[i]} style={styles.summary} boldStyle={styles.summaryBold} />
            ))}
            {/* De dónde salió: las caras de los negocios que leyó y cuántos */}
            <Enter delay={after} style={styles.srcRow}>
              <View style={{ flexDirection: 'row' }}>
                {sources.slice(0, 4).map((r, i) => (
                  <View key={r.entityId} style={[styles.face, i > 0 && { marginLeft: -6 }]}>
                    <Avatar name={r.name} size={18} />
                  </View>
                ))}
              </View>
              <Text style={styles.srcText} numberOfLines={1}>
                {`De lo publicado por ${sources.length === 1 ? sources[0].name : `${sources.length} negocios`}`}
              </Text>
            </Enter>

            {a.top ? <TopCard line={a.top} tag={a.topTag} onBook={() => onOpenProduct(a.top!.row)} onOpen={() => onOpenBusiness(a.top!.row)} /> : null}

            {a.rest.length ? (
              <Enter delay={after + 120} style={styles.list}>
                {a.rest.map((l, i) => (
                  <RowView key={l.row.entityId} line={l} first={i === 0} sent={turn.sent.includes(l.row.entityId)} intent={a.intent} onAsk={() => onSend([l.row])} onOpen={() => onOpenBusiness(l.row)} />
                ))}
              </Enter>
            ) : null}

            {a.intent === 'offers' && a.rest.length === 0 && a.top && rows.length > 1 ? (
              <Text style={styles.note}>{`Los otros ${rows.length - 1} no tienen oferta publicada para esto.`}</Text>
            ) : null}

            {a.intent !== 'unknown' && pending.length > 1 ? (
              <Pressable accessibilityRole="button" onPress={() => onSend(pending)} style={({ pressed }) => [styles.askAll, pressed && styles.pressed]}>
                <Ionicons name="chatbubbles-outline" size={16} color={colors.ink} />
                <Text style={styles.askAllText}>{`Preguntarles a los ${pending.length} por chat`}</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      {/* Lo que no está en lo publicado no es un turno de Empre AI: una línea tranquila y preguntarles por chat */}
      {a && a.intent === 'unknown' && pending.length && !turn.sent.length ? (
        <Enter delay={after} style={[styles.quiet, !silent && styles.aiBody]}>
          <Text style={styles.quietText}>{quietText}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Preguntarle por chat a ${pending.map((r) => r.name).join(', ')}`} onPress={() => onSend(pending)} hitSlop={4} style={({ pressed }) => [styles.quietBtn, pressed && styles.pressed]}>
            <Text style={styles.quietBtnText}>{pending.length === 1 ? 'Preguntarle' : 'Preguntarles'}</Text>
          </Pressable>
        </Enter>
      ) : null}

      {turn.sent.length ? (
        <Enter style={[styles.handoff, !silent && styles.aiBody]}>
          <Ionicons name="checkmark" size={13} color={colors.muted} />
          <Text style={styles.handoffText}>{turn.sent.length === 1 ? 'Enviado · te avisamos cuando responda' : `Enviado a ${turn.sent.length} dueños · te avisamos cuando respondan`}</Text>
        </Enter>
      ) : null}

      {next.length ? (
        <Enter delay={after + 200} style={[styles.nextRow, styles.aiBody]}>
          {next.map((s) => (
            <Pressable key={s} accessibilityRole="button" onPress={() => onAsk(s)} hitSlop={4} style={({ pressed }) => [styles.nextChip, pressed && styles.pressed]}>
              <Text style={styles.nextText}>{MANY_LABEL[s].ask}</Text>
            </Pressable>
          ))}
        </Enter>
      ) : null}
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
  best: 'Puede responderte el dueño',
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
          <Ionicons name={sent ? 'checkmark' : 'chatbubble-outline'} size={14} color={sent ? colors.muted : colors.ink} />
          <Text style={[styles.askText, sent && { color: colors.muted }]}>{sent ? 'Preguntado' : 'Preguntarle'}</Text>
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
  face: { borderRadius: 11, borderWidth: 1.5, borderColor: colors.bg },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 18 },
  hero: { alignItems: 'center', gap: 10, paddingTop: 22 },
  heroTitle: { marginTop: 6, fontFamily: fonts.display.bold, fontSize: 20, lineHeight: 24, color: colors.ink, textAlign: 'center' },
  heroBody: { maxWidth: 300, fontFamily: fonts.ui.semibold, fontSize: 13.5, lineHeight: 19, color: colors.muted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  gridCell: { width: '48.6%' },
  sugCard: { minHeight: 80, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'space-between', gap: 8 },
  sugIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sugText: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, lineHeight: 17, color: colors.ink },
  turn: { gap: 10 },
  mine: { alignSelf: 'flex-end', maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: 6, backgroundColor: colors.sand },
  mineText: { fontFamily: fonts.ui.bold, fontSize: 14, lineHeight: 19, color: colors.ink },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiName: { fontFamily: fonts.ui.extrabold, fontSize: 12.5, color: colors.ink },
  thinking: { flexShrink: 1, fontFamily: fonts.ui.semibold, fontSize: 12.5, color: colors.muted },
  aiBody: { marginLeft: 27, gap: 10 },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  srcText: { flexShrink: 1, fontFamily: fonts.ui.semibold, fontSize: 12, color: colors.muted },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quietText: { flex: 1, fontFamily: fonts.ui.semibold, fontSize: 13, lineHeight: 18, color: colors.muted },
  quietBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  quietBtnText: { fontFamily: fonts.ui.extrabold, fontSize: 13, color: colors.ink },
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
  primaryBtn: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandRef, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, color: colors.ink },
  secondaryBtn: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, color: colors.ink },
  list: { borderRadius: 18, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { minHeight: 58, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowSep: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowName: { fontFamily: fonts.ui.extrabold, fontSize: 13.5, color: colors.ink },
  rowSub: { fontFamily: fonts.ui.bold, fontSize: 11.5, color: colors.muted },
  rowValue: { fontFamily: fonts.display.bold, fontSize: 15.5, color: colors.ink },
  askBtn: { minHeight: 44, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 5 },
  askBtnSent: { backgroundColor: colors.well },
  askText: { fontFamily: fonts.ui.extrabold, fontSize: 12.5, color: colors.ink },
  askAll: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  askAllText: { fontFamily: fonts.ui.extrabold, fontSize: 13, color: colors.ink },
  handoff: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  handoffText: { flexShrink: 1, fontFamily: fonts.ui.semibold, fontSize: 12, color: colors.muted },
  note: { fontFamily: fonts.ui.bold, fontSize: 11.5, color: colors.muted },
  nextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nextChip: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  nextText: { fontFamily: fonts.ui.semibold, fontSize: 13, color: colors.ink },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: colors.bg },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 16, padding: 6, borderRadius: 28, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  input: { flex: 1, minHeight: 44, fontFamily: fonts.ui.semibold, fontSize: 14.5, color: colors.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandRef, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
  footLink: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, marginTop: 10 },
  footLinkText: { fontFamily: fonts.ui.extrabold, fontSize: 13, color: colors.ink },
  pressed: { opacity: 0.85 },
});
