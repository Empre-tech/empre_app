import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Photo } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import type { PhotosPlan } from '@/lib/profileLayout';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  name: string;
  categoryLabel: string;
  /** «90 m · 1 min a pie» (null si no se sabe la distancia). */
  walk?: string | null;
  /** Color de la categoría (hex del backend) para la portada sin foto. */
  color?: string | null;
  icon?: string | null;
  profileUrl?: string | null;
  photos: Photo[];
  plan: PhotosPlan;
  rating: { text: string; hasScore: boolean };
  status: { text: string; tone: 'open' | 'closed' } | null;
  hasOffer: boolean;
  verified: boolean;
  topInset: number;
  onAllPhotos: () => void;
  onOpenPhoto: (index: number) => void;
  /** Lo que va bajo las píldoras (disponibilidad, canjes de la semana). */
  children?: React.ReactNode;
}

const HERO_HEIGHT = 190;
const isVideo = (p: Photo) => p.content_type?.startsWith('video/') ?? false;

/**
 * Portada 2 de la maqueta `perfil_final.html`: foto (o galería de hasta 4 desde 3 fotos, o el color de la categoría) y,
 * montada sobre su borde, una tarjeta blanca con el avatar, el nombre, la categoría con la distancia y las píldoras de
 * nota y estado. El nombre va sobre blanco: se lee con cualquier foto del dueño.
 */
export function ProfileHero({ name, categoryLabel, walk, color, icon, profileUrl, photos, plan, rating, status, hasOffer, verified, topInset, onAllPhotos, onOpenPhoto, children }: Props) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const cat = categoryColor(color);
  const height = HERO_HEIGHT + topInset;
  const slides = photos.slice(0, plan.coverCount);
  const sub = [categoryLabel, walk].filter(Boolean).join(' · ');
  const label = [name, sub, rating.text, status?.text].filter(Boolean).join('. ');

  return (
    <View>
      <View style={[styles.hero, { height, backgroundColor: cat.fg }]}>
        {plan.cover === 'fallback' ? (
          <View style={styles.fallback} accessible={false}>
            <Ionicons name={(icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} size={56} color="rgba(255,255,255,0.9)" />
          </View>
        ) : (
          <FlatList
            data={slides}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            scrollEnabled={slides.length > 1}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            renderItem={({ item, index }) => (
              <Pressable accessibilityRole="button" accessibilityLabel={isVideo(item) ? 'Ver el video' : 'Ver la foto'} onPress={() => onOpenPhoto(index)} style={{ width, height }}>
                {isVideo(item) ? (
                  <View style={[styles.videoSlide, { backgroundColor: cat.fg }]}>
                    <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.92)" />
                  </View>
                ) : (
                  <Image accessible={false} source={{ uri: resolveImageUrl(item.url) ?? undefined }} style={styles.heroImage} contentFit="cover" transition={150} />
                )}
              </Pressable>
            )}
          />
        )}
        {/* Velo suave arriba: el botón de volver se ve con cualquier foto. */}
        <View style={[styles.topScrim, { height: topInset + 56 }]} pointerEvents="none" />
        {photos.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver las ${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}`}
            onPress={onAllPhotos}
            style={styles.count}
          >
            <Text style={styles.countText}>
              {plan.cover === 'gallery' ? `${Math.min(page + 1, slides.length)} / ${slides.length} · ` : ''}
              {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.card} accessible accessibilityLabel={label}>
        <View style={[styles.avatarWrap, hasOffer && styles.avatarRing]}>
          <Avatar uri={profileUrl ?? undefined} name={name} size={64} />
        </View>
        <View style={styles.titleCol}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={2}>
              {name}
            </Text>
            {verified ? <VerifiedBadge size={18} /> : null}
          </View>
          {sub ? (
            <Text style={styles.sub} numberOfLines={2}>
              {sub}
            </Text>
          ) : null}
        </View>
        <View style={styles.facts}>
          <View style={[styles.pill, rating.hasScore && styles.pillRating]}>
            <Text style={[styles.pillText, rating.hasScore ? styles.pillRatingText : styles.pillMuted]}>{rating.text}</Text>
          </View>
          {status ? (
            <View style={[styles.pill, status.tone === 'open' ? styles.pillOpen : styles.pillClosed]}>
              <Text style={[styles.pillText, status.tone === 'open' ? styles.pillOpenText : styles.pillClosedText]}>{status.text}</Text>
            </View>
          ) : null}
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  videoSlide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: 'rgba(10,20,40,0.28)' },
  count: { position: 'absolute', right: spacing.md, bottom: spacing.lg + 40, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(10,20,40,0.7)' },
  countText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: '#fff' },
  card: {
    marginTop: -44,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg + 2,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    ...shadow,
  },
  avatarWrap: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { borderWidth: 3, borderColor: colors.accent },
  titleCol: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 20, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  facts: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { minHeight: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' },
  pillText: { fontSize: 12, fontFamily: fonts.ui.bold },
  pillMuted: { color: colors.muted },
  pillRating: { backgroundColor: '#FFF4DC' },
  pillRatingText: { color: '#7A4B00' },
  pillOpen: { backgroundColor: '#E3F4EA' },
  pillOpenText: { color: '#1D6B3D' },
  pillClosed: { backgroundColor: '#FBE4E4' },
  pillClosedText: { color: '#8E2A2A' },
});
