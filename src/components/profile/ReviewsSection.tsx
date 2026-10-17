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
 * «Reseñas» (maqueta `perfil_secciones.html`), con el mismo formato que Ofertas y Fotos: una muestra de hasta 3
 * (verificadas y recientes primero) y «Ver todas las reseñas (N)» siempre que haya alguna. Con 1 o 2, solo el número
 * (un 5,0 de una persona engaña); desde 3, nota y distribución. Sin reseñas, un mensaje.
 */
export function ReviewsSection({ summary, reviews, mine, isOwner, loading, onWrite, onAll }: Props) {
  const mode = reviewsMode(summary.count);
  const others = reviews.filter((r) => r.id !== mine?.id);
  const list = previewReviews(others).slice(0, mine ? 2 : 3);

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
        {summary.count > 0 ? (
          <Pressable accessibilityRole="button" onPress={onAll} style={styles.btn}>
            <Text style={styles.btnText}>Ver todas las reseñas ({summary.count})</Text>
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
