import { Ionicons } from '@/components/Icon';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { Chispa, type ChispaMood } from '@/components/ai/Chispa';
import { BlockView } from '@/components/profile/AskEmpre';
import type { Action, Answer, Intent } from '@/lib/answers';
import { chatActions } from '@/lib/chatAutoAnswer';
import { sliceWords, sourceLine, voice, wordCount } from '@/lib/chatVoice';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, spacing } from '@/theme';

// La voz de Empre AI en el chat con un negocio (3.70; tablero «Empre AI · cuándo responde y cómo se ve», 2026-11-14):
// aparece solo cuando sabe la respuesta. Sin burbuja: la Chispa pequeña con su nombre, la frase que se escribe palabra
// por palabra con el dato en negrita y, debajo, de dónde salió. Lo que no sabe no es un turno suyo: es una línea
// tranquila «Enviado · esto lo responde …» bajo el mensaje.

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Entra subiendo 10 px y apareciendo (380 ms, curva enfática). Sin animación con «Reducir movimiento». */
export function Enter({ delay = 0, play = true, style, children }: { delay?: number; play?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(play ? 0 : 1));
  useEffect(() => {
    if (!play || reduce) {
      v.setValue(1);
      return;
    }
    const a = Animated.timing(v, { toValue: 1, duration: 380, delay, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, delay, play, reduce]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}

/** La cabecera de cada turno: la Chispa, «Empre AI» y qué hizo. */
function Who({ mood, animated, status }: { mood: ChispaMood; animated: boolean; status?: string }) {
  return (
    <View style={styles.who}>
      <Chispa size={20} mood={mood} animated={animated} />
      <Text style={styles.whoName}>Empre AI</Text>
      {status ? (
        <Text style={styles.whoStatus} numberOfLines={1}>
          {`· ${status}`}
        </Text>
      ) : null}
    </View>
  );
}

/** El aura: el fondo se tiñe muy suave mientras Empre AI busca, y se apaga al responder. */
export function Aura({ on }: { on: boolean }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.timing(v, { toValue: on && !reduce ? 1 : 0, duration: 600, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [on, reduce, v]);
  return (
    <Animated.View pointerEvents="none" style={[styles.aura, { opacity: v }]}>
      <Svg width="100%" height="100%" viewBox="0 0 400 340" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="aura" cx="50%" cy="60%" r="60%">
            <Stop offset="0" stopColor="#F03232" stopOpacity="0.16" />
            <Stop offset="0.55" stopColor="#FF9A1F" stopOpacity="0.08" />
            <Stop offset="1" stopColor="#FF9A1F" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="200" cy="200" rx="260" ry="200" fill="url(#aura)" />
      </Svg>
    </Animated.View>
  );
}

const WORD_MS = 34;
type Part = { t: string; bold?: boolean };
export const typeMs = (parts: Part[]) => wordCount(parts) * WORD_MS;

/**
 * Escribe la frase palabra por palabra, como una IA, con un cursor mientras escribe. El lector de pantalla oye la
 * frase completa de una vez. Sin animación con «Reducir movimiento» o si ya estaba en la conversación.
 */
export function TypeIn({ parts, play, delay = 0, style, boldStyle }: { parts: Part[]; play: boolean; delay?: number; style: StyleProp<TextStyle>; boldStyle?: StyleProp<TextStyle> }) {
  const reduce = useReduceMotion();
  const total = wordCount(parts);
  const animate = play && !reduce && total > 0;
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!animate) return;
    let i = 0;
    let tick: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      tick = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= total && tick) clearInterval(tick);
      }, WORD_MS);
    }, delay);
    return () => {
      clearTimeout(start);
      if (tick) clearInterval(tick);
    };
  }, [animate, total, delay]);
  const shown = animate ? Math.min(n, total) : total;
  return (
    <Text style={style} accessibilityLabel={parts.map((p) => p.t).join('')}>
      {sliceWords(parts, shown).map((p, i) =>
        p.bold ? (
          <Text key={i} style={boldStyle}>
            {p.t}
          </Text>
        ) : (
          <Text key={i}>{p.t}</Text>
        ),
      )}
      {shown > 0 && shown < total ? <Text style={styles.caret}> ▍</Text> : null}
    </Text>
  );
}

