import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Offer, Photo, Review } from '@/api/types';
import { formatRelativeTime } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { buildLatest, type LatestItem } from '@/lib/profile';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  photos: Photo[];
  offers: Offer[];
  reviews: Review[];
  onPress: (item: LatestItem) => void;
}

const KIND: Record<LatestItem['kind'], { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  post: { icon: 'images', label: 'Publicación' },
  offer: { icon: 'flash', label: 'Oferta nueva' },
  review: { icon: 'shield-checkmark', label: 'Reseña verificada' },
};

/** «Lo último»: hasta 3 novedades de los últimos 7 días. Sin novedades no se dibuja. */
export function LatestStrip({ photos, offers, reviews, onPress }: Props) {
  const now = useNow(60_000);
  const items = useMemo(() => buildLatest({ photos, offers, reviews, now }), [photos, offers, reviews, now]);
  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Lo último</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {items.map((item) => {
          const kind = KIND[item.kind];
          const image = item.imageUrl ? resolveImageUrl(item.imageUrl) : null;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${kind.label}: ${item.title}`}
              onPress={() => onPress(item)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              {image ? (
                <Image accessible={false} source={{ uri: image }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbIcon]}>
                  <Ionicons name={kind.icon} size={20} color={item.kind === 'offer' ? colors.accentInk : colors.verified} />
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.kind}>{kind.label}</Text>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.when}>{formatRelativeTime(item.at).replace('Publicado ', '')}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg },
  title: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  card: { width: 236, flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.85 },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 1 },
  kind: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.muted, textTransform: 'uppercase' },
  cardTitle: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  when: { fontSize: 11.5, fontFamily: fonts.ui.medium, color: colors.muted },
});
