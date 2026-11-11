import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { Chispa, type ChispaMood } from '@/components/ai/Chispa';
import { BlockView } from '@/components/profile/AskEmpre';
import type { Action, Answer, Intent } from '@/lib/answers';
import { chatActions } from '@/lib/chatAutoAnswer';
import { voice } from '@/lib/chatVoice';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, spacing } from '@/theme';

// La voz de Empre AI en el chat con un negocio (3.70): el mismo lenguaje y las mismas animaciones de «Pregúntales a
// varios». Empre AI se presenta con su nombre y la Chispa; responde con una frase y, si hace falta, una tarjeta.

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
      <Chispa size={30} mood={mood} animated={animated} />
      <Text style={styles.whoName}>Empre AI</Text>
      {status ? (
        <Text style={styles.whoStatus} numberOfLines={1}>
          {status}
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
            <Stop offset="0" stopColor="#0D7A5F" stopOpacity="0.16" />
            <Stop offset="0.55" stopColor="#E8896A" stopOpacity="0.08" />
            <Stop offset="1" stopColor="#E8896A" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="200" cy="200" rx="260" ry="200" fill="url(#aura)" />
      </Svg>
    </Animated.View>
  );
}

/** Un paso de «lo que hizo»: punto gris que se vuelve check teal con un rebote. */
function Step({ label, done, delay }: { label: string; done: boolean; delay: number }) {
  const reduce = useReduceMotion();
  const [pop] = useState(() => new Animated.Value(done ? 1 : 0));
  useEffect(() => {
    if (!done) return;
    if (reduce) {
      pop.setValue(1);
      return;
    }
    const a = Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [done, pop, reduce]);
  return (
    <Enter delay={delay} style={styles.step}>
      <View style={[styles.stepDot, done && styles.stepDotDone]}>
        {done ? (
          <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </Animated.View>
        ) : null}
      </View>
      <Text style={[styles.stepText, done && { color: colors.muted }]}>{label}</Text>
    </Enter>
  );
}

/** Mientras piensa: la Chispa acelera y dice qué entendió y dónde está buscando. */
export function AiThinking({ understood, looking }: { understood: string; looking: string }) {
  const [second, setSecond] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSecond(true), 420);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={styles.turn} accessible accessibilityLabel={`Empre AI está revisando. ${understood}`} accessibilityLiveRegion="polite">
      <Who mood="pensando" animated status="Revisando…" />
      <View style={styles.indent}>
        <Step label={understood} done delay={0} />
        <Step label={looking} done={second} delay={420} />
      </View>
    </View>
  );
}

/**
 * La respuesta: «Empre AI · Respondió · según su carta», una frase con el dato en negrita y, debajo, la tarjeta con lo
 * que se puede ver o tocar. Cierra con una sola línea: de dónde sale, que también le llegó al negocio y 👍/👎.
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
  /** Es la primera respuesta de la conversación: la línea dice que también le llegó al negocio. */
  alsoSent: boolean;
  /** Recién llegada: entra con animación (las del historial ya están quietas). */
  fresh: boolean;
  onAction: (a: Action) => void;
  onChoose: (intent: string, serviceId: string, label: string) => void;
  onFeedback?: (useful: boolean) => void;
}) {
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);
  const actions = chatActions(answers.flatMap((x) => x.answer.actions));
  const sources = [...new Set(answers.map((x) => x.answer.source).filter(Boolean) as string[])];
  const source = sources.length ? sources[0].replace(/^Según/, 'según') : `con lo que publicó ${businessName}`;
  const closing = [sources.length ? sources[0].replace(/\s*\(.*\)$/, '') : `Con lo que publicó ${businessName}`, alsoSent ? 'también le llegó al negocio' : ''].filter(Boolean).join(' · ');
  const voiced = answers.map((x) => ({ ...voice(x.answer), intent: x.intent }));
  return (
    <View style={styles.turn}>
      <Who mood="responde" animated={fresh} status={`Respondió · ${source}`} />
      {voiced.map((v, i) => (
        <View key={i} style={styles.part}>
          <Enter play={fresh} delay={i * 120} style={styles.indent}>
            <Text style={styles.lead}>
              {v.lead.a}
              {v.lead.b ? <Text style={styles.leadBold}>{v.lead.b}</Text> : null}
              {v.lead.c}
            </Text>
            {v.note ? <Text style={styles.leadNote}>{v.note}</Text> : null}
          </Enter>
          {v.card.length ? (
            <Enter play={fresh} delay={120 + i * 120} style={[styles.indent, styles.card]}>
              {v.card.map((b, k) => (
                <BlockView key={k} b={b} onChoose={(id, label) => onChoose(v.intent, id, label)} />
              ))}
            </Enter>
          ) : null}
        </View>
      ))}
      {actions[0] ? (
        <Enter play={fresh} delay={260} style={styles.indent}>
          <Pressable accessibilityRole="button" onPress={() => onAction(actions[0])} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>{actions[0].label}</Text>
            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
          </Pressable>
        </Enter>
      ) : null}
      <Enter play={fresh} delay={420} style={[styles.indent, styles.closing]}>
        <Text style={styles.closingText} numberOfLines={2}>
          {closing}
        </Text>
        {feedback ? (
          <Text style={styles.thanks}>{feedback === 'yes' ? 'Gracias' : 'Te responde el negocio'}</Text>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Me sirvió"
              onPress={() => {
                setFeedback('yes');
                onFeedback?.(true);
              }}
              style={styles.thumb}
            >
              <Ionicons name="thumbs-up-outline" size={16} color={colors.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="No me sirvió; prefiero que responda el negocio"
              onPress={() => {
                setFeedback('no');
                onFeedback?.(false);
              }}
              style={styles.thumb}
            >
              <Ionicons name="thumbs-down-outline" size={16} color={colors.muted} />
            </Pressable>
          </>
        )}
      </Enter>
    </View>
  );
}

