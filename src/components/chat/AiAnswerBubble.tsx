import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { BlockView } from '@/components/profile/AskEmpre';
import { AiAvatar } from './ChatVoices';
import type { Action, Answer } from '@/lib/answers';
import { chatActions } from '@/lib/chatAutoAnswer';
import { colors, fonts, radius } from '@/theme';

/**
 * La respuesta de Empre AI dentro del chat (3.62, F1). Se ve distinta a la del negocio, dice de dónde sale el dato
 * («Según su horario publicado»), lleva una acción directa y pregunta si sirvió. Nunca se hace pasar por el dueño.
 */
export function AiAnswerBubble({ answer, businessName, onAction, onChoose, onFeedback }: { answer: Answer; businessName: string; onAction: (a: Action) => void; onChoose: (serviceId: string, label: string) => void; onFeedback?: (useful: boolean) => void }) {
  const [feedback, setFeedback] = useState<'yes' | 'wait' | null>(null);
  const actions = chatActions(answer.actions);
  return (
    <View style={styles.row}>
      <AiAvatar />
      <View style={styles.bubble} accessibilityLabel={`Respuesta automática de Empre AI con lo que publicó ${businessName}`}>
        <View style={styles.head}>
          <Text style={styles.headName}>Empre AI</Text>
          <View style={styles.autoChip}>
            <Text style={styles.autoText}>Automático</Text>
          </View>
          <Text style={styles.headText} numberOfLines={1}>
            con lo que publicó el negocio
          </Text>
        </View>
        {answer.blocks.map((b, i) => (
          <BlockView key={i} b={b} onChoose={onChoose} />
        ))}
        {answer.source ? <Text style={styles.source}>{answer.source}</Text> : null}
        {actions[0] ? (
          <Pressable accessibilityRole="button" onPress={() => onAction(actions[0])} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>{actions[0].label}</Text>
            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
          </Pressable>
        ) : null}
        <Text style={styles.reached}>Tu mensaje también le llegó al dueño.</Text>
        <View style={styles.foot}>
          {feedback ? (
            <Text style={styles.footText}>{feedback === 'yes' ? 'Gracias. El negocio igual ve tu mensaje.' : `Listo, ${businessName} te responde por aquí.`}</Text>
          ) : (
            <>
              <Text style={styles.footText}>¿Te sirvió?</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFeedback('yes');
                  onFeedback?.(true);
                }}
                style={styles.chip}
              >
                <Text style={styles.chipText}>Sí</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFeedback('wait');
                  onFeedback?.(false);
                }}
                style={styles.chip}
              >
                <Text style={styles.chipText}>Prefiero esperar al negocio</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
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

/** Cuando Empre AI no tiene con qué responder: no adivina, dice que el negocio aún no contesta. */
export function AiStatusLine({ text }: { text: string }) {
  return (
    <View style={styles.statusRow} accessibilityLiveRegion="polite">
      <Text style={styles.status}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, justifyContent: 'flex-start', marginVertical: 4 },
  bubble: { maxWidth: '84%', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, borderRadius: 18, borderBottomLeftRadius: 4, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  headName: { fontSize: 12.5, fontFamily: fonts.display.bold, color: colors.ink },
  autoChip: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.selectedSoft },
  autoText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  reached: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  headText: { flexShrink: 1, fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted },
  source: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.faint },
  cta: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.ink },
  ctaText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  footText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  ownerWrap: { alignItems: 'center', gap: 6, marginVertical: 6 },
  ownerRow: { minHeight: 44, maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.selectedSoft },
  ownerText: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  ownerBubble: { alignSelf: 'stretch', maxWidth: '100%' },
  correct: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  correctText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  teach: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  teachText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark, textDecorationLine: 'underline' },
  statusRow: { alignItems: 'center', marginVertical: 6 },
  status: { maxWidth: '88%', textAlign: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.selectedSoft, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
});
