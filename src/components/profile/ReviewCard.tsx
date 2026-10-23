import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Review } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { agoLabel } from '@/lib/discover';
import { shortName } from '@/lib/profileLayout';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

const LONG = 160;

/**
 * Una reseña: autor abreviado («María P.»), estrellas, hace cuánto, la marca «Verificada» (con texto, no solo color)
 * y el comentario recortado a 4 líneas con «Ver más» cuando es largo.
 */
export function ReviewCard({ review, mine = false }: { review: Review; mine?: boolean }) {
  const [open, setOpen] = useState(false);
  const now = useNow(60_000);
  const long = review.comment.length > LONG;
  const who = mine ? 'Tu reseña' : shortName(review.user.name) || 'Alguien';
  const when = agoLabel(review.created_at, now);
  return (
    <View
      style={[styles.card, mine && styles.mine]}
      accessible={!long}
      accessibilityLabel={`${who}, ${review.rating} estrellas, ${when}${review.verified ? ', reseña verificada' : ''}${review.comment ? `. ${review.comment}` : ''}`}
    >
      <Avatar uri={review.user.profile_picture_url} name={review.user.name} size={36} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.name} numberOfLines={1}>
            {who}
          </Text>
          <View style={styles.stars} accessible={false}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons key={n} name={n <= review.rating ? 'star' : 'star-outline'} size={12} color={colors.accent} />
            ))}
          </View>
          <Text style={styles.when}>{when}</Text>
          {review.verified ? (
            <View style={styles.stamp}>
              <Ionicons name="shield-checkmark" size={11} color={colors.verifiedInk} />
              <Text style={styles.stampText}>Verificada</Text>
            </View>
          ) : null}
        </View>
        {review.comment ? (
          <>
            <Text style={styles.comment} numberOfLines={long && !open ? 4 : undefined}>
              {review.comment}
            </Text>
            {long ? (
              <Pressable accessibilityRole="button" onPress={() => setOpen((v) => !v)} style={styles.more}>
                <Text style={styles.moreText}>{open ? 'Ver menos' : 'Ver más'}</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Text style={styles.none}>Sin comentario</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  mine: { backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderTopWidth: 0 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  stars: { flexDirection: 'row' },
  when: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.verifiedSoft },
  stampText: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: colors.verifiedInk },
  comment: { fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.ink },
  none: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  more: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primary },
});
