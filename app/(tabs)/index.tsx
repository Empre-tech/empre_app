import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { usersApi } from '@/api/endpoints';
import { novedadesApi } from '@/api/novedades';
import { discoveryApi, offersApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { useZones } from '@/components/explore/useZoneName';
import { ZoneButton, ZoneList } from '@/components/ZoneButton';
import { hourIdeas } from '@/lib/askChips';
import { resolveImageUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { dayLabel, stripEntries, type NovedadItem } from '@/lib/novedades';
import { distanceLabel, priceView } from '@/lib/offerMarket';
import { photoTone } from '@/lib/photoTone';
import { useCoords } from '@/lib/useCoords';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type NewsTab = 'todo' | 'negocios' | 'ofertas';
const NEWS_TABS: [NewsTab, string][] = [
  ['todo', 'Todo'],
  ['negocios', 'Negocios'],
  ['ofertas', 'Ofertas y planes'],
];
const newsType = (n: NovedadItem): NewsTab => (n.kind === 'offer' ? 'ofertas' : 'negocios');

/** «21:00» → «Hasta 9 pm». */
function untilLabel(closes?: string): string {
  const m = closes?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 'Abierto';
  const h = Number(m[1]);
  const h12 = h % 12 || 12;
  return `Hasta ${h12}${m[2] === '00' ? '' : `:${m[2]}`} ${h < 12 ? 'am' : 'pm'}`;
}

function whenLabel(iso: string, now: number): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  if (min < 24 * 60) return `Hace ${Math.floor(min / 60)} h`;
  return dayLabel(iso, now);
}

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
  const [tab, setTab] = useState<NewsTab>('todo');
  const [fabHidden, setFabHidden] = useState(false);
  const [card, setCard] = useState<WithDistance | null>(null);
  const lastY = useRef(0);
  const newsY = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const center = zone ? { latitude: zone.latitude, longitude: zone.longitude } : coords;
  const place = center ? { lat: center.latitude, long: center.longitude } : {};
  const placeKey = [center?.latitude.toFixed(3), center?.longitude.toFixed(3)];

  const open = useQuery({ queryKey: ['home-near', ...placeKey], queryFn: () => discoveryApi.discover({ ...place, limit: 12 }), staleTime: 60_000 });
  const market = useQuery({ queryKey: ['home-market', ...placeKey], queryFn: () => offersApi.market(place), staleTime: 60_000 });
  const news = useQuery({ queryKey: ['novedades'], queryFn: novedadesApi.list, enabled: signedIn, staleTime: 60_000 });
  const appts = useQuery({ queryKey: ['appointments'], queryFn: agendaApi.mine, enabled: signedIn, staleTime: 60_000 });
  const follows = useQuery({ queryKey: ['my-favorites'], queryFn: usersApi.favorites, enabled: signedIn, staleTime: 60_000 });

  const openNear = useMemo(() => (open.data?.items ?? []).filter((b) => b.is_open_now).slice(0, 6), [open.data]);
  const newsAll = useMemo(() => news.data ?? [], [news.data]);
  const unseen = newsAll.filter((n) => n.unseen);
  const newsList = useMemo(() => (tab === 'todo' ? newsAll : newsAll.filter((n) => newsType(n) === tab)).slice(0, 4), [newsAll, tab]);
  const strip = useMemo(() => stripEntries(newsAll), [newsAll]);
  // Lo de siempre: tu última cita atendida. Solo sale de lo que ya hiciste.
  const usual = useMemo(() => [...(appts.data ?? [])].filter((a) => a.status === 'completed' && a.entity?.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0] ?? null, [appts.data]);
  const usualOpen = usual ? (open.data?.items ?? []).find((b) => b.id === usual.entity?.id) : undefined;
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const zoneName = zone?.name ?? (market.data?.zone || null);

  // El mayor ahorro de verdad que hay hoy por aquí; sin ahorro no se promete ninguno.
  const bestSave = useMemo(() => {
    const d = market.data;
    if (!d) return 0;
    return [...(d.featured ? [d.featured] : []), ...d.near, ...d.trending].reduce((best, o) => {
      const s = priceView(o).save;
      const pct = s ? Number(s.replace(/\D/g, '')) : 0;
      return Math.max(best, pct);
    }, 0);
  }, [market.data]);
  const where = zoneName ? `en ${zoneName}` : 'cerca de ti';

  const ideas = hourIdeas(new Date().getHours());
  const now = Date.now();
  const seeAll = () => {
    void novedadesApi.markSeen().then(() => qc.invalidateQueries({ queryKey: ['novedades'] }));
  };
  const ask = (q?: string, voice = false) => router.push({ pathname: '/ask', params: { ...(q ? { q } : {}), ...(voice ? { voice: '1' } : {}) } });
  const openNews = (n: NovedadItem) => {
    if (n.kind === 'offer') router.push({ pathname: '/offer/[id]', params: { id: n.id, entityId: n.entity_id } });
    else router.push({ pathname: '/business/[id]', params: { id: n.entity_id } });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
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
          <EmpreSymbol size={26} />
          <ZoneButton lead={zone ? 'Estás viendo' : 'Estás en'} name={zoneName ?? (coords ? 'Cerca de ti' : 'Tu ciudad')} open={zonesOpen} disabled={zones.length === 0} onPress={() => setZonesOpen((v) => !v)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unseen.length ? `Ir a lo nuevo: ${unseen.length} cosas nuevas` : 'Estás al día'}
            hitSlop={6}
            onPress={() => (newsAll.length ? scrollRef.current?.scrollTo({ y: newsY.current - 16, animated: true }) : router.push('/novedades'))}
            style={styles.bell}
          >
            {unseen.length ? <View style={styles.bellDot} /> : null}
            <Text style={styles.bellText}>{unseen.length ? `${unseen.length} ${unseen.length === 1 ? 'nueva' : 'nuevas'}` : 'Al día'}</Text>
          </Pressable>
        </View>

        {zonesOpen ? (
          <ZoneList
            options={[{ id: '', name: 'Cerca de ti', where: 'aquí' }, ...zones.map((z) => ({ id: z.id, name: z.name }))]}
            selected={zoneId ?? ''}
            onPick={(o) => {
              setZoneId(o.id || null);
              setZonesOpen(false);
            }}
          />
        ) : null}

        <View style={styles.block}>
          <Text style={styles.title} accessibilityRole="header">
            ¿Qué necesitas hoy{firstName ? `, ${firstName}` : ''}?
          </Text>

          <View style={styles.searchPill}>
            <Pressable accessibilityRole="search" accessibilityLabel="Busca un negocio, un servicio o lo que necesites" onPress={() => ask()} style={styles.searchTap}>
              <Ionicons name="search" size={20} color={colors.ink} />
              <Text style={styles.searchText}>Un negocio, un servicio o lo que necesites</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Buscar hablando" onPress={() => ask(undefined, true)} style={styles.mic}>
              <Ionicons name="mic-outline" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.hour}>
            <Text style={styles.eyebrow}>PARA ESTA HORA · {ideas[0].name}</Text>
            <View style={styles.quick}>
              {ideas.map((q) => (
                <Pressable key={q.label} accessibilityRole="button" onPress={() => ask(q.ask)} style={({ pressed }) => [styles.quickTile, pressed && styles.pressed]}>
                  <Ionicons name={q.icon} size={22} color={colors.ink} />
                  <Text style={styles.quickText}>{q.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {usual ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Lo de siempre: ${usual.service?.name ?? 'tu última cita'} en ${usual.entity?.name}. Ver el negocio`}
              onPress={() => router.push({ pathname: '/business/[id]', params: { id: usual.entity!.id } })}
              style={({ pressed }) => [styles.usual, pressed && styles.pressed]}
            >
              <View style={styles.usualIcon}>
                <Ionicons name={usualOpen ? (displayIcon(usualOpen.category_icon) as IconName) : 'repeat'} size={20} color={colors.ink} />
              </View>
              <View style={styles.usualBody}>
                <Text style={styles.usualEyebrow}>LO DE SIEMPRE</Text>
                <Text style={styles.usualName} numberOfLines={1}>
                  {[usual.service?.name, usual.entity?.name].filter(Boolean).join(' · ')}
                </Text>
                {usualOpen?.is_open_now ? <Text style={styles.usualOpen}>Abierto · {untilLabel(usualOpen.closes_at).toLowerCase()}</Text> : <Text style={styles.usualSub}>Tu última cita. Pide otra cuando quieras</Text>}
              </View>
            </Pressable>
          ) : null}

          {openNear.length ? (
            <View style={styles.hour}>
              <View style={styles.secHead}>
                <Text style={styles.secTitle} accessibilityRole="header">
                  Cerca y abierto ahora
                </Text>
                <Pressable accessibilityRole="link" onPress={() => router.push('/map')} style={styles.secLinkTap}>
                  <Text style={styles.secLink}>Ver en el mapa</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railIn}>
                {openNear.map((b, i) => {
                  const photo = b.profile_url ? resolveImageUrl(b.profile_url) : null;
                  const dist = distanceLabel(b.distance_meters);
                  const sub = [b.subcategory || b.category_name, dist ? `a ${dist}` : null].filter(Boolean).join(' · ');
                  const until = untilLabel(b.closes_at);
                  return (
                    <Pressable
                      key={b.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${b.name}. ${sub}. ${until}${b.has_active_offer ? '. Tiene oferta' : ''}`}
                      onPress={() => setCard({ ...b, distanceKm: b.distance_meters / 1000 })}
                      style={({ pressed }) => [styles.nearCard, pressed && styles.pressed]}
                    >
                      <View style={[styles.nearPhoto, { backgroundColor: photoTone(i) }]}>
                        {photo ? <Image accessible={false} source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={displayIcon(b.category_icon) as IconName} size={32} color="#fff" />}
                        {b.has_active_offer ? (
                          <View style={styles.offer}>
                            <Text style={styles.offerText}>Oferta</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.nearBody}>
                        <Text style={styles.nearName} numberOfLines={1}>
                          {b.name}
                        </Text>
                        <Text style={styles.nearSub} numberOfLines={1}>
                          {sub}
                        </Text>
                        <Text style={styles.nearUntil}>{until}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {signedIn && newsAll.length ? (
            <View onLayout={(e) => (newsY.current = e.nativeEvent.layout.y)} style={styles.news}>
              <View style={styles.newsHead}>
                <Text style={styles.newsTitle} accessibilityRole="header">
                  {unseen.length ? `${unseen.length === 1 ? '1 cosa nueva' : `${unseen.length} cosas nuevas`} desde tu última visita` : 'Ya viste todo lo nuevo'}
                </Text>
                {unseen.length ? (
                  <Pressable accessibilityRole="button" onPress={seeAll} style={styles.secLinkTap}>
                    <Text style={styles.secLink}>Marcar todo visto</Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.tabsIn}>
                {NEWS_TABS.map(([id, label]) => {
                  const on = tab === id;
                  const n = id === 'todo' ? unseen.length : unseen.filter((x) => newsType(x) === id).length;
                  return (
                    <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setTab(id)} style={[styles.tab, on && styles.tabOn]}>
                      <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
                      {n > 0 ? (
                        <View style={[styles.tabN, on && styles.tabNOn]}>
                          <Text style={styles.tabNText}>{n}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
              {newsList.map((n) => (
                <Pressable key={n.kind + n.id} accessibilityRole="button" onPress={() => openNews(n)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                  <View style={styles.itemTile}>
                    <Ionicons name={n.kind === 'offer' ? 'pricetag-outline' : 'images-outline'} size={22} color={colors.ink} />
                  </View>
                  <View style={styles.itemBody}>
                    <Text style={[styles.itemKind, { color: n.kind === 'offer' ? colors.accentInk : colors.verified }]}>{n.kind === 'offer' ? 'OFERTA NUEVA' : 'PUBLICÓ'}</Text>
                    <Text style={styles.itemTitle} numberOfLines={2}>
                      {n.title.trim() || n.entity_name}
                    </Text>
                    <Text style={styles.itemSub} numberOfLines={1}>
                      {n.entity_name}
                    </Text>
                  </View>
                  <View style={styles.itemSide}>
                    <Text style={styles.itemWhen}>{whenLabel(n.at, now)}</Text>
                    {n.unseen ? <View style={styles.itemDot} /> : null}
                  </View>
                </Pressable>
              ))}
              {unseen.length === 0 ? (
                <View style={styles.done}>
                  <Ionicons name="checkmark" size={18} color={colors.verified} />
                  <Text style={styles.doneText}>Estás al día · te avisamos cuando haya algo nuevo</Text>
                </View>
              ) : null}
              <Pressable accessibilityRole="link" onPress={() => router.push('/novedades')} style={styles.allNew}>
                <Text style={styles.allNewText}>Ver todo lo nuevo de la semana</Text>
              </Pressable>
            </View>
          ) : null}

          {signedIn ? (
            <View style={styles.hour}>
              <Text style={styles.secTitle} accessibilityRole="header">
                De los negocios que sigues
              </Text>
              {strip.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.followIn}>
                  {strip.map((w) => (
                    <Pressable key={w.entityId} accessibilityRole="button" onPress={() => router.push({ pathname: '/business/[id]', params: { id: w.entityId } })} style={styles.follow}>
                      <View style={[styles.followRing, { borderColor: w.ring === 'offer' ? colors.accent : w.ring === 'post' ? colors.ink : colors.line }]}>
                        <Avatar uri={w.profileUrl} name={w.name} size={56} />
                      </View>
                      <Text style={styles.followName} numberOfLines={2}>
                        {w.name}
                      </Text>
                      {w.ring !== 'none' ? <Text style={[styles.followWhat, { color: w.ring === 'offer' ? colors.accentInk : colors.ink }]}>{w.ring === 'offer' ? 'Oferta nueva' : 'Publicó'}</Text> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (follows.data ?? []).length ? (
                <Text style={styles.followNone}>Los negocios que sigues no han publicado nada nuevo.</Text>
              ) : (
                <View style={styles.noFollows}>
                  <Text style={styles.noFollowsText}>Sigue a tus negocios favoritos para ver aquí lo que publican y sus ofertas nuevas.</Text>
                  <Pressable accessibilityRole="button" onPress={() => router.push('/map')} style={styles.noFollowsBtn}>
                    <Text style={styles.noFollowsBtnText}>Buscar negocios para seguir</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : null}

          <Pressable accessibilityRole="button" accessibilityLabel="Ver las ofertas de hoy" onPress={() => router.push('/(tabs)/offers')} style={({ pressed }) => [styles.band, pressed && styles.pressed]}>
            <View style={styles.bandBody}>
              <Text style={styles.bandBrand}>
                EMP<Text style={{ color: colors.accent }}>RE</Text> <Text style={styles.bandProduct}>Offers</Text>
              </Text>
              <Text style={styles.bandTitle}>{bestSave > 0 ? `Hasta ${bestSave} % de ahorro hoy ${where}` : `Las ofertas de hoy ${where}`}</Text>
            </View>
            <View style={styles.bandGo}>
              <Ionicons name="arrow-forward" size={20} color={colors.ink} />
            </View>
          </Pressable>
        </View>
        <BusinessCardModal entity={card} onClose={() => setCard(null)} origin="home" />
      </ScrollView>
      {fabHidden ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver el mapa${zoneName ? ` de ${zoneName}` : ''}`} onPress={() => router.push('/map')} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
          <EmpreSymbol size={26} />
          <Text style={styles.fabText}>Mapa</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 92, gap: 18 },
  pressed: { opacity: 0.75 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bell: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  bellDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  bellText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  block: { gap: 14 },
  title: { fontSize: 30, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink, letterSpacing: -0.6 },
  searchPill: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 6, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  searchTap: { flex: 1, minWidth: 0, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  searchText: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontFamily: fonts.ui.bold, color: colors.placeholder },
  mic: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  hour: { gap: 8 },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  quick: { flexDirection: 'row', gap: 8 },
  quickTile: { flex: 1, minWidth: 0, minHeight: 84, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 6, ...softShadow },
  quickText: { fontSize: 12.5, lineHeight: 15, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  usual: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  usualIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  usualBody: { flex: 1, minWidth: 0, gap: 1 },
  usualEyebrow: { fontSize: 11, letterSpacing: 0.9, fontFamily: fonts.ui.extrabold, color: colors.faint },
  usualName: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  usualOpen: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.verified },
  usualSub: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secTitle: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  secLinkTap: { minHeight: 44, justifyContent: 'center' },
  secLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  rail: { marginHorizontal: -20 },
  railIn: { gap: 10, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 4 },
  nearCard: { width: 156, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  nearPhoto: { height: 104, alignItems: 'center', justifyContent: 'center' },
  offer: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.accent },
  offerText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  nearBody: { paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10, gap: 2 },
  nearName: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  nearSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  nearUntil: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  news: { gap: 10 },
  newsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  newsTitle: { flex: 1, fontSize: 21, lineHeight: 26, fontFamily: fonts.display.bold, color: colors.ink },
  tabsIn: { gap: 8, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 4 },
  tab: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  tabTextOn: { color: '#fff' },
  tabN: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 8, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  tabNOn: { backgroundColor: '#fff' },
  tabNText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  itemTile: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  itemKind: { fontSize: 11, letterSpacing: 0.66, fontFamily: fonts.ui.extrabold },
  itemTitle: { fontSize: 16, lineHeight: 19, fontFamily: fonts.display.bold, color: colors.ink },
  itemSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  itemSide: { alignItems: 'flex-end', gap: 6 },
  itemWhen: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.placeholder },
  itemDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  done: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.verifiedSoft },
  doneText: { flex: 1, fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.verified },
  allNew: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  allNewText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  followIn: { gap: 16, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 },
  follow: { width: 72, alignItems: 'center', gap: 6 },
  followRing: { width: 67, height: 67, borderRadius: 34, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  followName: { fontSize: 12, lineHeight: 14, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
  followWhat: { fontSize: 12, fontFamily: fonts.ui.extrabold, textAlign: 'center' },
  followNone: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  noFollows: { padding: 14, gap: 10, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  noFollowsText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  noFollowsBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary },
  noFollowsBtnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  band: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, backgroundColor: colors.ink },
  bandBody: { flex: 1, minWidth: 0, gap: 4 },
  bandBrand: { fontSize: 14, letterSpacing: 0.7, fontFamily: fonts.display.bold, color: '#fff' },
  bandProduct: { letterSpacing: 0, color: colors.line },
  bandTitle: { fontSize: 19, lineHeight: 22, fontFamily: fonts.display.bold, color: '#fff' },
  bandGo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 16, height: 52, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 13, paddingRight: 18, borderRadius: 26, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  fabText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
