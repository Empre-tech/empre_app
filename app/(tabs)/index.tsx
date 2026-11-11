import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { useZones } from '@/components/explore/useZoneName';
import { EmpreAISheet } from '@/components/ai/EmpreAISheet';
import type { DoorRect } from '@/components/home/HomeDoors';
import { Muro, type MuroPin } from '@/components/home/Muro';
import { PuertaMapa } from '@/components/home/PuertaMapa';
import { MarketItemSheet } from '@/components/offers/MarketItemSheet';
import { SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { ZoneButton, ZoneList } from '@/components/ZoneButton';
import { FEATURES } from '@/config';
import { effectiveClaimStatus } from '@/lib/claims';
import { mediaUrl } from '@/lib/image';
import { dayLabel, stripEntries } from '@/lib/novedades';
import { onFootOrDistance } from '@/lib/format';
import { mergeCatalogIntoMarket, priceView, type MarketItem } from '@/lib/offerMarket';
import { useCoords } from '@/lib/useCoords';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

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
  const [aiOpen, setAiOpen] = useState(false);
  // La hora del inicio: se fija al entrar y se renueva cada vez que vuelves a él (de ella salen la franja y «Para ti»).
  const [now, setNow] = useState(() => Date.now());
  // La puerta Explorar se abre hasta llenar la pantalla y ahí empieza el mapa (3.60).
  const reduce = useReduceMotion();
  const win = useWindowDimensions();
  const [door, setDoor] = useState<DoorRect | null>(null);
  const [grow] = useState(() => new Animated.Value(0));
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const center = zone ? { latitude: zone.latitude, longitude: zone.longitude } : coords;
  const place = center ? { lat: center.latitude, long: center.longitude } : {};
  const placeKey = [center?.latitude.toFixed(3), center?.longitude.toFixed(3)];

  // Al volver al inicio se renueva la hora (de ella salen «hace 5 min» y lo que vence).
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      setDoor(null);
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

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const zoneName = zone?.name ?? (market.data?.zone || null);

  const discovery = useMemo(() => open.data?.items ?? [], [open.data]);
  const openNear = useMemo(() => discovery.filter((b) => b.is_open_now), [discovery]);
  const mapItems = useMemo(() => openNear.filter((b) => b.latitude && b.longitude).slice(0, 8), [openNear]);

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

  // Al bajar: un muro de lo que ofrecen los negocios cerca (tablero «Inicio», teléfono 2). Solo lo que publicaron.
  const pins: MuroPin[] = marketItems.slice(0, 12).map((m) => {
    const price = priceView(m);
    return {
      key: `${m.kind ?? 'offer'}:${m.id}`,
      photo: m.photo,
      category: m.category_name,
      icon: m.category_icon,
      title: m.title,
      sub: price.now,
      tag: m.kind === 'service' ? null : (price.save ?? 'Oferta'),
      chip: m.trending ? { text: 'Lo están pidiendo', tone: 'new' } : null,
      who: m.entity_name,
      near: m.distance_meters !== null ? onFootOrDistance(m.distance_meters / 1000) : null,
      onPress: () => (m.kind === 'service' ? setPreviewItem(m) : router.push({ pathname: '/offer/[id]', params: { id: m.id, entityId: m.entity_id } })),
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

  // Más en Empre: lo que no está en las pestañas (sin repetir Ofertas ni Mensajes).
  const firstBiz = (mine.data ?? [])[0];
  const mas: { key: string; title: string; sub: string; icon: IconName; tone: 'night' | 'agenda' | 'plain'; onPress: () => void }[] = [
    { key: 'ai', title: 'Pregúntale a Empre AI', sub: 'Te responde al instante', icon: 'sparkles', tone: 'night', onPress: () => setAiOpen(true) },
    ...(FEATURES.agenda
      ? [{ key: 'citas', title: 'Reserva una hora', sub: nextAppt ? `Tu cita ${apptWhen(nextAppt.starts_at, now)}` : 'Con quien tenga libre', icon: 'calendar-outline' as IconName, tone: 'agenda' as const, onPress: () => router.push('/appointments') }]
      : []),
    { key: 'salidas', title: 'Mis salidas', sub: activeClaims.length ? `${activeClaims.length} QR activo${activeClaims.length === 1 ? '' : 's'}` : 'Lo que reclamaste', icon: 'ticket-outline', tone: 'plain', onPress: () => router.push('/salidas') },
    firstBiz
      ? { key: 'negocio', title: 'Mi negocio', sub: firstBiz.name, icon: 'storefront-outline', tone: 'plain', onPress: () => router.push({ pathname: '/business/hub/[id]', params: { id: firstBiz.id } }) }
      : { key: 'negocio', title: '¿Tienes un negocio?', sub: 'Súmalo gratis en 2 min', icon: 'storefront-outline', tone: 'plain', onPress: () => router.push('/business/new') },
  ];

  const hasTuyo = Boolean(nextAppt) || activeClaims.length > 0 || strip.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.pad}>
          {/* Arriba: tú (no el logo), dónde estás y lo nuevo */}
          <View style={styles.topRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={firstName ? `Tu perfil, ${firstName}` : 'Tu perfil'} onPress={() => router.push('/(tabs)/profile')} style={styles.me}>
              <Avatar uri={user?.profile_picture_url} name={user?.name ?? 'Tú'} size={40} />
            </Pressable>
            <View style={styles.zone}>
              <ZoneButton lead={zone ? 'Estás viendo' : 'Estás en'} name={zoneName ?? (coords ? 'Cerca de ti' : 'Tu ciudad')} open={zonesOpen} disabled={zones.length === 0} onPress={() => setZonesOpen((v) => !v)} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={unseen.length ? `Novedades: ${unseen.length} sin ver` : 'Novedades: estás al día'} hitSlop={6} onPress={() => router.push('/novedades')} style={styles.bell}>
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

          {/* La invitación, explícita */}
          <View style={styles.greet}>
            <Text style={styles.title} accessibilityRole="header">
              Los negocios a la puerta de tu casa
            </Text>
            <Text style={styles.lead}>Entra y mira quién está abierto ahora, a pocos pasos.</Text>
          </View>

          <PuertaMapa items={mapItems} center={center} openCount={openNear.length} ticker={newsAll.slice(0, 6)} whenOf={(iso) => whenLabel(iso, now)} onExplore={openExplore} />

          <View style={styles.searchPill}>
            <Pressable accessibilityRole="search" accessibilityLabel="Busca lo que necesitas" onPress={() => ask()} style={styles.searchTap}>
              <Ionicons name="search" size={20} color={colors.ink} />
              <Text style={styles.searchText} numberOfLines={1}>
                O busca lo que necesitas
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Buscar hablando" onPress={() => ask(undefined, true)} style={styles.mic}>
              <Ionicons name="mic-outline" size={18} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        {/* Más en Empre */}
        <Text style={[styles.secTitle, styles.padText]} accessibilityRole="header">
          Más en Empre
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.masIn}>
          {mas.map((d) => (
            <Pressable key={d.key} accessibilityRole="button" accessibilityLabel={`${d.title}. ${d.sub}`} onPress={d.onPress} style={[styles.masCard, d.tone === 'night' && styles.masNight]}>
              <View style={[styles.masIcon, { backgroundColor: d.tone === 'night' ? colors.glow : d.tone === 'agenda' ? colors.agendaSoft : colors.selectedSoft }]}>
                <Ionicons name={d.icon} size={18} color={d.tone === 'night' ? colors.night : d.tone === 'agenda' ? colors.agenda : colors.ink} />
              </View>
              <View style={styles.masBody}>
                <Text style={[styles.masTitle, d.tone === 'night' && styles.onNight]} numberOfLines={2}>
                  {d.title}
                </Text>
                <Text style={[styles.masSub, d.tone === 'night' && styles.onNightSub]} numberOfLines={1}>
                  {d.sub}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.pad, styles.body]}>
          {/* Lo tuyo: solo lo que está en curso, y los negocios que sigues */}
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
                      <View style={[styles.followRing, { borderColor: w.ring === 'none' ? colors.line : colors.brand }]}>
                        <Avatar uri={w.profileUrl} name={w.name} size={56} />
                      </View>
                      <Text style={styles.followName} numberOfLines={2}>
                        {w.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </SystemSection>
          ) : null}

          {/* Al bajar: el muro de lo que ofrecen cerca */}
          {pins.length ? (
            <View style={styles.section}>
              <View>
                <Text style={styles.secTitle} accessibilityRole="header">
                  Cerca de ti, para ver
                </Text>
                <Text style={styles.secSub}>Lo que ofrecen los negocios de tu barrio. Sigue bajando.</Text>
              </View>
              <Muro pins={pins} />
            </View>
          ) : (
            <SystemSection title="Cerca de ti">
              <SystemGroup>
                <SystemRow first icon="map-outline" tag="Para empezar" title="Mira el mapa de tu barrio" sub="Cuando los negocios publiquen, aquí verás lo que ofrecen" onPress={() => router.push('/map')} />
              </SystemGroup>
            </SystemSection>
          )}
        </View>
        <BusinessCardModal entity={card} onClose={() => setCard(null)} origin="home" />
        <MarketItemSheet item={previewItem} onClose={() => setPreviewItem(null)} />
      </ScrollView>
      <EmpreAISheet visible={aiOpen} onClose={() => setAiOpen(false)} />
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
              borderRadius: grow.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  door: { position: 'absolute', zIndex: 20, backgroundColor: colors.night },
  content: { paddingBottom: 40, gap: 14 },
  pad: { paddingHorizontal: 18, gap: 14 },
  padText: { paddingHorizontal: 18 },
  body: { gap: 26, paddingTop: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  me: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zone: { flex: 1, minWidth: 0 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  bellDot: { position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.brand },
  greet: { gap: 4 },
  title: { fontSize: 30, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink, letterSpacing: -0.3 },
  lead: { fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  searchPill: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  searchTap: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchText: { flex: 1, minWidth: 0, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.faint },
  mic: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  masIn: { gap: 10, paddingHorizontal: 18 },
  masCard: { width: 150, minHeight: 120, borderRadius: 18, padding: 14, justifyContent: 'space-between', gap: 10, backgroundColor: colors.surface },
  masNight: { backgroundColor: colors.night },
  masIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  masBody: { gap: 2 },
  masTitle: { fontFamily: fonts.ui.extrabold, fontSize: 14.5, lineHeight: 18, color: colors.ink },
  masSub: { fontFamily: fonts.ui.bold, fontSize: 12, color: colors.muted },
  onNight: { color: '#FFFFFF' },
  onNightSub: { color: colors.nightText },
  section: { gap: 12 },
  secTitle: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  secSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: 2 },
  rail: { marginHorizontal: -18 },
  followIn: { gap: 16, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 4 },
  follow: { width: 72, alignItems: 'center', gap: 6 },
  followRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  followName: { fontSize: 11.5, lineHeight: 14, fontFamily: fonts.ui.bold, color: colors.ink, textAlign: 'center' },
});
