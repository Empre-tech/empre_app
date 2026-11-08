import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi } from '@/api/agenda';
import { catalogApi } from '@/api/catalog';
import type { ServiceItem } from '@/lib/catalog';
import { entitiesApi } from '@/api/endpoints';
import { novedadesApi } from '@/api/novedades';
import { claimsApi, discoveryApi, offersApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { useZones } from '@/components/explore/useZoneName';
import { BAND, dayPart, HomeBand } from '@/components/home/HomeBand';
import { HomeDoors, type DoorRect, type SmallDoor } from '@/components/home/HomeDoors';
import { ParaTiCarousel, type ParaTiSlide } from '@/components/home/ParaTiCarousel';
import { MarketItemSheet } from '@/components/offers/MarketItemSheet';
import { SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { ZoneButton, ZoneList } from '@/components/ZoneButton';
import { FEATURES } from '@/config';
import { hourIdeas } from '@/lib/askChips';
import { effectiveClaimStatus } from '@/lib/claims';
import { mediaUrl } from '@/lib/image';
import { dayLabel, stripEntries, type NovedadItem } from '@/lib/novedades';
import { mergeCatalogIntoMarket, type MarketItem } from '@/lib/offerMarket';
import { pickParaTi, type ParaTiCandidate } from '@/lib/paraTi';
import { topHabits, type SearchHabit } from '@/lib/searchHabits';
import { loadHabits } from '@/lib/searchHabitsStore';
import { useCoords } from '@/lib/useCoords';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Lo que cabe «a 5 minutos a pie». */
const NEAR_M = 400;

function whenLabel(iso: string, now: number): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  if (min < 24 * 60) return `Hace ${Math.floor(min / 60)} h`;
  return dayLabel(iso, now);
}

/** «hoy 4:30 pm», «mañana 10:00 am» o «vie 9:00 am». */
function apptWhen(iso: string, now: number): string {
  const d = new Date(iso);
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const today = new Date(now);
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
  const day = days === 0 ? 'hoy' : days === 1 ? 'mañana' : d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
  return `${day} ${time}`;
}

function expiresIn(iso: string, now: number): string {
  const min = Math.max(1, Math.ceil((Date.parse(iso) - now) / 60_000));
  return min < 60 ? `Vence en ${min} min` : `Vence en ${Math.floor(min / 60)} h`;
}

/**
 * Inicio de Empre en capas (3.59): 1 · buscar y puertas, con una franja que cambia con la hora; 2 · lo tuyo, solo lo que
 * está en curso; 3 · «Para ti», como mucho 3 recomendaciones por reglas fijas que llevan directo a lo importante; 4 · lo
 * nuevo en tu zona. Con pocos datos cada capa se encoge o no se dibuja: nunca se rellena con datos inventados.
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
  const [card, setCard] = useState<WithDistance | null>(null);
  const [previewItem, setPreviewItem] = useState<MarketItem | null>(null);
  const [habits, setHabits] = useState<SearchHabit[]>([]);
  // La hora del inicio: se fija al entrar y se renueva cada vez que vuelves a él (de ella salen la franja y «Para ti»).
  const [now, setNow] = useState(() => Date.now());
  // La puerta Explorar se abre hasta llenar la pantalla y ahí empieza el mapa (3.60).
  const reduce = useReduceMotion();
  const win = useWindowDimensions();
  const [door, setDoor] = useState<DoorRect | null>(null);
  const [grow] = useState(() => new Animated.Value(0));
  const newsY = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const center = zone ? { latitude: zone.latitude, longitude: zone.longitude } : coords;
  const place = center ? { lat: center.latitude, long: center.longitude } : {};
  const placeKey = [center?.latitude.toFixed(3), center?.longitude.toFixed(3)];

  // Lo que más buscas vive en el teléfono; se relee al volver al inicio (por si acabas de buscar).
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      setDoor(null);
      void loadHabits().then(setHabits);
    }, []),
  );

  const open = useQuery({ queryKey: ['home-near', ...placeKey], queryFn: () => discoveryApi.discover({ ...place, limit: 12 }), staleTime: 60_000 });
  const market = useQuery({ queryKey: ['home-market', ...placeKey], queryFn: () => offersApi.market(place), staleTime: 60_000 });
  const news = useQuery({ queryKey: ['novedades'], queryFn: novedadesApi.list, enabled: signedIn, staleTime: 60_000 });
  const appts = useQuery({ queryKey: ['appointments'], queryFn: agendaApi.mine, enabled: signedIn && FEATURES.agenda, staleTime: 60_000 });
  const claims = useQuery({ queryKey: ['my-claims'], queryFn: claimsApi.mine, enabled: signedIn, staleTime: 30_000 });
  const mine = useQuery({ queryKey: ['my-entities'], queryFn: entitiesApi.mine, enabled: signedIn, staleTime: 60_000 });

  const nearBizList = useMemo(() => (open.data?.items ?? []).slice(0, 6), [open.data]);
  const catalogQueries = useQueries({
    queries: nearBizList.map((b) => ({
      queryKey: ['catalog', b.id],
      queryFn: () => catalogApi.list(b.id),
      staleTime: 120_000,
    })),
  });
  const catalogsByEntity = useMemo(() => {
    const map: Record<string, ServiceItem[]> = {};
    nearBizList.forEach((b, idx) => {
      const data = catalogQueries[idx]?.data;
      if (data?.length) map[b.id] = data;
    });
    return map;
  }, [nearBizList, catalogQueries]);

  /** Ofertas y servicios del catálogo cerca, sin repetir: los candidatos de «Para ti» que no son negocios. */
  const marketItems = useMemo(() => {
    const d = market.data;
    const raw = d ? [...(d.featured ? [d.featured] : []), ...d.near, ...d.trending, ...d.for_you.items, ...d.searched.items] : [];
    const seen = new Set<string>();
    const unique = raw.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
    return mergeCatalogIntoMarket(unique, open.data?.items ?? [], catalogsByEntity, (id?: string) => (id ? mediaUrl(id) : undefined));
  }, [market.data, open.data, catalogsByEntity]);

  const hour = new Date(now).getHours();
  const part = dayPart(hour);
  const band = BAND[part];
  const ideas = useMemo(() => hourIdeas(hour), [hour]);
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const zoneName = zone?.name ?? (market.data?.zone || null);

  const discovery = useMemo(() => open.data?.items ?? [], [open.data]);
  const openNear = useMemo(() => discovery.filter((b) => b.is_open_now), [discovery]);
  const mapItems = useMemo(() => openNear.filter((b) => b.latitude && b.longitude).slice(0, 8), [openNear]);
  const walkable = openNear.filter((b) => b.distance_meters <= NEAR_M).length;
  const mapSub = walkable ? `${walkable} ${walkable === 1 ? 'abierto' : 'abiertos'} a 5 min a pie` : openNear.length ? `${openNear.length} ${openNear.length === 1 ? 'abierto' : 'abiertos'} cerca` : 'Nada abierto cerca ahora';

  // Capa 2 · Lo tuyo: solo lo que está en curso.
  const nextAppt = useMemo(
    () =>
      [...(appts.data ?? [])]
        .filter((a) => (a.status === 'confirmed' || a.status === 'requested') && Date.parse(a.ends_at) > now && Date.parse(a.starts_at) - now < 48 * 3_600_000)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null,
    [appts.data, now],
  );
  const activeClaims = useMemo(() => (claims.data ?? []).filter((c) => effectiveClaimStatus(c, now) === 'RECLAMADO').slice(0, 2), [claims.data, now]);
  const newsAll = useMemo(() => news.data ?? [], [news.data]);
  const unseen = newsAll.filter((n) => n.unseen);
  const strip = useMemo(() => stripEntries(newsAll), [newsAll]);
  const usualIds = useMemo(() => (appts.data ?? []).filter((a) => a.status === 'completed' && a.entity?.id).map((a) => a.entity!.id), [appts.data]);

  // Capa 3 · Para ti.
  const top = useMemo(() => topHabits(habits, now), [habits, now]);
  const picks = useMemo(() => {
    const byEntity = new Map(discovery.map((b) => [b.id, b]));
    const cands: ParaTiCandidate[] = [
      ...marketItems.map((m): ParaTiCandidate => {
        const biz = byEntity.get(m.entity_id);
        const kind = m.kind === 'service' ? 'service' : 'offer';
        return {
          key: `${kind}:${m.id}`,
          kind,
          id: m.id,
          entityId: m.entity_id,
          entityName: m.entity_name,
          title: m.title,
          category: [m.category_name, biz?.subcategory].filter(Boolean).join(' '),
          open: m.open_now ?? biz?.is_open_now ?? null,
          distanceM: m.distance_meters,
          endsAt: kind === 'offer' ? m.ends_at : undefined,
          closesAt: m.open_until ?? biz?.closes_at,
          trending: m.trending,
          rating: m.rating,
        };
      }),
      ...discovery.map(
        (b): ParaTiCandidate => ({
          key: `business:${b.id}`,
          kind: 'business',
          id: b.id,
          entityId: b.id,
          entityName: b.name,
          title: b.name,
          category: [b.category_name, b.subcategory].filter(Boolean).join(' '),
          open: b.is_open_now,
          distanceM: b.distance_meters,
          closesAt: b.closes_at,
        }),
      ),
    ];
    return pickParaTi(cands, {
      now,
      topTerms: top.map((h) => h.term),
      usualEntityIds: usualIds,
      hourWords: ideas.map((i) => i.ask),
      busyEntityIds: nextAppt?.entity?.id ? [nextAppt.entity.id] : [],
      busyOfferIds: activeClaims.map((c) => c.offer_id),
    });
  }, [marketItems, discovery, top, usualIds, nextAppt, activeClaims, now, ideas]);

  const slides: ParaTiSlide[] = picks.map((p) => {
    const c = p.candidate;
    const biz = discovery.find((b) => b.id === c.entityId);
    const item = c.kind === 'business' ? null : marketItems.find((m) => m.id === c.id) ?? null;
    return {
      pick: p,
      photo: item?.photo ?? biz?.profile_url ?? null,
      category: biz?.subcategory || biz?.category_name || item?.category_name,
      icon: biz?.category_icon ?? item?.category_icon ?? null,
      onOpen: () => {
        if (c.kind === 'offer') router.push({ pathname: '/offer/[id]', params: { id: c.id, entityId: c.entityId } });
        else if (c.kind === 'service' && item) setPreviewItem(item);
        else if (biz) setCard({ ...biz, distanceKm: biz.distance_meters / 1000 });
      },
    };
  });

  const openExplore = (rect: DoorRect | null) => {
    if (!rect || reduce) {
      router.push('/map');
      return;
    }
    setDoor(rect);
    grow.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
      if (finished) router.push('/map');
    });
  };

  const ask = (q?: string, voice = false) => router.push({ pathname: '/ask', params: { ...(q ? { q } : {}), ...(voice ? { voice: '1' } : {}) } });
  const openNews = (n: NovedadItem) => {
    if (n.kind === 'offer') router.push({ pathname: '/offer/[id]', params: { id: n.id, entityId: n.entity_id } });
    else router.push({ pathname: '/business/[id]', params: { id: n.entity_id } });
  };

  // Con historial, lo que más buscas; sin historial, lo típico de esta hora.
  const chips = top.length ? { label: 'Lo que más buscas', items: top.map((h) => ({ label: h.term, ask: h.term })) } : { label: 'Para esta hora', items: ideas.map((i) => ({ label: i.label, ask: i.ask })) };

  const firstBiz = (mine.data ?? [])[0];
  const doors: SmallDoor[] = [
    ...(FEATURES.agenda ? [{ key: 'citas', label: 'Citas', icon: 'calendar-outline' as IconName, onPress: () => router.push('/appointments') }] : []),
    { key: 'salidas', label: 'Salidas', icon: 'ticket-outline', onPress: () => router.push('/salidas') },
    { key: 'sigo', label: 'Sigo', icon: 'heart-outline', onPress: () => router.push('/favorites') },
    firstBiz
      ? { key: 'negocio', label: 'Mi negocio', icon: 'storefront-outline', onPress: () => router.push({ pathname: '/business/hub/[id]', params: { id: firstBiz.id } }) }
      : { key: 'negocio', label: 'Tu negocio', icon: 'storefront-outline', onPress: () => router.push('/business/new') },
  ];

  const hasTuyo = Boolean(nextAppt) || activeClaims.length > 0 || strip.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Capa 1 · Buscar, con el tema de la hora */}
        <HomeBand part={part} top={insets.top + 12}>
          <View style={styles.topRow}>
            <EmpreSymbol product="master" size={32} />
            <View style={styles.zone}>
              <ZoneButton lead={zone ? 'Estás viendo' : 'Estás en'} name={zoneName ?? (coords ? 'Cerca de ti' : 'Tu ciudad')} open={zonesOpen} disabled={zones.length === 0} dark={part === 'noche'} onPress={() => setZonesOpen((v) => !v)} />
            </View>
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

          <View style={styles.greet}>
            <Text style={[styles.hello, { color: band.sub }]}>{band.hello}</Text>
            <Text style={[styles.title, { color: band.ink }]} accessibilityRole="header">
              ¿Qué necesitas hoy{firstName ? `, ${firstName}` : ''}?
            </Text>
          </View>

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

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRail} contentContainerStyle={styles.chipIn}>
            <Text style={[styles.chipLabel, { color: band.sub }]}>{chips.label}</Text>
            {chips.items.map((c) => (
              <Pressable key={c.label} accessibilityRole="button" accessibilityLabel={`Buscar ${c.label}`} onPress={() => ask(c.ask)} style={[styles.chip, { backgroundColor: band.chipBg, borderColor: band.chipLine }]}>
                <Text style={[styles.chipText, { color: band.ink }]} numberOfLines={1}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </HomeBand>

        <View style={styles.body}>
          {/* Puertas */}
          <HomeDoors
            center={center}
            mapItems={mapItems}
            mapSub={mapSub}
            hasOpen={openNear.length > 0}
            offersSub={marketItems.length ? 'Las de hoy, cerca' : 'En toda la ciudad'}
            onExplore={openExplore}
            onOffers={() => router.push('/(tabs)/offers')}
            doors={doors}
          />

          {/* Capa 2 · Lo tuyo */}
          {hasTuyo ? (
            <SystemSection title="Lo tuyo">
              {nextAppt || activeClaims.length ? (
                <SystemGroup>
                  {nextAppt ? (
                    <SystemRow
                      first
                      icon="calendar-outline"
                      tag={`Tu cita · ${apptWhen(nextAppt.starts_at, now)}${nextAppt.status === 'requested' ? ' · por confirmar' : ''}`}
                      title={nextAppt.service?.name ?? 'Cita'}
                      sub={nextAppt.entity?.name}
                      onPress={() => router.push({ pathname: '/appointment/[id]', params: { id: nextAppt.id } })}
                    />
                  ) : null}
                  {activeClaims.map((c, i) => (
                    <SystemRow
                      key={c.id}
                      first={!nextAppt && i === 0}
                      icon="qr-code-outline"
                      tag={`Oferta reclamada · ${expiresIn(c.expires_at, now)}`}
                      title={c.offer?.title ?? 'Tu oferta'}
                      sub={[c.entity_name, 'muestra tu QR en caja'].filter(Boolean).join(' · ')}
                      alert
                      onPress={() => router.push({ pathname: '/offer/claim', params: { claimId: c.id, offerId: c.offer_id } })}
                    />
                  ))}
                </SystemGroup>
              ) : null}
              {strip.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.followIn}>
                  {strip.map((w) => (
                    <Pressable key={w.entityId} accessibilityRole="button" accessibilityLabel={`${w.name}${w.ring === 'offer' ? ', oferta nueva' : w.ring === 'post' ? ', publicó' : ''}`} onPress={() => router.push({ pathname: '/business/[id]', params: { id: w.entityId } })} style={styles.follow}>
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
              ) : null}
            </SystemSection>
          ) : null}

          {/* Capa 3 · Para ti */}
          {slides.length ? (
            <View style={styles.section}>
              <View style={styles.paraHead}>
                <EmpreSymbol product="ai" size={22} />
                <Text style={styles.secTitle} accessibilityRole="header">
                  {top.length || usualIds.length ? 'Para ti' : 'Para ti, a esta hora'}
                </Text>
              </View>
              <ParaTiCarousel slides={slides} />
            </View>
          ) : null}

          {/* Capa 4 · Lo nuevo en tu zona */}
          <View onLayout={(e) => (newsY.current = e.nativeEvent.layout.y)}>
            <SystemSection title="Lo nuevo en tu zona" link={newsAll.length > 3 ? 'Ver todo' : undefined} onLink={() => router.push('/novedades')}>
              <SystemGroup>
                {newsAll.length ? (
                  newsAll.slice(0, 3).map((n, i) => (
                    <SystemRow key={n.kind + n.id} first={i === 0} icon={n.kind === 'offer' ? 'pricetag-outline' : 'images-outline'} tag={n.kind === 'offer' ? 'Oferta nueva' : 'Publicó'} title={n.title.trim() || n.entity_name} sub={`${n.entity_name} · ${whenLabel(n.at, now)}`} alert={n.unseen} onPress={() => openNews(n)} />
                  ))
                ) : (
                  <SystemRow first icon="heart-outline" tag="Para empezar" title="Sigue a los negocios que te gustan" sub="Aquí verás lo que publican y sus ofertas" onPress={() => router.push('/map')} />
                )}
              </SystemGroup>
            </SystemSection>
          </View>
        </View>
        <BusinessCardModal entity={card} onClose={() => setCard(null)} origin="home" />
        <MarketItemSheet item={previewItem} onClose={() => setPreviewItem(null)} />
      </ScrollView>
      {door ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.door,
            {
              left: grow.interpolate({ inputRange: [0, 1], outputRange: [door.x, 0] }),
              top: grow.interpolate({ inputRange: [0, 1], outputRange: [door.y, 0] }),
              width: grow.interpolate({ inputRange: [0, 1], outputRange: [door.w, win.width] }),
              height: grow.interpolate({ inputRange: [0, 1], outputRange: [door.h, win.height] }),
              borderRadius: grow.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  door: { position: 'absolute', zIndex: 20, backgroundColor: colors.selectedSoft },
  content: { paddingBottom: 120 },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 26 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zone: { flex: 1, minWidth: 0 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, ...softShadow },
  bellDot: { position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.brand },
  greet: { gap: 2 },
  hello: { fontSize: 13, fontFamily: fonts.ui.extrabold },
  title: { fontSize: 26, lineHeight: 30, fontFamily: fonts.display.bold, letterSpacing: -0.4 },
  searchPill: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  searchTap: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchText: { flex: 1, minWidth: 0, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.faint },
  mic: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  chipRail: { marginHorizontal: -20, marginTop: -2 },
  chipIn: { alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  chipLabel: { fontSize: 12.5, fontFamily: fonts.ui.extrabold },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: fonts.ui.extrabold },
  section: { gap: 8 },
  paraHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  secTitle: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  rail: { marginHorizontal: -20 },
  followIn: { gap: 16, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 },
  follow: { width: 76, alignItems: 'center', gap: 6 },
  followRing: { width: 67, height: 67, borderRadius: 34, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  followName: { fontSize: 12, lineHeight: 14, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
  followWhat: { fontSize: 12, fontFamily: fonts.ui.extrabold, textAlign: 'center' },
});
