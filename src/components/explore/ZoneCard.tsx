import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { statusText } from '@/lib/discover';
import { photosCountText, photoTotal } from '@/lib/photoStrip';
import { featuredRating } from '@/lib/reviewSnippet';
import { colors, fonts, radius, spacing } from '@/theme';
import type { CardModel } from './ExploreCards';
import { PhotoGallery } from './PhotoGallery';

interface Props {
  model: CardModel;
  selected?: boolean;
  /** Tocar la ficha: selecciona el negocio en el mapa. */
  onPress: () => void;
  /** «Ver perfil ›»: abre el perfil del negocio. */
  onOpenProfile: (id: string) => void;
  /** Tocar una de sus fotos: abre el visor en esa foto. */
  onPhoto?: (index: number) => void;
}

/** La razón de la tarjeta, encima de la foto: la oferta manda; si no, abierto ahora. Nunca una cantidad ni un precio. */
function reasonOf(model: CardModel): { text: string; tone: 'offer' | 'open' | 'new' } | null {
  if (model.pill?.kind === 'offer') return { text: `Oferta · termina en ${model.pill.text}`, tone: 'offer' };
  if (model.pill) return { text: model.pill.text, tone: 'new' };
  if (model.open) return { text: 'Abierto ahora', tone: 'open' };
  return null;
}

/**
 * Tarjeta de un destacado (3.22, mockup `destacados_fotos.html`): arriba sus fotos subidas (la grande y dos pequeñas con
 * «+N») o, sin fotos, el color de su categoría con «Aún sin fotos»; encima, la razón. Debajo el nombre, la categoría y
 * la distancia, la nota y el estado, la reseña o la frase corta, y «Ver perfil ›». Tocar la tarjeta centra el negocio
 * en el mapa; tocar una foto la abre. Sin precios ni cantidades de ofertas.
 */
export function ZoneCard({ model, selected, onPress, onOpenProfile, onPhoto }: Props) {
  const rating = featuredRating(model.rating, model.reviews);
  const status = statusText(model.open);
  const where = [model.sub, model.zoneLabel, model.distance].filter(Boolean).join(' · ');
  const reason = reasonOf(model);
  const count = photoTotal({ id: model.id, name: model.name, photos: model.photos, photosCount: model.photosCount });
  const label = [
    model.name,
    reason?.text,
    where,
    rating.hasScore ? `nota ${rating.text.replace('★ ', '').replace(/ \((\d+)\)/, ' con $1 reseñas')}` : rating.text,
    status,
    model.review ? `reseña: ${model.review.quote}, ${model.review.byline}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const reasonPill = reason ? (
    <View style={[styles.reason, reason.tone === 'open' ? styles.reasonOpen : reason.tone === 'new' ? styles.reasonNew : styles.reasonOffer]}>
      {reason.tone === 'offer' ? <Ionicons name="flash" size={11} color={colors.ink} /> : null}
      <Text style={[styles.reasonText, reason.tone === 'open' ? styles.reasonOpenText : reason.tone === 'new' ? styles.reasonNewText : null]} numberOfLines={1}>
        {reason.text}
      </Text>
    </View>
  ) : null;

  return (
    <View style={[styles.card, model.open === false && styles.cardClosed, selected && styles.selected]}>
      {onPhoto && model.photos?.length ? (
        <PhotoGallery name={model.name} photos={model.photos} photosCount={model.photosCount} color={model.color.bg} height={150} rounded="top" onPhoto={onPhoto}>
          {reasonPill}
        </PhotoGallery>
      ) : (
        <Pressable accessible={false} onPress={onPress} style={[styles.noPhoto, { backgroundColor: model.color.fg }]}>
          {reasonPill ? <View style={styles.noPhotoReason}>{reasonPill}</View> : null}
          <View style={styles.noPhotoRow}>
            <View style={styles.noPhotoIcon}>
              <Ionicons name={model.icon as keyof typeof Ionicons.glyphMap} size={24} color="#fff" />
            </View>
            <Text style={styles.noPhotoText}>Aún sin fotos</Text>
          </View>
        </Pressable>
      )}

      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
        <Text style={styles.name} numberOfLines={2}>
          {model.name}
        </Text>
        {where ? (
          <Text style={styles.sub} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
        <Text style={styles.line} numberOfLines={1}>
          <Text style={rating.hasScore ? styles.score : styles.noScore}>{rating.text}</Text>
          {status ? <Text style={styles.sep}> · </Text> : null}
          {status ? <Text style={status === 'Abierto' ? styles.open : styles.closed}>{status}</Text> : null}
        </Text>
        {model.review ? (
          <View style={styles.review} accessible={false}>
            <Text style={styles.quote} numberOfLines={2}>
              {model.review.quote}
            </Text>
            <Text style={styles.byline} numberOfLines={1}>
              {model.review.byline}
            </Text>
          </View>
        ) : model.tagline ? (
          <Text style={styles.tagline} numberOfLines={2}>
            {model.tagline}
          </Text>
        ) : null}
      </Pressable>

      <View style={styles.foot}>
        <Text style={styles.count}>{photosCountText(count)}</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Ver el perfil de ${model.name}`}
          onPress={() => onOpenProfile(model.id)}
          style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
        >
          <Text style={styles.profileText}>Ver perfil ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardClosed: { backgroundColor: '#FAFBFD' },
  selected: { borderColor: colors.primary },
  pressed: { opacity: 0.85 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 240, height: 26, paddingHorizontal: 10, borderRadius: radius.pill },
  reasonOffer: { backgroundColor: colors.accent },
  reasonOpen: { backgroundColor: '#E3F4EA' },
  reasonNew: { backgroundColor: colors.primarySoft },
  reasonText: { flexShrink: 1, fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  reasonOpenText: { color: '#1D6B3D' },
  reasonNewText: { color: colors.primaryDark },
  noPhoto: { minHeight: 96, paddingHorizontal: spacing.md, paddingBottom: spacing.md, paddingTop: 42, justifyContent: 'flex-end' },
  noPhotoReason: { position: 'absolute', left: 8, top: 8 },
  noPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noPhotoIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#fff' },
  body: { paddingHorizontal: spacing.md, paddingTop: 10, gap: 3 },
  name: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  sub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  line: { fontSize: 12.5, fontFamily: fonts.ui.bold },
  score: { color: '#8F4300' },
  noScore: { color: colors.muted },
  sep: { color: colors.muted },
  open: { color: '#1D6B3D' },
  closed: { color: '#8E2A2A' },
  tagline: { paddingTop: 2, fontSize: 12.5, fontFamily: fonts.ui.medium, fontStyle: 'italic', color: colors.ink },
  review: { marginTop: 4, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: colors.accent, gap: 2 },
  quote: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, fontStyle: 'italic', color: colors.ink },
  byline: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.md, paddingRight: spacing.sm },
  count: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  profile: { minHeight: 44, minWidth: 44, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  profileText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
});