/** Mientras busca: la Chispa gira y una sola línea dice dónde está buscando («Revisando su carta…»). */
export function AiThinking({ understood, looking }: { understood: string; looking: string }) {
  return (
    <View style={styles.turn} accessible accessibilityLabel={`Empre AI está revisando. ${understood}`} accessibilityLiveRegion="polite">
      <View style={styles.who}>
        <Chispa size={20} mood="pensando" animated />
        <Text style={styles.thinking}>{looking}</Text>
      </View>
    </View>
  );
}

/**
 * La respuesta: «Empre AI · mientras te responde», cada frase se escribe después de la anterior con el dato en negrita
 * y, si hay algo para tocar (horas, una oferta), debajo. Cierra con una línea: de dónde salió y 👍/👎.
 */
export function AiTurn({
  answers,
  businessName,
  alsoSent,
  fresh,
  onAction,
  onChoose,
  onFeedback,
}: {
  answers: { answer: Answer; intent: string }[];
  businessName: string;
  /** Es la primera respuesta de la conversación: dice «mientras te responde» (el negocio igual recibió la pregunta). */
  alsoSent: boolean;
  /** Recién llegada: se escribe palabra por palabra (las del historial ya están quietas). */
  fresh: boolean;
  onAction: (a: Action) => void;
  onChoose: (intent: string, serviceId: string, label: string) => void;
  onFeedback?: (useful: boolean) => void;
}) {
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);
  const actions = chatActions(answers.flatMap((x) => x.answer.actions));
  const source = sourceLine(
    answers.map((x) => x.answer.source ?? ''),
    businessName,
  );
  const voiced = answers.map((x) => ({ ...voice(x.answer), intent: x.intent }));
  // Una frase después de la otra: cada una empieza cuando terminó la anterior.
  const leads: Part[][] = voiced.map((v) => [{ t: v.lead.a }, { t: v.lead.b, bold: true }, { t: v.lead.c }]);
  const starts: number[] = [];
  const ends: number[] = [];
  let at = 0;
  for (const l of leads) {
    starts.push(at);
    at += typeMs(l);
    ends.push(at);
    at += 120;
  }
  const done = fresh ? (ends[ends.length - 1] ?? 0) : 0;
  return (
    <View style={styles.turn}>
      <Who mood="responde" animated={fresh} status={alsoSent ? 'mientras te responde' : undefined} />
      {voiced.map((v, i) => (
        <View key={i} style={[styles.indent, styles.part]}>
          <TypeIn parts={leads[i]} play={fresh} delay={starts[i]} style={styles.lead} boldStyle={styles.leadBold} />
          {v.note ? (
            <Enter play={fresh} delay={ends[i]}>
              <Text style={styles.leadNote}>{v.note}</Text>
            </Enter>
          ) : null}
          {v.card.length ? (
            <Enter play={fresh} delay={ends[i]} style={styles.card}>
              {v.card.map((b, k) => (
                <BlockView key={k} b={b} onChoose={(id, label) => onChoose(v.intent, id, label)} />
              ))}
            </Enter>
          ) : null}
        </View>
      ))}
      {actions[0] ? (
        <Enter play={fresh} delay={done} style={styles.indent}>
          <Pressable accessibilityRole="button" onPress={() => onAction(actions[0])} hitSlop={4} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>{actions[0].label}</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.ink} />
          </Pressable>
        </Enter>
      ) : null}
      <Enter play={fresh} delay={done + 120} style={[styles.indent, styles.closing]}>
        <Ionicons name="document-text-outline" size={14} color={colors.muted} />
        <Text style={styles.closingText} numberOfLines={1}>
          {source}
        </Text>
        {feedback ? (
          <Text style={styles.thanks}>{feedback === 'yes' ? 'Gracias' : 'Te responde el negocio'}</Text>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Me sirvió"
              hitSlop={4}
              onPress={() => {
                setFeedback('yes');
                onFeedback?.(true);
              }}
              style={styles.thumb}
            >
              <Ionicons name="thumbs-up-outline" size={15} color={colors.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="No me sirvió; prefiero que responda el negocio"
              hitSlop={4}
              onPress={() => {
                setFeedback('no');
                onFeedback?.(false);
              }}
              style={styles.thumb}
            >
              <Ionicons name="thumbs-down-outline" size={15} color={colors.muted} />
            </Pressable>
          </>
        )}
      </Enter>
    </View>
  );
}

/**
 * Lo que Empre AI no responde (no está en lo publicado, o piden un compromiso): no es un turno suyo. Una línea tranquila
 * bajo tu mensaje: «Enviado · esto lo responde El Prado».
 */
