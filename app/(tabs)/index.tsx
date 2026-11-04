import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi } from '@/api/endpoints';
import { discoveryApi } from '@/api/offers';
import { Image } from 'expo-image';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { FigureTile } from '@/components/figures/Figure';
import { hourIdeas } from '@/lib/askChips';
import { categoryColor } from '@/lib/categoryColor';
import { formatDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { useCoords } from '@/lib/useCoords';
import { cardShadow, colors, fonts, radius, spacing } from '@/theme';

/**
 * Explorar (2026-10-29, lienzo «Empre · La app completa», B1): la app ya no abre en el mapa; abre preguntando
 * «¿Qué necesitas hoy?». Escribir o hablar lleva a «Pregúntale a Empre» (app/ask.tsx), que responde con negocios
 * reales cerca. Debajo: atajos de lo que más se busca, las categorías con sus figuras, lo abierto cerca y el mapa
 * como opción.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coords = useCoords();

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 10 * 60_000 });
  const open = useQuery({
    queryKey: ['home-near', coords?.latitude.toFixed(3), coords?.longitude.toFixed(3)],
    queryFn: () => discoveryApi.discover({ ...(coords ? { lat: coords.latitude, long: coords.longitude } : {}), limit: 12 }),
    staleTime: 60_000,
  });
  const [card, setCard] = useState<WithDistance | null>(null);
  const openNear = useMemo(() => (open.data?.items ?? []).filter((b) => b.is_open_now).slice(0, 6), [open.data]);

  const ideas = hourIdeas(new Date().getHours());
  const time = new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  const ask = (q?: string, voice = false) => router.push({ pathname: '/ask', params: { ...(q ? { q } : {}), ...(voice ? { voice: '1' } : {}) } });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <Text style={styles.where}>
          {coords ? 'Cerca de ti' : 'Cartagena'} · {time}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Novedades" onPress={() => router.push('/novedades')} style={styles.round}>
          <Ionicons name="notifications-outline" size={19} color={colors.ink} />
        </Pressable>
      </View>

      <Text style={styles.title} accessibilityRole="header">
        ¿Qué{'\n'}necesitas hoy?
      </Text>

      <View style={styles.searchPill}>
        <Pressable accessibilityRole="search" accessibilityLabel="Escribe lo que necesitas" onPress={() => ask()} style={styles.searchTap}>
          <Text style={styles.searchText}>Escribe o habla…</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Buscar hablando" onPress={() => ask(undefined, true)} style={styles.mic}>
          <Ionicons name="mic" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <Text style={styles.hourLabel}>PARA ESTA HORA · {ideas[0].name}</Text>
      <View style={styles.quick}>
        {ideas.map((q) => (
          <Pressable key={q.label} accessibilityRole="button" onPress={() => ask(q.ask)} style={({ pressed }) => [styles.quickTile, pressed && styles.pressed]}>
            <Ionicons name={q.icon} size={22} color={colors.ink} />
            <Text style={styles.quickText}>{q.label}</Text>
          </Pressable>
        ))}
      </View>

      {categories.data?.length ? (
        <>
          <View style={styles.secHead}>
            <Text style={styles.secTitle}>Categorías</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/categories')} hitSlop={8}>
              <Text style={styles.secLink}>Ver todas</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {categories.data.slice(0, 6).map((c) => (
              <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={c.name} onPress={() => ask(c.name)} style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
                <FigureTile name={c.name} fallbackIcon={c.icon} size={50} style={styles.tile} />
                <Text style={styles.cellText} numberOfLines={2}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {openNear.length ? (
        <>
          <View style={styles.secHead}>
            <Text style={styles.secTitle}>Abiertos cerca ahora</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/map')} hitSlop={8}>
              <Text style={styles.secLink}>Ver todos</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railIn}>
            {openNear.map((b) => {
              const photo = b.profile_url ? resolveImageUrl(b.profile_url) : null;
              const sub = [b.subcategory || b.category_name, formatDistance(b.distance_meters / 1000)].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={b.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.name}. ${sub}. ${b.closes_at ? `Hasta las ${b.closes_at}` : 'Abierto'}${b.has_active_offer ? '. Tiene oferta' : ''}`}
                  onPress={() => setCard({ ...b, distanceKm: b.distance_meters / 1000 })}
                  style={({ pressed }) => [styles.nearCard, pressed && styles.pressed]}
                >
                  <View style={[styles.nearPhoto, { backgroundColor: categoryColor(b.category_color).fg }]}>
                    {photo ? <Image accessible={false} source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={(b.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} size={30} color="#fff" />}
                    {b.has_active_offer ? (
                      <View style={styles.offer}>
                        <Text style={styles.offerText}>Oferta</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.nearBody}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {b.name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {sub}
                    </Text>
                    <Text style={styles.nearUntil}>{b.closes_at ? `Hasta las ${b.closes_at}` : 'Abierto'}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Mirar el mapa" onPress={() => router.push('/map')} style={styles.mapCard}>
        <Ionicons name="map-outline" size={22} color={colors.ink} />
        <View style={{ flex: 1 }}>
          <Text style={styles.mapTitle}>O mira el mapa</Text>
          <Text style={styles.rowSub}>Todos los negocios de tu zona, con sus ofertas</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
      <BusinessCardModal entity={card} onClose={() => setCard(null)} origin="home" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  where: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...cardShadow },
  title: { fontSize: 40, lineHeight: 44, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.sm, letterSpacing: -0.5 },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingLeft: 20,
    paddingRight: 7,
    ...cardShadow,
  },
  searchTap: { flex: 1, height: '100%', justifyContent: 'center' },
  searchText: { fontSize: 16, fontFamily: fonts.ui.bold, color: colors.muted },
  mic: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  hourLabel: { marginTop: spacing.lg, fontSize: 11, letterSpacing: 1, fontFamily: fonts.ui.extrabold, color: colors.muted },
  quick: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quickTile: { flex: 1, minHeight: 84, padding: spacing.sm, borderRadius: radius.md + 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 6, ...cardShadow },
  quickChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  quickText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  secHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
  secTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  secLink: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '31.5%', alignItems: 'center', gap: 6 },
  tile: { width: '100%', aspectRatio: 1.15 },
  cellText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
  rail: { marginHorizontal: -spacing.lg },
  railIn: { gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 2 },
  nearCard: { width: 156, borderRadius: radius.md + 2, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  nearPhoto: { height: 104, alignItems: 'center', justifyContent: 'center' },
  nearBody: { padding: 10, gap: 2 },
  nearUntil: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  rowName: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  rowSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: 2 },
  offer: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 9, height: 24, borderRadius: 12, backgroundColor: colors.accent, justifyContent: 'center' },
  offerText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  mapCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface, ...cardShadow },
  mapTitle: { fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.ink },
});
