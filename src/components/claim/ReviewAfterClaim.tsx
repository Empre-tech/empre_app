import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { reviewsApi } from '@/api/endpoints';
import { Button } from '@/components/Button';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  entityId: string;
  claimId: string;
  entityName?: string;
}

/**
 * «¿Cómo te fue?» tras confirmar el canje. La reseña viaja con el id del canje,
 * así el servidor la marca «Canje verificado». Es opcional: se puede omitir.
 */
export function ReviewAfterClaim({ entityId, claimId, entityName }: Props) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [state, setState] = useState<'open' | 'sent' | 'skipped'>('open');

  if (state === 'skipped') return null;
  if (state === 'sent') {
    return (
      <View style={styles.thanks}>
        <Ionicons name="shield-checkmark" size={18} color="#075E62" />
        <Text style={styles.thanksText}>Tu reseña ya está publicada con el sello «Canje verificado».</Text>
      </View>
    );
  }

  const send = async () => {
    if (rating < 1) {
      setMessage('Elige de 1 a 5 estrellas.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await reviewsApi.upsert(entityId, { rating, comment: comment.trim(), claim_id: claimId });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reviews', entityId] }),
        queryClient.invalidateQueries({ queryKey: ['review-mine', entityId] }),
        queryClient.invalidateQueries({ queryKey: ['entity', entityId] }),
      ]);
      setState('sent');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No pudimos publicar tu reseña.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>¿Cómo te fue{entityName ? ` en ${entityName}` : ''}?</Text>
      <Text style={styles.hint}>Tu reseña llevará el sello «Canje verificado».</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} estrellas`} accessibilityState={{ selected: n === rating }} onPress={() => setRating(n)} hitSlop={6}>
            <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={34} color={colors.accent} />
          </Pressable>
        ))}
      </View>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Cuéntanos más (opcional)"
        placeholderTextColor={colors.muted}
        style={styles.input}
        maxLength={500}
        multiline
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Button title="Publicar reseña" onPress={() => void send()} loading={busy} />
      <Pressable accessibilityRole="button" onPress={() => setState('skipped')} hitSlop={8} style={styles.skip}>
        <Text style={styles.skipText}>Ahora no</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  title: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  hint: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  input: { minHeight: 72, textAlignVertical: 'top', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  message: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.danger, textAlign: 'center' },
  skip: { alignSelf: 'center', paddingVertical: spacing.xs },
  skipText: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.muted },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.verifiedSoft, borderRadius: radius.md, padding: spacing.md },
  thanksText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.bold, color: '#075E62' },
});