/** Lo que no sabe: la Chispa se apaga a gris y una sola línea dice quién lo responde y cuándo. */
export function AiRelay({ text }: { text: string }) {
  const reduce = useReduceMotion();
  const [line] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      line.setValue(1);
      return;
    }
    const a = Animated.timing(line, { toValue: 1, duration: 520, easing: EASE, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [line, reduce]);
  return (
    <View style={styles.turn} accessibilityLiveRegion="polite">
      <Who mood="nosabe" animated status="Se lo pasó al negocio" />
      <View style={[styles.indent, styles.relay]}>
        <Animated.View style={[styles.relayLine, { transform: [{ scaleX: line }] }]} />
        <Text style={styles.relayText}>{text}</Text>
        <Animated.View style={[styles.relayLine, { transform: [{ scaleX: line }] }]} />
      </View>
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
  turn: { alignSelf: 'stretch', gap: 8, marginVertical: 6 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whoName: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  whoStatus: { flexShrink: 1, fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  indent: { marginLeft: 38 },
  part: { gap: 8 },
  lead: { fontSize: 15, lineHeight: 22, fontFamily: fonts.ui.semibold, color: colors.ink },
  leadBold: { fontFamily: fonts.ui.extrabold },
  leadNote: { marginTop: 2, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.muted },
  card: { gap: 8, padding: spacing.md, borderRadius: 18, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cta: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.ink },
  ctaText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
  closing: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  closingText: { flex: 1, fontSize: 11.5, lineHeight: 15, fontFamily: fonts.ui.bold, color: colors.muted },
  thumb: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  thanks: { paddingHorizontal: 8, fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
  stepDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: '#0D7A5F' },
  stepText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  relay: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  relayLine: { flex: 1, height: 1, backgroundColor: '#E7F3EF' },
  relayText: { flexShrink: 1, maxWidth: '78%', textAlign: 'center', fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.extrabold, color: colors.verified },
  aura: { position: 'absolute', left: -40, right: -40, bottom: 0, height: 340 },
  welcome: { flex: 1, justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg },
  welcomeHead: { alignItems: 'center', gap: 10 },
  welcomeTitle: { marginTop: 4, textAlign: 'center', fontSize: 22, lineHeight: 26, fontFamily: fonts.display.bold, color: colors.ink },
  welcomeBody: { maxWidth: 300, textAlign: 'center', fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell: { width: '48.5%' },
  sugCard: { minHeight: 76, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'space-between', gap: 8 },
  sugIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sugText: { fontSize: 13.5, lineHeight: 17, fontFamily: fonts.ui.extrabold, color: colors.ink },
});

