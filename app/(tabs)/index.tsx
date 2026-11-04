import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { usersApi } from '@/api/endpoints';
import { novedadesApi } from '@/api/novedades';
import { useAuth } from '@/auth/AuthContext';
import { useZones } from '@/components/explore/useZoneName';
import { discoveryApi } from '@/api/offers';
import { Image } from 'expo-image';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { hourIdeas } from '@/lib/askChips';
import { categoryColor } from '@/lib/categoryColor';
import { formatDistance } from '@/lib/format';
import { resolveImageUrl } from '@/lib/image';
import { novedadText } from '@/lib/novedades';
import { useCoords } from '@/lib/useCoords';
import { cardShadow, colors, fonts, radius, spacing } from '@/theme';

/**
 * Inicio de Empre Finder (tablero «Inicio en tres capas»): tu zona y lo nuevo arriba, «¿Qué necesitas hoy?» con el
 * buscador, ideas para esta hora, lo de siempre, lo abierto cerca y lo que publican los negocios que sigues. El mapa
 * queda a un toque, en el botón flotante.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coords = useCoords();

  const { status, user } = useAuth();
  const signedIn = status === 'signedIn' && Boolean(user);
  const qc = useQueryClient();
  const zones = useZones();
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [zonesOpen, setZonesOpen] = useState(false);
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const center = zone ? { latitude: zone.latitude, longitude: zone.longitude } : coords;
  const [fabHidden, setFabHidden] = useState(false);
  const lastY = useRef(0);
  const newsY = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const open = useQuery({
    queryKey: ['home-near', center?.latitude.toFixed(3), center?.longitude.toFixed(3)],
    queryFn: () => discoveryApi.discover({ ...(center ? { lat: center.latitude, long: center.longitude } : {}), limit: 12 }),
    staleTime: 60_000,
  });
  const [card, setCard] = useState<WithDistance | null>(null);
  const openNear = useMemo(() => (open.data?.items ?? []).filter((b) => b.is_open_now).slice(0, 6), [open.data]);

  const news = useQuery({ queryKey: ['novedades'], queryFn: novedadesApi.list, enabled: signedIn, staleTime: 60_000 });
  const appts = useQuery({ queryKey: ['appointments'], queryFn: agendaApi.mine, enabled: signedIn, staleTime: 60_000 });
  const follows = useQuery({ queryKey: ['my-favorites'], queryFn: usersApi.favorites, enabled: signedIn, staleTime: 60_000 });
  const unseen = (news.data ?? []).filter((n) => n.unseen).length;
  // Lo de siempre: tu última cita atendida. Solo sale de lo que ya hiciste.
  const usual = useMemo(() => [...(appts.data ?? [])].filter((a) => a.status === 'completed' && a.entity?.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0] ?? null, [appts.data]);
  const firstName = user?.name?.trim().split(/\s+/)[0];

  const ideas = hourIdeas(new Date().getHours());
  const seeAll = () => {
    void novedadesApi.markSeen().then(() => qc.invalidateQueries({ queryKey: ['novedades'] }));
  };
  const ask = (q?: string, voice = false) => router.push({ pathname: '/ask', params: { ...(q ? { q } : {}), ...(voice ? { voice: '1' } : {}) } });

  return (
    <View style={styles.screen}>
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={64}
      onScroll={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        const hide = y > 80 && y > lastY.current;
        lastY.current = y;
        if (hide !== fabHidden) setFabHidden(hide);
      }}
    >
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: zonesOpen }}
          accessibilityLabel={`${zone ? 'Estás viendo' : 'Estás en'} ${zone?.name ?? 'tu zona'}. Cambiar de zona`}
          disabled={zones.length === 0}
          onPress={() => setZonesOpen((v) => !v)}
          style={styles.zoneBtn}
        >
          <Ionicons name="location" size={18} color={colors.ink} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.zoneLead}>{zone ? 'Estás viendo' : 'Estás en'}</Text>
            <Text style={styles.zoneName} numberOfLines={1}>
              {zone?.name ?? (coords ? 'Cerca de ti' : 'Tu ciudad')}
            </Text>
          </View>
          {zones.length ? <Ionicons name={zonesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} /> : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unseen ? `Ir a lo nuevo: ${unseen} cosas nuevas` : 'Lo nuevo: estás al día'}
          onPress={() => (news.data?.length ? scrollRef.current?.scrollTo({ y: newsY.current - 16, animated: true }) : router.push('/novedades'))}
          style={styles.bell}
        >
          <Ionicons name={unseen ? 'notifications' : 'notifications-outline'} size={17} color={colors.ink} />
          <Text style={styles.bellText}>{unseen ? `${unseen} ${unseen === 1 ? 'nueva' : 'nuevas'}` : 'Al día'}</Text>
        </Pressable>
      </View>

      {zonesOpen ? (
        <View style={styles.zoneList}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: zoneId === null }} onPress={() => { setZoneId(null); setZonesOpen(false); }} style={[styles.zoneRow, zoneId === null && styles.zoneRowOn]}>
            <Text style={styles.zoneRowText}>Cerca de ti</Text>
          </Pressable>
          {zones.map((z) => (
            <Pressable key={z.id} accessibilityRole="button" accessibilityState={{ selected: zoneId === z.id }} onPress={() => { setZoneId(z.id); setZonesOpen(false); }} style={[styles.zoneRow, zoneId === z.id && styles.zoneRowOn]}>
              <Text style={styles.zoneRowText}>{z.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.title} accessibilityRole="header">
        ¿Qué necesitas hoy{firstName ? `, ${firstName}` : ''}?
      </Text>

      <View style={styles.searchPill}>
        <Pressable accessibilityRole="search" accessibilityLabel="Busca un negocio, un servicio o lo que necesites" onPress={() => ask()} style={styles.searchTap}>
          <Ionicons name="search" size={19} color={colors.muted} />
          <Text style={styles.searchText} numberOfLines={1}>
            Un negocio, un servicio o lo que necesites
          </Text>
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

      <Pressable accessibilityRole="link" onPress={() => router.push('/categories')} style={styles.catLink}>
        <Text style={styles.catLinkText}>Ver todas las categorías</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.ink} />
      </Pressable>

      {usual ? (
        <>
          <Text style={styles.hourLabel}>LO DE SIEMPRE</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${usual.service?.name ?? 'Tu última cita'} en ${usual.entity?.name}. Ver el negocio`}
            onPress={() => router.push({ pathname: '/business/[id]', params: { id: usual.entity!.id } })}
            style={({ pressed }) => [styles.usual, pressed && styles.pressed]}
          >
            <View style={styles.usualIcon}>
              <Ionicons name="repeat" size={20} color={colors.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowName} numberOfLines={1}>
                {[usual.service?.name, usual.entity?.name].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.rowSub}>Tu última cita. Pide otra cuando quieras</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </>
      ) : null}

      {openNear.length ? (
        <>
          <View style={styles.secHead}>
            <Text style={styles.secTitle}>Cerca y abierto ahora</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/map')} hitSlop={8}>
              <Text style={styles.secLink}>Ver en el mapa</Text>
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

      {signedIn ? (
        <View onLayout={(e) => (newsY.current = e.nativeEvent.layout.y)}>
          <View style={styles.secHead}>
            <Text style={styles.secTitle}>{unseen ? `${unseen} ${unseen === 1 ? 'cosa nueva' : 'cosas nuevas'}` : 'De los negocios que sigues'}</Text>
            {unseen ? (
              <Pressable accessibilityRole="button" onPress={seeAll} hitSlop={8}>
                <Text style={styles.secLink}>Marcar todo visto</Text>
              </Pressable>
            ) : null}
          </View>
          {(news.data ?? []).length ? (
            <View style={styles.newsCard}>
              {(news.data ?? []).slice(0, 4).map((n, i) => (
                <Pressable
                  key={n.kind + n.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/business/[id]', params: { id: n.entity_id } })}
                  style={({ pressed }) => [styles.newsRow, i > 0 && styles.newsLine, pressed && styles.pressed]}
                >
                  <View style={[styles.newsIcon, n.kind === 'offer' && { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name={n.kind === 'offer' ? 'pricetag-outline' : 'images-outline'} size={18} color={n.kind === 'offer' ? colors.accentInk : colors.ink} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {n.entity_name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {novedadText(n)}
                    </Text>
                  </View>
                  {n.unseen ? <View style={styles.newsDot} /> : null}
                </Pressable>
              ))}
              {(news.data ?? []).length > 4 ? (
                <Pressable accessibilityRole="link" onPress={() => router.push('/novedades')} style={[styles.newsRow, styles.newsLine]}>
                  <Text style={styles.catLinkText}>Ver todo lo nuevo</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (follows.data ?? []).length ? (
            <Text style={styles.rowSub}>Estás al día. Te avisamos cuando haya algo nuevo.</Text>
          ) : (
            <View style={styles.newsCard}>
              <View style={{ padding: spacing.md, gap: spacing.sm }}>
                <Text style={styles.rowSub}>Sigue a tus negocios favoritos para ver aquí lo que publican y sus ofertas nuevas.</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push('/map')} style={styles.catLink}>
                  <Text style={styles.catLinkText}>Buscar negocios para seguir</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.ink} />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Ver las ofertas de hoy" onPress={() => router.push('/(tabs)/offers')} style={({ pressed }) => [styles.offersBand, pressed && styles.pressed]}>
        <Ionicons name="pricetag" size={20} color={colors.accentInk} />
        <View style={{ flex: 1 }}>
          <Text style={styles.offersTitle}>Empre Offers</Text>
          <Text style={styles.offersSub}>Las ofertas de hoy{zone ? ` en ${zone.name}` : ' cerca de ti'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.accentInk} />
      </Pressable>
      <BusinessCardModal entity={card} onClose={() => setCard(null)} origin="home" />
    </ScrollView>
    {fabHidden ? null : (
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver el mapa${zone ? ` de ${zone.name}` : ''}`} onPress={() => router.push('/map')} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
        <Ionicons name="map" size={18} color="#fff" />
        <Text style={styles.fabText}>Mapa</Text>
      </Pressable>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zoneBtn: { flexShrink: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zoneLead: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  zoneName: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  bell: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, ...cardShadow },
  bellText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  zoneList: { marginTop: spacing.sm, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  zoneRow: { minHeight: 46, justifyContent: 'center', paddingHorizontal: spacing.md },
  zoneRowOn: { backgroundColor: colors.selectedSoft },
  zoneRowText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  title: { fontSize: 30, lineHeight: 35, fontFamily: fonts.display.bold, color: colors.ink, marginTop: spacing.sm, letterSpacing: -0.5 },
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
  searchTap: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  searchText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
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
  catLink: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  catLinkText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  usual: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md + 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  usualIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  newsCard: { borderRadius: radius.md + 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  newsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  newsLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  newsIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  newsDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  offersBand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.accentSoft },
  offersTitle: { fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.accentInk },
  offersSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.accentInk, marginTop: 1 },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.ink, ...cardShadow },
  fabText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
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
});
