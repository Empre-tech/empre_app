import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi } from '@/api/endpoints';
import { discoveryApi } from '@/api/offers';
import { Avatar } from '@/components/Avatar';
import { FigureTile } from '@/components/figures/Figure';
import { QUICK_ASKS } from '@/lib/askChips';
import { formatDistance } from '@/lib/format';
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
  const openNear = useMemo(() => (open.data?.items ?? []).filter((b) => b.is_open_now).slice(0, 3), [open.data]);

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
          <Ionicons name="mic" size={20} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.quick}>
        {QUICK_ASKS.map((q) => (
          <Pressable key={q} accessibilityRole="button" onPress={() => ask(q)} style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}>
            <Text style={styles.quickText}>{q}</Text>
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
          <View style={styles.card}>
            {openNear.map((b, i) => (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/business/[id]', params: { id: b.id, src: 'home' } })}
                style={[styles.row, i > 0 && styles.rowLine]}
              >
                <Avatar uri={b.profile_url} name={b.name} size={52} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {b.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {[b.subcategory || b.category_name, formatDistance(b.distance_meters / 1000), b.closes_at ? `hasta las ${b.closes_at}` : 'abierto']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {b.has_active_offer ? (
                  <View style={styles.offer}>
                    <Text style={styles.offerText}>Oferta</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
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
  mic: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  quickChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  quickText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  pressed: { opacity: 0.7 },
  secHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
  secTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  secLink: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '31.5%', alignItems: 'center', gap: 6 },
  tile: { width: '100%', aspectRatio: 1.15 },
  cellText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
  card: { borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: spacing.md, ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  rowName: { fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.ink },
  rowSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: 2 },
  offer: { paddingHorizontal: 9, height: 24, borderRadius: 12, backgroundColor: colors.accent, justifyContent: 'center' },
  offerText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  mapCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface, ...cardShadow },
  mapTitle: { fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.ink },
});
