import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Review, ReviewSummary } from '@/api/types';
import { ReviewCard } from '@/components/profile/ReviewCard';
import { previewReviews, reviewsMode } from '@/lib/profileLayout';
import { colors, fonts, radius, spacing } from '@/theme';
import { SectionHeader } from './SectionHeader';

interface Props {
  summary: ReviewSummary;
  /** Las reseñas ya cargadas (las más recientes). */
  reviews: Review[];
  /** Mi reseña, si ya dejé una: va primera y no se repite. */
  mine?: Review | null;
  isOwner: boolean;
  loading?: boolean;
  onWrite: () => void;
  onAll: () => void;
}

/**
 * «Reseñas» compacta (3.28, `perfil_integrado.html`): la cabecera común con cuántas y «Ver todas ›»; en la tarjeta, la
 * nota (desde 3 reseñas: un 5,0 de una persona engaña), una sola reseña (la tuya si la escribiste; si no, la verificada
 * más reciente) y «Escribir reseña». El resto está a un toque, en su pantalla con filtros.
 */
export function ReviewsSection({ summary, reviews, mine, isOwner, loading, onWrite, onAll }: Props) {
  const mode = reviewsMode(summary.count);
  const best = mine ?? previewReviews(reviews)[0] ?? null;
  const avg = summary.average.toFixed(1).replace('.', ',');

  return (
    <View style={styles.section}>
      <SectionHeader title="Reseñas" count={summary.count > 0 ? String(summary.count) : null} link={summary.count > 0 ? 'Ver todas' : null} onLink={onAll} />
      <View style={styles.card}>
        {mode === 'empty' && !mine ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Aún sin reseñas</Text>
            <Text style={styles.emptyText}>{isOwner ? 'Cuando tus clientes canjeen una oferta podrán dejar su reseña verificada.' : 'Sé la primera persona en contar tu experiencia.'}</Text>
          </View>
        ) : (
          <>
            <View style={styles.score} accessible accessibilityLabel={mode === 'score' ? `Nota ${avg} de 5, ${summary.count} reseñas` : `${summary.count} ${summary.count === 1 ? 'reseña' : 'reseñas'}; la nota aparece desde 3`}>
              {mode === 'score' ? (
                <>
                  <Text style={styles.avg}>{avg}</Text>
                  <View style={styles.scoreText}>
                    <View style={styles.stars}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons key={n} name={summary.average >= n - 0.25 ? 'star' : summary.average >= n - 0.75 ? 'star-half' : 'star-outline'} size={14} color="#E8A317" />
                      ))}
                    </View>
                    <Text style={styles.scoreSub}>
                      {summary.count} reseñas de quienes fueron
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.scoreSub}>
                  {summary.count} {summary.count === 1 ? 'reseña' : 'reseñas'} · la nota aparece desde 3
                </Text>
              )}
            </View>
            {loading && !best ? <Text style={styles.scoreSub}>Cargando reseñas…</Text> : null}
            {best ? <ReviewCard review={best} mine={Boolean(mine)} /> : null}
          </>
        )}
        {!isOwner ? (
          <Pressable accessibilityRole="button" accessibilityLabel={mine ? 'Editar mi reseña' : 'Escribir una reseña'} onPress={onWrite} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={styles.btnText}>{mine ? 'Editar mi reseña' : 'Escribir reseña'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  score: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avg: { fontSize: 34, fontFamily: fonts.display.bold, color: colors.ink },
  scoreText: { gap: 2 },
  stars: { flexDirection: 'row', gap: 2 },
  scoreSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  empty: { alignItems: 'center', gap: 4, paddingVertical: spacing.sm },
  emptyTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  emptyText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  btn: { minHeight: 44, flexDirection: 'row', gap: 6, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primary },
  pressed: { opacity: 0.85 },
});
