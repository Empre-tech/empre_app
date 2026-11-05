import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { usersApi } from '@/api/endpoints';
import { novedadesApi } from '@/api/novedades';
import { discoveryApi, offersApi } from '@/api/offers';
import type { DiscoveryItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { Cover } from '@/components/Cover';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import { HomeMap } from '@/components/explore/HomeMap';
import { ActionTile, SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { useZones } from '@/components/explore/useZoneName';
import { ZoneButton, ZoneList } from '@/components/ZoneButton';
import { hourIdeas } from '@/lib/askChips';
import { displayIcon } from '@/lib/mapView';
import { dayLabel, stripEntries, type NovedadItem } from '@/lib/novedades';
import { distanceLabel, priceView } from '@/lib/offerMarket';
import { useCoords } from '@/lib/useCoords';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

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

/** Una tarjeta de «Cerca y abierto». Con pocos negocios se reparten el ancho; con muchos, van en fila. */
function NearCard({ b, width, wide, onPress }: { b: DiscoveryItem; width?: number; wide?: boolean; onPress: () => void }) {
  const dist = distanceLabel(b.distance_meters);
  const sub = [b.subcategory || b.category_name, dist ? `a ${dist}` : null].filter(Boolean).join(' · ');
  const until = untilLabel(b.closes_at);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${b.name}. ${sub}. ${until}${b.has_active_offer ? '. Tiene oferta' : ''}`} onPress={onPress} style={({ pressed }) => [styles.nearCard, width ? { width } : wide ? styles.nearWide : styles.nearFlex, pressed && styles.pressed]}>
      <Cover photo={b.profile_url} category={b.subcategory || b.category_name} icon={b.category_icon} iconName={displayIcon(b.category_icon) as IconName} style={styles.nearPhoto}>
        {b.has_active_offer ? (
          <View style={styles.offer}>
            <Text style={styles.offerText}>Oferta</Text>
          </View>
        ) : null}
      </Cover>
      <View style={styles.nearBody}>
        <Text style={styles.nearName} numberOfLines={1}>
          {b.name}
        </Text>
        <Text style={styles.nearSub} numberOfLines={1}>
          {sub}
        </Text>
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText} numberOfLines={1}>
            Abierto · {until.toLowerCase()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Inicio de Empre Finder, el escritorio de quien busca: tu zona, el buscador y el mapa como pieza principal. Debajo, lo
 * de esta hora, lo de siempre, lo abierto cerca y lo que publican los negocios. Cada sección sale si tiene algo real.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coords = useCoords();
  const { status, user } = useAuth();
  const signedIn = status === 'signedIn' && Boolean(user);
  const zones = useZones();
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [pinId, setPinId] = useState<string | null>(null);
  const [card, setCard] = useState<WithDistance | null>(null);
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
  const strip = useMemo(() => stripEntries(newsAll), [newsAll]);
  // Lo de siempre: tu última cita atendida. Solo sale de lo que ya hiciste.
  const usual = useMemo(() => [...(appts.data ?? [])].filter((a) => a.status === 'completed' && a.entity?.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0] ?? null, [appts.data]);
  const usualOpen = usual ? (open.data?.items ?? []).find((b) => b.id === usual.entity?.id) : undefined;
  const firstName = user?.name?.trim().split(/\s+/)[0];
  // En el mapa del inicio, solo lo abierto que trae ubicación.
  const mapItems = useMemo(() => openNear.filter((b) => b.latitude && b.longitude), [openNear]);
  const pinned = openNear.find((b) => b.id === pinId) ?? null;
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
            <Ionicons name="notifications-outline" size={20} color={colors.ink} />
            {unseen.length ? <View style={styles.bellDot} /> : null}
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
              <Text style={styles.searchText} numberOfLines={1}>
                Un negocio, un servicio o lo que necesites
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Buscar hablando" onPress={() => ask(undefined, true)} style={styles.mic}>
              <Ionicons name="mic-outline" size={18} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.main}>
            <View style={styles.mainMap}>
              {center ? (
                <HomeMap center={center} items={mapItems} selectedId={pinId} onPick={(id) => setPinId(pinId === id ? null : id)} showUser={!zone} />
              ) : (
                <View style={styles.mapEmpty}>
                  <Ionicons name="map-outline" size={30} color={colors.faint} />
                </View>
              )}
            </View>
            <View style={styles.mainFoot}>
              <View style={styles.mainText} accessibilityLiveRegion="polite">
                <Text style={styles.mainHead} numberOfLines={1}>
                  {pinned ? pinned.name : 'Abierto cerca de ti'}
                </Text>
                {pinned || openNear.length ? (
                  <View style={styles.live}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText} numberOfLines={1}>
                      {pinned ? ['Abierto', untilLabel(pinned.closes_at).toLowerCase(), distanceLabel(pinned.distance_meters) ? `a ${distanceLabel(pinned.distance_meters)}` : null].filter(Boolean).join(' · ') : `${mapItems.length} ${mapItems.length === 1 ? 'negocio' : 'negocios'} cerca`}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.mainSub}>{where === 'cerca de ti' ? 'Mira qué hay en tu zona' : `Mira qué hay ${where}`}</Text>
                )}
              </View>
              <Pressable accessibilityRole="button" onPress={() => (pinned ? setCard({ ...pinned, distanceKm: pinned.distance_meters / 1000 }) : router.push('/map'))} style={styles.mainBtn}>
                <Text style={styles.mainBtnText}>{pinned ? 'Ver negocio' : 'Abrir mapa'}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.hour}>
            <Text style={styles.label}>Para esta hora · {ideas[0].name.toLowerCase()}</Text>
            <View style={styles.quick}>
              {ideas.map((q) => (
                <ActionTile key={q.label} icon={q.icon} label={q.label} onPress={() => ask(q.ask)} />
              ))}
            </View>
          </View>

          {usual ? (
            <SystemGroup>
              <SystemRow first icon={usualOpen ? (displayIcon(usualOpen.category_icon) as IconName) : 'repeat'} tag="Lo de siempre" title={[usual.service?.name, usual.entity?.name].filter(Boolean).join(' · ')} sub={usualOpen?.is_open_now ? `Abierto · ${untilLabel(usualOpen.closes_at).toLowerCase()}` : 'Tu última cita. Pide otra cuando quieras'} onPress={() => router.push({ pathname: '/business/[id]', params: { id: usual.entity!.id } })} />
            </SystemGroup>
          ) : null}

          {openNear.length ? (
            <SystemSection title="Cerca y abierto ahora" link={openNear.length > 3 ? 'Ver todos' : undefined} onLink={() => router.push('/map')}>
              {openNear.length <= 3 ? (
                <View style={styles.pairs}>
                  {openNear.map((b) => (
                    <NearCard key={b.id} b={b} wide={openNear.length === 1} onPress={() => setCard({ ...b, distanceKm: b.distance_meters / 1000 })} />
                  ))}
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railIn}>
                  {openNear.map((b) => (
                    <NearCard key={b.id} b={b} width={212} onPress={() => setCard({ ...b, distanceKm: b.distance_meters / 1000 })} />
                  ))}
                </ScrollView>
              )}
            </SystemSection>
          ) : null}

          {signedIn && newsAll.length ? (
            <View onLayout={(e) => (newsY.current = e.nativeEvent.layout.y)}>
              <SystemSection title="Lo nuevo en tu zona" link="Ver todo" onLink={() => router.push('/novedades')}>
                <SystemGroup>
                  {newsAll.slice(0, 3).map((n, i) => (
                    <SystemRow key={n.kind + n.id} first={i === 0} icon={n.kind === 'offer' ? 'pricetag-outline' : 'images-outline'} tag={n.kind === 'offer' ? 'Oferta nueva' : 'Publicó'} title={n.title.trim() || n.entity_name} sub={`${n.entity_name} · ${whenLabel(n.at, now)}`} alert={n.unseen} onPress={() => openNews(n)} />
                  ))}
                </SystemGroup>
              </SystemSection>
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

          <SystemGroup>
            <SystemRow first icon="pricetag-outline" symbol="offers" title={bestSave > 0 ? `Hasta ${bestSave} % de ahorro hoy ${where}` : `Las ofertas de hoy ${where}`} sub="Empre Offers" onPress={() => router.push('/(tabs)/offers')} />
          </SystemGroup>
        </View>
        <BusinessCardModal entity={card} onClose={() => setCard(null)} origin="home" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchPill: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  searchTap: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchText: { flex: 1, minWidth: 0, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.faint },
  mic: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  main: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  mainMap: { height: 168, backgroundColor: colors.selectedSoft },
  mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mainFoot: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 },
  mainText: { flex: 1, minWidth: 0, gap: 2 },
  mainHead: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: colors.ink },
  mainSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  mainBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary },
  mainBtnText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#14B8B0' },
  liveText: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  label: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  pairs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  nearCard: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  nearFlex: { flex: 1, minWidth: 150 },
  nearWide: { width: '100%' },
  nearPhoto: { height: 116 },
  nearBody: { paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, gap: 3 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  pressed: { opacity: 0.75 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, ...softShadow },
  bellDot: { position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.brand },
  block: { gap: 20 },
  title: { fontSize: 26, lineHeight: 30, fontFamily: fonts.display.bold, color: colors.ink, letterSpacing: -0.4 },
  hour: { gap: 8 },
  quick: { flexDirection: 'row', gap: 8 },
  secTitle: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  rail: { marginHorizontal: -20 },
  railIn: { gap: 10, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 12 },
  offer: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.accent },
  offerText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  nearName: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: colors.ink },
  nearSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
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
});
