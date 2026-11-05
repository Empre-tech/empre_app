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
import { Cover } from '@/components/Cover';
import { displayIcon } from '@/lib/mapView';

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

const HERO_HEIGHT = 250;

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
        {slides.length === 0 && !image ? <Cover category={categoryLabel} icon={icon} iconName={displayIcon(icon) as keyof typeof Ionicons.glyphMap} iconSize={96} style={StyleSheet.absoluteFill} /> : null}
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
        <View style={styles.logoRow}>
          <View style={[styles.logo, hasOffer && styles.logoRing]}>
            {profileUrl ? <Avatar uri={profileUrl} name={name} size={68} /> : <Ionicons name={(icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} size={32} color={colors.ink} />}
          </View>
          {follow ? (
            <Pressable accessibilityRole="button" accessibilityLabel={follow.on ? 'Dejar de seguir' : 'Seguir este negocio'} accessibilityState={{ selected: follow.on }} disabled={follow.busy} onPress={follow.onToggle} style={[styles.follow, follow.on && styles.followOn]}>
              {follow.busy ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={styles.followText}>{follow.on ? 'Siguiendo' : 'Seguir'}</Text>}
            </Pressable>
          ) : null}
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
            {name}
          </Text>
          {verified ? <VerifiedBadge size={18} /> : null}
        </View>
        {tagline ? <Text style={styles.tagline}>{tagline}</Text> : categoryLabel ? <Text style={styles.category}>{categoryLabel}</Text> : null}
      </View>
      {rating.hasScore || status ? (
        <View style={styles.stats}>
          {rating.hasScore ? (
            <Pressable accessibilityRole={onReviews ? 'button' : undefined} accessibilityLabel={`Nota ${rating.text}. Ver reseñas`} disabled={!onReviews} onPress={onReviews} style={styles.stat}>
              <Text style={styles.statText}>{rating.text}</Text>
            </Pressable>
          ) : null}
          {status ? (
            <View style={[styles.stat, status.tone === 'open' ? styles.statOpen : styles.statClosed]}>
              <Text style={[styles.statText, { color: status.tone === 'open' ? colors.verified : colors.danger }]}>{status.text}</Text>
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
  heroFoot: { position: 'absolute', left: 16, right: 16, bottom: 50, flexDirection: 'row', alignItems: 'center' },
  count: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(11,26,54,0.72)' },
  countText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#fff' },
  follow: { minHeight: 40, minWidth: 84, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  followOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  followText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  dots: { position: 'absolute', right: 16, bottom: 58, flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { width: 18, backgroundColor: '#fff' },
  head: { gap: 6, marginTop: -40, paddingHorizontal: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  logo: { width: 76, height: 76, borderRadius: 20, borderWidth: 4, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  logoRing: { borderColor: colors.accent },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 28, lineHeight: 31, fontFamily: fonts.display.bold, color: colors.ink },
  category: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted },
  tagline: { fontSize: 16, lineHeight: 22, fontFamily: fonts.ui.semibold, color: colors.ink },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginTop: 10 },
  stat: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.surface },
  statOpen: { backgroundColor: colors.verifiedSoft },
  statClosed: { backgroundColor: colors.primarySoft },
  statText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs, marginHorizontal: spacing.lg },
  nearby: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginHorizontal: spacing.lg },
  nearbyText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
});
