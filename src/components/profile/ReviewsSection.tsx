import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Review, ReviewSummary } from '@/api/types';
import { ReviewCard } from '@/components/profile/ReviewCard';
import { ReviewsSummary } from '@/components/profile/ReviewsSummary';
import { previewReviews, reviewsMode } from '@/lib/profileLayout';
import { colors, fonts, radius, spacing } from '@/theme';

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
 * Las reseñas del perfil según cuántas haya: ninguna, mensaje; 1 o 2, el número y la lista (sin nota: un 5,0 de una
 * persona engaña); 3 a 9, nota, distribución y todas; 10 o más, nota, distribución, un adelanto de 3 (verificadas
 * primero) y «Ver todas las reseñas». Así el perfil mide lo mismo con 10 que con 300.
 */
export function ReviewsSection({ summary, reviews, mine, isOwner, loading, onWrite, onAll }: Props) {
  const mode = reviewsMode(summary.count);
  const others = reviews.filter((r) => r.id !== mine?.id);
  const list = mode === 'preview' ? previewReviews(others) : others;

  return (
    <View style={styles.block}>
      <Text style={styles.title} accessibilityRole="header">
        Reseñas
      </Text>
      {mode === 'empty' && !mine ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Aún sin reseñas</Text>
          <Text style={styles.emptyText}>{isOwner ? 'Cuando tus clientes canjeen una oferta podrán dejar su reseña verificada.' : 'Sé la primera persona en contar tu experiencia.'}</Text>
        </View>
      ) : (
        <>
          {mode === 'count' ? (
            <Text style={styles.count}>
              {summary.count} {summary.count === 1 ? 'reseña' : 'reseñas'}
            </Text>
          ) : (
            <ReviewsSummary summary={summary} />
          )}
          <View>
            {mine ? <ReviewCard review={mine} mine /> : null}
            {loading && list.length === 0 ? <Text style={styles.count}>Cargando reseñas…</Text> : null}
            {list.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </View>
        </>
      )}
      <View style={styles.actions}>
        {mode === 'preview' ? (
          <Pressable accessibilityRole="button" onPress={onAll} style={styles.btn}>
            <Text style={styles.btnText}>Ver todas las reseñas ›</Text>
          </Pressable>
        ) : null}
        {!isOwner ? (
          <Pressable accessibilityRole="button" accessibilityLabel={mine ? 'Editar mi reseña' : 'Escribir una reseña'} onPress={onWrite} style={styles.btn}>
            <Text style={styles.btnText}>{mine ? 'Editar mi reseña' : 'Escribir reseña'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  count: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  empty: { alignItems: 'center', gap: 4, paddingVertical: spacing.md },
  emptyTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  emptyText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  btn: { flexGrow: 1, flexBasis: 140, minHeight: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  btnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
