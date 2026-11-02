import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import type { coverSource } from '@/lib/profileLayout';
import { cardShadow, colors, fonts, radius, spacing } from '@/theme';

export interface HeroFact {
  icon: keyof typeof Ionicons.glyphMap;
  main: string;
  sub?: string;
  onPress?: () => void;
  label?: string;
}

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
  /** Hasta 3 datos en una tarjeta de 3 columnas bajo la portada (horario, domicilio, dónde). */
  facts?: HeroFact[];
  /** Lo que va bajo la portada (disponibilidad, «desde $…»). */
  children?: React.ReactNode;
}

const HERO_HEIGHT = 250;

/**
 * La portada de la vitrina (lienzo «Empre · La app completa», C1): UNA sola foto a lo ancho (la que eligió el dueño, o
 * la primera foto, o el color de la categoría) con un velo oscuro abajo; encima, el logo (con aro si hay oferta), el
 * nombre, la categoría, la nota y si está abierto. Debajo, los datos clave en una tarjeta de 3 columnas.
 */
export function ProfileHero({ name, categoryLabel, color, icon, profileUrl, cover, photosCount, rating, status, hasOffer, verified, topInset, onAllPhotos, onOpenCover, onNearby, facts = [], children }: Props) {
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
          <Image accessible={false} source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <View style={styles.fallback}>
            <Ionicons name={cover.kind === 'video' ? 'play-circle' : ((icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap)} size={cover.kind === 'video' ? 64 : 56} color="rgba(255,255,255,0.9)" />
          </View>
        )}
        {/* Velo arriba (para el botón de volver) y abajo (para que el nombre se lea sobre cualquier foto). */}
        <View style={[styles.topScrim, { height: topInset + 64 }]} pointerEvents="none" />
        <Svg style={styles.bottomScrim} width="100%" height={160} pointerEvents="none">
          <Defs>
            <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000" stopOpacity="0.82" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="160" fill="url(#scrim)" />
        </Svg>
        <View style={styles.overlay} accessible accessibilityLabel={label}>
          <View style={[styles.logo, hasOffer && styles.logoRing]}>
            <Avatar uri={profileUrl ?? undefined} name={name} size={52} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={2}>
                {name}
              </Text>
              {verified ? <VerifiedBadge size={18} /> : null}
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {[categoryLabel, rating.hasScore ? `★ ${rating.text}` : null].filter(Boolean).join('  ·  ')}
              {status ? <Text style={status.tone === 'open' ? styles.open : styles.closed}>{`  ·  ${status.text}`}</Text> : null}
            </Text>
          </View>
        </View>
        {photosCount > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver las ${photosCount} ${photosCount === 1 ? 'foto' : 'fotos'}`} onPress={onAllPhotos} style={[styles.count, { top: topInset + 60 }]}>
            <Ionicons name="images-outline" size={13} color="#fff" />
            <Text style={styles.countText}>
              {photosCount} {photosCount === 1 ? 'foto' : 'fotos'}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>

      {facts.length ? (
        <View style={styles.facts}>
          {facts.slice(0, 3).map((f, i) => (
            <Pressable key={f.main + i} accessibilityRole={f.onPress ? 'button' : undefined} accessibilityLabel={f.label ?? [f.main, f.sub].filter(Boolean).join(', ')} disabled={!f.onPress} onPress={f.onPress} style={[styles.fact, i > 0 && styles.factLine]}>
              <View style={styles.factIcon}>
                <Ionicons name={f.icon} size={18} color={colors.ink} />
              </View>
              <Text style={styles.factMain} numberOfLines={1}>
                {f.main}
              </Text>
              {f.sub ? (
                <Text style={styles.factSub} numberOfLines={1}>
                  {f.sub}
                </Text>
              ) : null}
            </Pressable>
          ))}
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
  hero: { width: '100%', overflow: 'hidden', justifyContent: 'flex-end' },
  fallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.22)' },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  overlay: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  logo: { width: 58, height: 58, borderRadius: 18, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surface },
  logoRing: { borderWidth: 3, borderColor: colors.accent },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 24, lineHeight: 28, fontFamily: fonts.display.bold, color: '#fff' },
  meta: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: 'rgba(255,255,255,0.95)', marginTop: 3 },
  open: { color: '#8EE0B0' },
  closed: { color: '#FFB4B4' },
  count: { position: 'absolute', right: spacing.lg, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  countText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: '#fff' },
  facts: { flexDirection: 'row', marginTop: spacing.lg, marginHorizontal: spacing.lg, borderRadius: 18, backgroundColor: colors.surface, ...cardShadow },
  fact: { flex: 1, alignItems: 'center', gap: 6, paddingTop: 14, paddingBottom: 12, paddingHorizontal: 6, minHeight: 44 },
  factLine: { borderLeftWidth: 1, borderLeftColor: colors.line },
  factIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  factMain: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  factSub: { fontSize: 11, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center' },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md, marginHorizontal: spacing.lg },
  nearby: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginHorizontal: spacing.lg },
  nearbyText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
});
