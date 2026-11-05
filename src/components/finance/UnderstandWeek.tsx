import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Analytics } from '@/api/ledger';
import { EmpreAICard } from '@/components/system/parts';
import { dayToExplain, explainDay } from '@/lib/empreAI';
import { bucketLabel, dayLong } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { colors, fonts } from '@/theme';

/**
 * «Entender tu semana» de Empre AI: toca un día y separa lo que sabemos, lo que no podemos afirmar y qué probar. Solo por
 * días y con plantillas: un día normal no se explica y nunca se inventa una causa.
 */
export function UnderstandWeek({ a, onOffer }: { a: Analytics; onOffer: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  if (a.bucket !== 'day' || a.series.length < 2 || a.series.length > 14) return null;
  const at = picked !== null && picked < a.series.length ? picked : dayToExplain(a);
  const e = explainDay(a, at);
  const top = Math.max(1, ...a.series.map((p) => p.sales), ...(a.normal ?? []));
  return (
    <EmpreAICard title="Entender tu semana" note="Empre AI solo usa lo que queda en Empre: ventas, Agenda y Empre Offers. No sabe del clima ni de la competencia, así que no los adivina.">
      <Text style={styles.hint}>Ventas por día · toca uno</Text>
      <View style={styles.bars}>
        {a.series.map((p, i) => {
          const on = i === at;
          const normal = a.normal?.length === a.series.length ? a.normal[i] : 0;
          return (
            <Pressable key={p.start} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${dayLong(p.start)}: ${formatPesos(p.sales)}`} onPress={() => setPicked(i)} style={[styles.col, on && styles.colOn]}>
              <View style={styles.barArea}>
                {normal > 0 ? <View style={[styles.normal, { bottom: (normal / top) * 72 }]} /> : null}
                <View style={[styles.bar, { height: Math.max(3, (p.sales / top) * 72), backgroundColor: on ? colors.ink : colors.line }]} />
              </View>
              <Text style={[styles.dayLabel, on && { color: colors.ink }]}>{bucketLabel(a.bucket, p.start, a.series.length)}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.answer} accessibilityLiveRegion="polite">
        <Text style={styles.headline}>{e.headline}</Text>
        {e.tag ? <Text style={styles.tag}>{e.tag}</Text> : null}
      </View>
      {e.facts.length ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Lo que sí sabemos</Text>
          {e.facts.map((f) => (
            <View key={f} style={styles.fact}>
              <Ionicons name="checkmark" size={16} color={colors.ink} />
              <Text style={styles.factText}>{f}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {e.unknown ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Lo que no podemos afirmar</Text>
          <Text style={styles.factText}>{e.unknown}</Text>
        </View>
      ) : null}
      {e.suggestOffer ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Qué podrías probar</Text>
          <Pressable accessibilityRole="button" onPress={onOffer} style={styles.tryRow}>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={styles.tryTitle}>Una oferta para el próximo {e.name}</Text>
              <Text style={styles.trySub}>Empieza cuando la publicas: prepárala ese día</Text>
            </View>
            <Text style={styles.tryBtn}>Preparar</Text>
          </Pressable>
        </View>
      ) : null}
    </EmpreAICard>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  bars: { flexDirection: 'row', gap: 4 },
  col: { flex: 1, minWidth: 0, minHeight: 104, alignItems: 'center', gap: 6, paddingTop: 6, paddingBottom: 4, borderRadius: 8 },
  colOn: { backgroundColor: colors.selectedSoft },
  barArea: { width: '100%', height: 72, alignItems: 'center', justifyContent: 'flex-end' },
  normal: { position: 'absolute', left: 4, right: 4, borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: colors.placeholder },
  bar: { width: 14, borderRadius: 4 },
  dayLabel: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.faint },
  answer: { gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.ink },
  headline: { fontSize: 15, lineHeight: 21, fontFamily: fonts.ui.bold, color: '#fff' },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink, backgroundColor: colors.surface },
  block: { gap: 8 },
  blockTitle: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.faint },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  factText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.ink },
  tryRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.selectedSoft },
  tryTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  trySub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  tryBtn: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
});
