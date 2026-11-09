import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { BlockView } from '@/components/profile/AskEmpre';
import type { Action, Answer } from '@/lib/answers';
import { chatActions } from '@/lib/chatAutoAnswer';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

/**
 * La respuesta automática dentro del chat (3.68): una burbuja normal del negocio, como la de cualquier mensaje. Si el
 * mensaje traía varias preguntas, una sola burbuja las contesta en orden. Debajo, solo una nota pequeña («Respuesta
 * automática · según su carta») y 👍/👎. Nunca se hace pasar por el dueño: la nota lo dice.
 */
export function AiAnswerBubble({
  answers,
  businessName,
  onAction,
  onChoose,
  onFeedback,
}: {
  answers: { answer: Answer; intent: string }[];
  businessName: string;
  onAction: (a: Action) => void;
  onChoose: (intent: string, serviceId: string, label: string) => void;
  onFeedback?: (useful: boolean) => void;
}) {
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);
  const actions = chatActions(answers.flatMap((x) => x.answer.actions));
  const sources = [...new Set(answers.map((x) => x.answer.source).filter(Boolean) as string[])];
  const note = sources.length ? sources.join(' · ').replace(/^Según/, 'según') : 'con lo que publicó el negocio';
  return (
    <View style={styles.wrap}>
      <View style={styles.bubble} accessibilityLabel={`Respuesta automática con lo que publicó ${businessName}`}>
        {answers.map((x, i) => (
          <View key={i} style={styles.part}>
            {x.answer.blocks.map((b, k) => (
              <BlockView key={k} b={b} onChoose={(id, label) => onChoose(x.intent, id, label)} />
            ))}
          </View>
        ))}
        {actions[0] ? (
          <Pressable accessibilityRole="button" onPress={() => onAction(actions[0])} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>{actions[0].label}</Text>
            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.note}>
        <Ionicons name="sparkles" size={11} color={colors.faint} />
        <Text style={styles.noteText} numberOfLines={2}>{`Respuesta automática · ${note}`}</Text>
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
              <Ionicons name="thumbs-up-outline" size={16} color={colors.faint} />
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
              <Ionicons name="thumbs-down-outline" size={16} color={colors.faint} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

/** «Escribiendo…»: la espera de un momento antes de cada respuesta, como en cualquier chat. */
export function TypingBubble() {
  const reduce = useReduceMotion();
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.4)));
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.stagger(
        150,
        dots.map((d) => Animated.sequence([Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }), Animated.timing(d, { toValue: 0.4, duration: 300, useNativeDriver: true })])),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [dots, reduce]);
  return (
    <View style={styles.typing} accessible accessibilityLabel="Escribiendo" accessibilityLiveRegion="polite">
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
      ))}
    </View>
  );
}

/**
 * Lo que ve el dueño (3.62, F2): plegado, para que sepa qué ya se respondió y qué falta. Al abrirlo ve la respuesta
 * tal como la vio el cliente, armada con lo que su negocio tiene publicado.
 */
export function AiAnswerOwnerRow({ summary, answer, onCorrect }: { summary: string; answer: Answer | null; onCorrect?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.ownerWrap}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${summary}. ${open ? 'Ocultar' : 'Ver'} la respuesta`} onPress={() => setOpen((v) => !v)} style={styles.ownerRow}>
        <EmpreSymbol product="ai" size={16} animated={false} />
        <Text style={styles.ownerText} numberOfLines={2}>
          {summary.replace('Empre AI respondió con su', 'Empre AI le respondió con tu').replace('Empre AI respondió', 'Empre AI le respondió')}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      {open && answer ? (
        <View style={[styles.bubble, styles.ownerBubble]}>
          {answer.blocks.map((b, i) => (
            <BlockView key={i} b={b} />
          ))}
          {answer.source ? <Text style={styles.source}>{answer.source}</Text> : null}
          {onCorrect ? (
            <Pressable accessibilityRole="button" onPress={onCorrect} style={styles.correct}>
              <Text style={styles.correctText}>Corregir o completar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Debajo de una pregunta que Empre AI no supo responder, en el hilo del dueño. */
export function TeachLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.teach}>
      <EmpreSymbol product="ai" size={14} animated={false} />
      <Text style={styles.teachText}>Empre AI no supo responder · Enséñale</Text>
    </Pressable>
  );
}

/** Un aviso de una línea sobre tu mensaje («también le llegó al negocio», «esto lo responde el negocio»). */
export function AiStatusLine({ text, icon = 'time-outline' }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.statusRow} accessibilityLiveRegion="polite">
      <View style={styles.statusPill}>
        <Ionicons name={icon} size={14} color={colors.muted} />
        <Text style={styles.status}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', maxWidth: '86%', marginVertical: 4, gap: 2 },
  bubble: { gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  part: { gap: 6 },
  cta: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.ink },
  ctaText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 6 },
  noteText: { flexShrink: 1, fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.faint },
  thumb: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  thanks: { paddingHorizontal: 8, fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  typing: { alignSelf: 'flex-start', flexDirection: 'row', gap: 5, marginVertical: 4, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.faint },
  ownerWrap: { alignItems: 'center', gap: 6, marginVertical: 6 },
  ownerRow: { minHeight: 44, maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.selectedSoft },
  ownerText: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  ownerBubble: { alignSelf: 'stretch', maxWidth: '100%' },
  source: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.faint },
  correct: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  correctText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  teach: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  teachText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark, textDecorationLine: 'underline' },
  statusRow: { alignItems: 'center', marginVertical: 6 },
  statusPill: { maxWidth: '90%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.selectedSoft },
  status: { flexShrink: 1, fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.bold, color: colors.muted },
});
