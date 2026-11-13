import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { extractSize } from '@/lib/agentMemory';
import { declinedFact, declineFact, loadFacts, rememberFact } from '@/lib/agentPrefsStore';
import { colors, fonts } from '@/theme';

/**
 * «¿Recuerdo tu talla 40?» (tablero «Para el cliente», teléfono 4: «Talla 40 en tenis · Lo dijiste en una pregunta»).
 * Agent solo la recuerda si dices que sí, y solo en este teléfono. Se quita en «Lo que Agent sabe de ti».
 */
export function RememberSize({ text }: { text: string }) {
  const qc = useQueryClient();
  const size = extractSize(text);
  const facts = useQuery({ queryKey: ['agent-facts'], queryFn: loadFacts });
  const declined = useQuery({ queryKey: ['agent-facts-declined'], queryFn: declinedFact });
  const saved = (facts.data ?? []).find((f) => f.name === 'Talla');
  if (!size || facts.isLoading || declined.isLoading || saved?.value === size || declined.data === size) return null;

  const yes = async () => qc.setQueryData(['agent-facts'], await rememberFact({ name: 'Talla', value: size, from: 'Lo dijiste en una pregunta', at: new Date().toISOString() }));
  const no = async () => {
    await declineFact(size);
    qc.setQueryData(['agent-facts-declined'], size);
  };

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Ionicons name="sparkles" size={16} color={colors.primaryDark} />
      <View style={styles.texts}>
        <Text style={styles.title}>¿Recuerdo tu talla {size}?</Text>
        <Text style={styles.sub}>{saved ? `Ahora tengo la ${saved.value}. ` : ''}Así te muestro primero lo que hay en tu talla. Queda solo en este teléfono.</Text>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => void yes()} style={styles.yes}>
            <Text style={styles.yesText}>Recordarla</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void no()} style={styles.no}>
            <Text style={styles.noText}>No</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.primarySoft },
  texts: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  sub: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  yes: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  yesText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.surface },
  no: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line },
  noText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
});
