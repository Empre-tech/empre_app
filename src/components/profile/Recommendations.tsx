import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { discoveryApi } from '@/api/offers';
import { categoryColor } from '@/lib/categoryColor';
import { boxAround } from '@/lib/discover';
import { formatDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { pickRecommendations, recReason } from '@/lib/profileLayout';
import { colors, fonts, radius, spacing } from '@/theme';
import { SectionHeader } from './SectionHeader';

interface Props {
  business: { id: string; latitude: number; longitude: number; category?: { id: string } | null };
  /** El negocio visitado está cerrado: solo se ofrecen alternativas abiertas ahora. */
  closed: boolean;
  title: string;
}

/**
 * «Más como este, cerca de aquí» / «Abiertos ahora cerca de aquí»: otros negocios de la misma categoría a menos de
 * 2 km del visitado, en el orden del listado de descubrimiento (sin patrocinados ni favoritos), hasta 6 y cada uno con
 * su razón («Oferta», «Abierto ahora»). Sin resultados no sale; si falla, un aviso pequeño con «Reintentar».
 */
export function Recommendations({ business, closed, title }: Props) {
  const router = useRouter();
  const categoryId = business.category?.id;
  const hasPoint = business.latitude !== 0 || business.longitude !== 0;

  const query = useQuery({
    queryKey: ['recommendations', business.id, categoryId],
    queryFn: () =>
      discoveryApi.discover({
        ...boxAround({ latitude: business.latitude, longitude: business.longitude }, 2),
        lat: business.latitude,
        long: business.longitude,
        category: categoryId,
        limit: 20,
      }),
    enabled: Boolean(categoryId) && hasPoint,
    staleTime: 5 * 60_000,
  });

  const picks = useMemo(
    () =>
      pickRecommendations(
        { id: business.id, category_id: categoryId ?? '' },
        (query.data?.items ?? []).map((e) => ({ ...e, distanceKm: e.distance_meters > 0 ? e.distance_meters / 1000 : null })),
        closed,
      ),
    [query.data, business.id, categoryId, closed],
  );

  if (!categoryId || !hasPoint) return null;
  if (query.isError) {
    return (
      <View style={styles.error} accessibilityRole="alert">
        <Text style={styles.errorText}>No pudimos cargar las recomendaciones.</Text>
        <Pressable accessibilityRole="button" onPress={() => void query.refetch()} style={styles.retry}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  if (picks.length === 0) return null;

  return (
    <View style={styles.block}>
      <SectionHeader title={title} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
        {picks.map((p) => {
          const cat = categoryColor(p.category_color);
          const reason = recReason(p);
          const image = resolveImageUrl(p.profile_url);
          const dist = formatDistance(p.distanceKm);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${p.category_name}${dist ? `, a ${dist}` : ''}${reason === 'offer' ? ', con oferta' : reason === 'open' ? ', abierto ahora' : ''}`}
              // `src` viaja al perfil, que lo cuenta como origen de «profile_opened».
              onPress={() => router.push({ pathname: '/business/[id]', params: { id: p.id, src: 'recommendation' } })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={[styles.image, { backgroundColor: cat.fg }]}>
                {image ? <Image accessible={false} source={{ uri: image }} style={styles.imageFill} contentFit="cover" transition={120} /> : <Ionicons name={(p.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} size={28} color="#fff" />}
              </View>
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {[p.category_name, dist].filter(Boolean).join(' · ')}
                </Text>
                {reason ? (
                  <View style={[styles.why, reason === 'offer' && styles.whyOffer]}>
                    <Text style={[styles.whyText, reason === 'offer' && styles.whyTextOffer]}>{reason === 'offer' ? 'Oferta' : 'Abierto ahora'}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.xs },
  title: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  scroll: { marginHorizontal: -spacing.md },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.md },
  card: { width: 150, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, overflow: 'hidden', backgroundColor: colors.surface },
  pressed: { opacity: 0.85 },
  image: { height: 78, alignItems: 'center', justifyContent: 'center' },
  imageFill: { width: '100%', height: '100%' },
  text: { padding: 10, gap: 2 },
  name: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  sub: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  why: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: '#E3F4EA' },
  whyOffer: { backgroundColor: colors.accent },
  whyText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#1D6B3D' },
  whyTextOffer: { color: colors.ink },
  error: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FBE4E4' },
  errorText: { flex: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#8E2A2A' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: '#8E2A2A', textDecorationLine: 'underline' },
});