export function SentNote({ text }: { text: string }) {
  return (
    <View style={styles.sent} accessibilityLiveRegion="polite">
      <Ionicons name="checkmark" size={13} color={colors.muted} />
      <Text style={styles.sentText}>{text}</Text>
    </View>
  );
}

const ICON: Partial<Record<Intent, { icon: keyof typeof Ionicons.glyphMap; tint: string; ink: string }>> = {
  services: { icon: 'restaurant-outline', tint: colors.selectedSoft, ink: colors.ink },
  price: { icon: 'cash-outline', tint: colors.selectedSoft, ink: colors.ink },
  duration: { icon: 'hourglass-outline', tint: colors.selectedSoft, ink: colors.ink },
  hours: { icon: 'time-outline', tint: colors.verifiedSoft, ink: colors.verified },
  availability: { icon: 'time-outline', tint: colors.verifiedSoft, ink: colors.verified },
  book: { icon: 'calendar-outline', tint: colors.verifiedSoft, ink: colors.verified },
  delivery: { icon: 'bicycle-outline', tint: colors.selectedSoft, ink: colors.ink },
  offers: { icon: 'pricetag-outline', tint: colors.accentSoft, ink: colors.accentInk },
};

/** La entrada: la Chispa, a quién le escribes y lo que ya se puede responder con lo publicado. */
export function ChatWelcome({ name, replyText, questions, onAsk }: { name: string; replyText: string | null; questions: { label: string; intent?: Intent }[]; onAsk: (q: { label: string; intent?: Intent }) => void }) {
  return (
    <View style={styles.welcome}>
      <Enter style={styles.welcomeHead}>
        <Chispa size={84} mood="reposo" />
        <Text style={styles.welcomeTitle}>{`Pregúntale a\n${name}`}</Text>
        <Text style={styles.welcomeBody}>
          {`Te respondo al instante con lo que publicó. Lo que no sé se lo paso al negocio${replyText ? `, que ${replyText.charAt(0).toLocaleLowerCase('es')}${replyText.slice(1)}` : ''}.`}
        </Text>
      </Enter>
      <View style={styles.grid}>
        {questions.slice(0, 4).map((q, i) => {
          const look = (q.intent && ICON[q.intent]) || { icon: 'chatbubble-ellipses-outline' as const, tint: colors.selectedSoft, ink: colors.ink };
          return (
            <Enter key={q.label} delay={i * 70} style={styles.gridCell}>
              <Pressable accessibilityRole="button" onPress={() => onAsk(q)} style={({ pressed }) => [styles.sugCard, pressed && { transform: [{ translateY: 1 }], opacity: 0.9 }]}>
                <View style={[styles.sugIcon, { backgroundColor: look.tint }]}>
                  <Ionicons name={look.icon} size={15} color={look.ink} />
                </View>
                <Text style={styles.sugText}>{q.label}</Text>
              </Pressable>
            </Enter>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  turn: { alignSelf: 'stretch', gap: 6, marginVertical: 6 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  whoName: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  whoStatus: { flexShrink: 1, fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  thinking: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  indent: { marginLeft: 27 },
  part: { gap: 8 },
  caret: { color: colors.muted },
  lead: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.semibold, color: colors.ink },
  leadBold: { fontFamily: fonts.ui.extrabold },
  leadNote: { marginTop: 2, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.muted },
  card: { gap: 8, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  // El siguiente paso como una opción tranquila (el rojo es solo acento): borde arena, texto en tinta.
  cta: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  ctaText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  closing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  closingText: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.semibold, color: colors.muted },
  thumb: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  thanks: { paddingHorizontal: 8, fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  sent: { alignSelf: 'flex-end', maxWidth: '86%', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -2, marginBottom: 4 },
  sentText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.semibold, color: colors.muted },
  aura: { position: 'absolute', left: -40, right: -40, bottom: 0, height: 340 },
  welcome: { flex: 1, justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg },
  welcomeHead: { alignItems: 'center', gap: 10 },
  welcomeTitle: { marginTop: 4, textAlign: 'center', fontSize: 20, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  welcomeBody: { maxWidth: 300, textAlign: 'center', fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell: { width: '48.5%' },
  sugCard: { minHeight: 76, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'space-between', gap: 8 },
  sugIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sugText: { fontSize: 13.5, lineHeight: 17, fontFamily: fonts.ui.extrabold, color: colors.ink },
});

