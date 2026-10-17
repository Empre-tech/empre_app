import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import type { coverSource } from '@/lib/profileLayout';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  name: string;
  categoryLabel: string;
  /** Color de la categoría (hex del backend) para la portada sin imagen. */
  color?: string | null;
  icon?: string | null;
  profileUrl?: string | null;
  /** La portada: la del dueño, la primera foto o el color (ver `coverSource`). */
  cover: ReturnType<typeof coverSource>;
  photosCount: number;
  rating: { text: string; hasScore: boolean };
  status: { text: string; tone: 'open' | 'closed' } | null;
  hasOffer: boolean;
  verified: boolean;
  topInset: number;
  onAllPhotos: () => void;
  /** Tocar la portada cuando es una foto o un video: abre el visor. */
  onOpenCover?: () => void;
  /** Cerrado: un enlace pequeño baja hasta «Abiertos ahora cerca de aquí». */
  onNearby?: () => void;
  /** Lo que va bajo las píldoras (disponibilidad, canjes de la semana). */
  children?: React.ReactNode;
}

const HERO_HEIGHT = 190;

/**
 * La portada del perfil (maqueta `perfil_secciones.html`): una sola imagen, la que eligió el dueño (o la primera foto,
 * o el color de la categoría), y montada sobre su borde la tarjeta blanca con el avatar, el nombre, la categoría y las
 * píldoras de nota y estado. Las fotos tienen su propia sección; la portada no es una galería.
 */
export function ProfileHero({ name, categoryLabel, color, icon, profileUrl, cover, photosCount, rating, status, hasOffer, verified, topInset, onAllPhotos, onOpenCover, onNearby, children }: Props) {
  const cat = categoryColor(color);
  const height = HERO_HEIGHT + topInset;
  const label = [name, categoryLabel, rating.text, status?.text].filter(Boolean).join('. ');
  const image = cover.kind === 'banner' || cover.kind === 'photo' ? resolveImageUrl(cover.url) : null;
  const tappable = (cover.kind === 'photo' || cover.kind === 'video') && Boolean(onOpenCover);

  return (
    <View>
      <Pressable
        accessible={tappable}
        accessibilityRole={tappable ? 'button' : undefined}
        accessibilityLabel={tappable ? (cover.kind === 'video' ? 'Ver el video de portada' : 'Ver la foto de portada') : undefined}
        disabled={!tappable}
        onPress={onOpenCover}
        style={[styles.hero, { height, backgroundColor: cat.fg }]}
      >
        {image ? (
          <Image accessible={false} source={{ uri: image }} style={styles.heroImage} contentFit="cover" transition={150} />
        ) : (
          <View style={styles.fallback}>
            <Ionicons name={cover.kind === 'video' ? 'play-circle' : ((icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap)} size={cover.kind === 'video' ? 64 : 56} color="rgba(255,255,255,0.9)" />
          </View>
        )}
        {/* Velo suave arriba: el botón de volver se ve con cualquier imagen. */}
        <View style={[styles.topScrim, { height: topInset + 56 }]} pointerEvents="none" />
      </Pressable>
      {photosCount > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver las ${photosCount} ${photosCount === 1 ? 'foto' : 'fotos'}`} onPress={onAllPhotos} style={[styles.count, { top: height - 44 - 56 }]}>
          <Ionicons name="images-outline" size={13} color="#fff" />
          <Text style={styles.countText}>
            {photosCount} {photosCount === 1 ? 'foto' : 'fotos'}
          </Text>
        </Pressable>
      ) : null}

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
          {categoryLabel ? (
            <Text style={styles.sub} numberOfLines={2}>
              {categoryLabel}
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
  heroImage: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: 'rgba(10,20,40,0.28)' },
  count: { position: 'absolute', right: spacing.md, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(10,20,40,0.7)' },
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
  nearby: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginHorizontal: spacing.md + spacing.sm },
  nearbyText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primary },
});
