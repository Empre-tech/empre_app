import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import type { coverSource } from '@/lib/profileLayout';
import { colors, fonts, radius, spacing } from '@/theme';

export interface HeroSlide {
  url: string;
  /** Su lugar en la lista de fotos, para abrir el visor en esa. */
  index: number;
}

interface Props {
  name: string;
  categoryLabel: string;
  /** La frase propia del negocio. */
  tagline?: string | null;
  /** Color de la categoría (hex del backend) para la portada sin imagen. */
  color?: string | null;
  icon?: string | null;
  profileUrl?: string | null;
  /** La portada cuando no hay fotos que deslizar (ver `coverSource`). */
  cover: ReturnType<typeof coverSource>;
  /** Las fotos que se deslizan en la portada. */
  slides: HeroSlide[];
  photosCount: number;
  rating: { text: string; hasScore: boolean };
  status: { text: string; tone: 'open' | 'closed' } | null;
  hasOffer: boolean;
  verified: boolean;
  topInset: number;
  onAllPhotos: () => void;
  onOpenSlide?: (index: number) => void;
  onReviews?: () => void;
  /** Cerrado: un enlace pequeño baja hasta «Abiertos ahora cerca de aquí». */
  onNearby?: () => void;
  /** Seguir: solo para quien visita. */
  follow?: { on: boolean; busy: boolean; onToggle: () => void };
  /** Lo que va bajo los datos (disponibilidad, canjes). */
  children?: React.ReactNode;
}

const HERO_HEIGHT = 260;

/**
 * La portada del perfil (tablero «Un solo perfil del negocio»): las fotos reales se deslizan, con cuántas hay y
 * «Seguir» encima. Debajo, el nombre, su frase y los datos que deciden: la nota y si está abierto.
 */
export function ProfileHero({ name, categoryLabel, tagline, color, icon, profileUrl, cover, slides, photosCount, rating, status, hasOffer, verified, topInset, onAllPhotos, onOpenSlide, onReviews, onNearby, follow, children }: Props) {
  const { width } = useWindowDimensions();
  const cat = categoryColor(color);
  const height = HERO_HEIGHT + topInset;
  const [page, setPage] = useState(0);
  const image = cover.kind === 'banner' || cover.kind === 'photo' ? resolveImageUrl(cover.url) : null;

  return (
    <View>
      <View style={[styles.hero, { height, backgroundColor: cat.fg }]}>
        {slides.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={64}
            onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))}
          >
            {slides.map((s, i) => (
              <Pressable key={s.url + i} accessibilityRole="button" accessibilityLabel={`Ver la foto ${i + 1} de ${slides.length}`} disabled={!onOpenSlide} onPress={() => onOpenSlide?.(s.index)} style={{ width, height }}>
                <Image accessible={false} source={{ uri: resolveImageUrl(s.url) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              </Pressable>
            ))}
          </ScrollView>
        ) : image ? (
          <Image accessible={false} source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <View style={styles.fallback}>
            <Ionicons name={(icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} size={56} color="rgba(255,255,255,0.75)" />
          </View>
        )}
        <View style={[styles.topScrim, { height: topInset + 64 }]} pointerEvents="none" />
        <View style={styles.heroFoot} pointerEvents="box-none">
          {photosCount > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Ver las ${photosCount} ${photosCount === 1 ? 'foto' : 'fotos'}`} onPress={onAllPhotos} style={styles.count}>
              <Ionicons name="images-outline" size={14} color="#fff" />
              <Text style={styles.countText}>
                {photosCount} {photosCount === 1 ? 'foto' : 'fotos'}
              </Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} pointerEvents="none" />
          {follow ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={follow.on ? 'Dejar de seguir' : 'Seguir este negocio'}
              accessibilityState={{ selected: follow.on }}
              disabled={follow.busy}
              onPress={follow.onToggle}
              style={[styles.follow, follow.on && styles.followOn]}
            >
              {follow.busy ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={styles.followText}>{follow.on ? 'Siguiendo' : 'Seguir'}</Text>}
            </Pressable>
          ) : null}
        </View>
        {slides.length > 1 ? (
          <View style={styles.dots} pointerEvents="none">
            {slides.map((s, i) => (
              <View key={s.url + i} style={[styles.dot, i === page && styles.dotOn]} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.head}>
        <View style={[styles.logo, hasOffer && styles.logoRing]}>
          <Avatar uri={profileUrl ?? undefined} name={name} size={52} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
              {name}
            </Text>
            {verified ? <VerifiedBadge size={18} /> : null}
          </View>
          {categoryLabel ? (
            <Text style={styles.category} numberOfLines={1}>
              {categoryLabel}
            </Text>
          ) : null}
        </View>
      </View>
      {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
      {rating.hasScore || status ? (
        <View style={styles.stats}>
          {rating.hasScore ? (
            <Pressable accessibilityRole={onReviews ? 'button' : undefined} accessibilityLabel={`Nota ${rating.text}. Ver reseñas`} disabled={!onReviews} onPress={onReviews} style={styles.stat}>
              <Text style={styles.statText}>{rating.text}</Text>
            </Pressable>
          ) : null}
          {status ? (
            <View style={styles.stat}>
              <View style={[styles.statusDot, { backgroundColor: status.tone === 'open' ? colors.verified : colors.danger }]} />
              <Text style={styles.statText}>{status.text}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {children ? <View style={styles.extras}>{children}</View> : null}
      {onNearby ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Ver negocios abiertos cerca, al final del perfil" onPress={onNearby} style={styles.nearby}>
          <Text style={styles.nearbyText}>Ver abiertos cerca ↓</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden' },
  fallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.22)' },
  heroFoot: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, flexDirection: 'row', alignItems: 'center' },
  count: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(11,26,54,0.72)' },
  countText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#fff' },
  follow: { minHeight: 44, minWidth: 92, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  followOn: { backgroundColor: colors.selectedSoft },
  followText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dots: { position: 'absolute', alignSelf: 'center', bottom: 26, flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { width: 18, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  logo: { width: 58, height: 58, borderRadius: 18, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surface },
  logoRing: { borderWidth: 3, borderColor: colors.accent },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 24, lineHeight: 29, fontFamily: fonts.display.bold, color: colors.ink },
  category: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: 2 },
  tagline: { fontSize: 14.5, lineHeight: 21, fontFamily: fonts.ui.medium, color: colors.ink, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  stat: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs, marginHorizontal: spacing.lg },
  nearby: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginHorizontal: spacing.lg },
  nearbyText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
});
