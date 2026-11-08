import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { BlockView } from '@/components/profile/AskEmpre';
import type { Action, Answer } from '@/lib/answers';
import { chatActions } from '@/lib/chatAutoAnswer';
import { colors, fonts, radius } from '@/theme';

/**
 * La respuesta de Empre AI dentro del chat (3.62, F1). Se ve distinta a la del negocio, dice de dónde sale el dato
 * («Según su horario publicado»), lleva una acción directa y pregunta si sirvió. Nunca se hace pasar por el dueño.
 */
export function AiAnswerBubble({ answer, businessName, onAction, onChoose }: { answer: Answer; businessName: string; onAction: (a: Action) => void; onChoose: (serviceId: string, label: string) => void }) {
  const [feedback, setFeedback] = useState<'yes' | 'wait' | null>(null);
  const actions = chatActions(answer.actions);
  return (
    <View style={styles.row}>
      <View style={styles.bubble} accessibilityLabel={`Respuesta de Empre AI con lo que publicó ${businessName}`}>
        <View style={styles.head}>
          <EmpreSymbol product="ai" size={18} animated={false} />
          <Text style={styles.headText} numberOfLines={1}>
            Empre AI · con lo que publicó {businessName}
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
        <View style={styles.foot}>
          {feedback ? (
            <Text style={styles.footText}>{feedback === 'yes' ? 'Gracias. El negocio igual ve tu mensaje.' : `Listo, ${businessName} te responde por aquí.`}</Text>
          ) : (
            <>
              <Text style={styles.footText}>¿Te sirvió?</Text>
              <Pressable accessibilityRole="button" onPress={() => setFeedback('yes')} style={styles.chip}>
                <Text style={styles.chipText}>Sí</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setFeedback('wait')} style={styles.chip}>
                <Text style={styles.chipText}>Prefiero esperar al negocio</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
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
  row: { flexDirection: 'row', justifyContent: 'flex-start', marginVertical: 4 },
  bubble: { maxWidth: '88%', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, borderRadius: 18, borderBottomLeftRadius: 4, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { flexShrink: 1, fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted },
  source: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.faint },
  cta: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.ink },
  ctaText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  footText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  statusRow: { alignItems: 'center', marginVertical: 6 },
  status: { maxWidth: '88%', textAlign: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.selectedSoft, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
});
