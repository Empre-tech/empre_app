import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { BlockView } from '@/components/profile/AskEmpre';
import type { Answer } from '@/lib/answers';
import { colors, fonts } from '@/theme';

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

const styles = StyleSheet.create({
  bubble: { gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  ownerWrap: { alignItems: 'center', gap: 6, marginVertical: 6 },
  ownerRow: { minHeight: 44, maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.selectedSoft },
  ownerText: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  ownerBubble: { alignSelf: 'stretch', maxWidth: '100%' },
  source: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.faint },
  correct: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  correctText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  teach: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  teachText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark, textDecorationLine: 'underline' },
});
