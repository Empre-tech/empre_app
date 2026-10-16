import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ratingText, statusText } from '@/lib/discover';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts, radius, spacing } from '@/theme';
import type { CardModel } from './ExploreCards';

interface Props {
  model: CardModel;
  selected?: boolean;
  /** Tocar la ficha: selecciona el negocio en el mapa. */
  onPress: () => void;
  /** Tocar la franja de oferta: abre el perfil del negocio. */
  onOpenProfile: (id: string) => void;
}

/**
 * Ficha de «En esta zona» (variante B del mockup `en_esta_zona.html`): arriba el negocio y su
 * distancia; una línea fina; debajo píldoras con reseñas y estado; la frase corta y, si hay oferta,
 * una franja naranja al pie con el tiempo que queda. Sin precios ni cantidades. En los adicionales
 * (cerca pero fuera de tu zona) la distancia lleva el nombre de su zona.
 */
export function ZoneCard({ model, selected, onPress, onOpenProfile }: Props) {
  const rating = ratingText(model.rating, model.reviews);
  const status = statusText(model.open);
  const src = model.image ? resolveImageUrl(model.image) : null;
  const chip = [model.zoneLabel, model.distance].filter(Boolean).join(' · ');
  const offer = model.pill?.kind === 'offer' ? model.pill : null;
  const label = [
    model.name,
    model.sub,
    rating.hasReviews ? `${rating.text.replace('★ ', '')} reseñas` : rating.text,
    status,
    model.zoneLabel ? `en ${model.zoneLabel}` : null,
    model.distance,
    offer ? `oferta, termina en ${offer.text}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.card, model.open === false && styles.cardClosed, selected && styles.selected]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.press, pressed && styles.pressed]}>
        <View style={styles.top}>
          <View style={[styles.avatar, { backgroundColor: model.color.fg }, model.open === false && styles.avatarClosed]}>
            {src ? (
              <Image accessible={false} source={{ uri: src }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Ionicons name={model.icon as keyof typeof Ionicons.glyphMap} size={24} color="#fff" />
            )}
          </View>
          <View style={styles.headText}>
            <Text style={styles.name} numberOfLines={2}>
              {model.name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {model.sub}
            </Text>
          </View>
          {chip ? (
            <View style={styles.distChip} accessible={false}>
              <Text style={styles.distText} numberOfLines={1}>
                {chip}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.sep} />
        <View style={styles.facts}>
          <View style={[styles.pill, rating.hasReviews ? styles.pillRating : null]}>
            <Text style={[styles.pillText, rating.hasReviews ? styles.pillRatingText : styles.pillNoneText]}>{rating.text}</Text>
          </View>
          {status ? (
            <View style={[styles.pill, status === 'Abierto' ? styles.pillOpen : styles.pillClosed]}>
              <Text style={[styles.pillText, status === 'Abierto' ? styles.pillOpenText : styles.pillClosedText]}>{status}</Text>
            </View>
          ) : null}
        </View>
        {model.tagline ? (
          <Text style={styles.tagline} numberOfLines={2}>
            {model.tagline}
          </Text>
        ) : null}
      </Pressable>
      {offer ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Abrir el perfil de ${model.name}: oferta, termina en ${offer.text}`}
          onPress={() => onOpenProfile(model.id)}
          style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
        >
          <Ionicons name="flash" size={14} color={colors.ink} />
          <Text style={styles.stripText} numberOfLines={1}>
            Oferta · termina en <Text style={styles.stripBold}>{offer.text}</Text>
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 88,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardClosed: { backgroundColor: '#FAFBFD' },
  selected: { borderColor: colors.primary },
  press: { minHeight: 88 },
  pressed: { opacity: 0.85 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarClosed: { opacity: 0.55 },
  avatarImage: { width: 56, height: 56 },
  headText: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  sub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  distChip: { maxWidth: 130, paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: colors.primarySoft, justifyContent: 'center' },
  distText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  sep: { height: 1, backgroundColor: colors.line, marginHorizontal: spacing.md },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10 },
  pill: { minHeight: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' },
  pillText: { fontSize: 12, fontFamily: fonts.ui.bold },
  pillRating: { backgroundColor: '#FFF4DC' },
  pillRatingText: { color: '#7A4B00' },
  pillNoneText: { color: colors.muted },
  pillOpen: { backgroundColor: '#E3F4EA' },
  pillOpenText: { color: '#1D6B3D' },
  pillClosed: { backgroundColor: '#FBE4E4' },
  pillClosedText: { color: '#8E2A2A' },
  tagline: { paddingHorizontal: spacing.md, paddingBottom: 10, fontSize: 12.5, fontFamily: fonts.ui.medium, fontStyle: 'italic', color: colors.ink },
  strip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, backgroundColor: colors.accent },
  stripText: { flex: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  stripBold: { fontFamily: fonts.ui.extrabold },
});
