import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { ReviewSummary } from '@/api/types';
import { ratingBars, verifiedLabel } from '@/lib/profile';
import { colors, fonts, radius, spacing } from '@/theme';

/** Promedio, barras por estrellas y cuántas reseñas vienen de un canje confirmado. */
export function ReviewsSummary({ summary }: { summary: ReviewSummary }) {
  if (summary.count <= 0) return null;
  const bars = ratingBars(summary.distribution);
  const verified = verifiedLabel(summary.verified_count ?? 0, summary.count);

  return (
    <View style={styles.card}>
      <View style={styles.score}>
        <Text style={styles.average}>{summary.average.toFixed(1)}</Text>
        <Text style={styles.count}>
          {summary.count} {summary.count === 1 ? 'reseña' : 'reseñas'}
        </Text>
      </View>
      {bars.length > 0 ? (
        <View style={styles.bars}>
          {bars.map((bar) => (
            <View key={bar.stars} style={styles.barRow} accessible accessibilityLabel={`${bar.stars} estrellas: ${bar.count}`}>
              <Text style={styles.barLabel}>{bar.stars}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(bar.ratio * 100)}%` }]} />
              </View>
              <Text style={styles.barCount}>{bar.count}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {verified ? (
        <View style={styles.verified}>
          <Ionicons name="shield-checkmark" size={14} color={colors.verified} />
          <Text style={styles.verifiedText}>{verified}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Sello de las reseñas respaldadas por un canje confirmado. */
export function VerifiedStamp() {
  return (
    <View style={styles.stamp}>
      <Ionicons name="shield-checkmark" size={11} color={colors.verifiedInk} />
      <Text style={styles.stampText}>Canje verificado</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  score: { alignItems: 'center', minWidth: 72 },
  average: { fontSize: 34, fontFamily: fonts.display.bold, color: colors.ink },
  count: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  bars: { flex: 1, minWidth: 140, gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { width: 10, fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  barCount: { width: 22, textAlign: 'right', fontSize: 11.5, fontFamily: fonts.ui.medium, color: colors.muted },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' },
  verifiedText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.verifiedInk },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.verifiedSoft },
  stampText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.verifiedInk },
});
