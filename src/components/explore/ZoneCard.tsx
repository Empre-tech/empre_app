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
 * «+N»); encima, la razón. Sin fotos (3.24, `area_util.html`) es compacta: icono de su categoría, datos y la franja de
 * oferta si la tiene. Debajo el nombre, la categoría y
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

  const scoreLine = (
    <Text style={styles.line} numberOfLines={1}>
      <Text style={rating.hasScore ? styles.score : styles.noScore}>{rating.text}</Text>
      {status ? <Text style={styles.sep}> · </Text> : null}
      {status ? <Text style={status === 'Abierto' ? styles.open : styles.closed}>{status}</Text> : null}
    </Text>
  );

  // Sin fotos (3.24): tarjeta compacta, sin un bloque grande vacío. El orden no cambia; solo ocupa menos.
  if (!(onPhoto && model.photos?.length)) {
    const offer = model.pill?.kind === 'offer' ? model.pill : null;
    return (
      <View style={[styles.card, model.open === false && styles.cardClosed, selected && styles.selected]}>
        <View style={styles.compact}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}, sin fotos todavía`}
            onPress={onPress}
            style={({ pressed }) => [styles.compactMain, pressed && styles.pressed]}
          >
            <View style={[styles.cIcon, { backgroundColor: model.color.bg }]}>
              <Ionicons name={model.icon as keyof typeof Ionicons.glyphMap} size={22} color={model.color.fg} />
            </View>
            <View style={styles.cText}>
              <Text style={styles.cName} numberOfLines={1}>
                {model.name}
              </Text>
              {where ? (
                <Text style={styles.sub} numberOfLines={1}>
                  {where}
                </Text>
              ) : null}
              {scoreLine}
              <Text style={styles.noPhotoNote}>Sin fotos todavía</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel={`Ver el perfil de ${model.name}`} onPress={() => onOpenProfile(model.id)} style={({ pressed }) => [styles.chev, pressed && styles.pressed]}>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>
        {offer ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Abrir el perfil de ${model.name}: oferta, termina en ${offer.text}`}
            onPress={() => onOpenProfile(model.id)}
            style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
          >
            <Ionicons name="flash" size={14} color={colors.ink} />
            <Text style={styles.stripText} numberOfLines={1}>
              Oferta · termina en {offer.text}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.card, model.open === false && styles.cardClosed, selected && styles.selected]}>
      <PhotoGallery name={model.name} photos={model.photos} photosCount={model.photosCount} color={model.color.bg} height={150} rounded="top" onPhoto={onPhoto}>
        {reasonPill}
      </PhotoGallery>

      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
        <Text style={styles.name} numberOfLines={2}>
          {model.name}
        </Text>
        {where ? (
          <Text style={styles.sub} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
        {scoreLine}
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
  compact: { flexDirection: 'row', alignItems: 'center', minHeight: 76 },
  compactMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingLeft: spacing.md },
  cIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cText: { flex: 1, minWidth: 0, gap: 1 },
  cName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  noPhotoNote: { fontSize: 11.5, fontFamily: fonts.ui.medium, fontStyle: 'italic', color: colors.muted },
  chev: { width: 44, height: 44, marginRight: 4, alignItems: 'center', justifyContent: 'center' },
  strip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, backgroundColor: colors.accent },
  stripText: { flex: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
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
