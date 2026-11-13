import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogApi } from '@/api/catalog';
import type { ServiceItem } from '@/lib/catalog';
import { novedadesApi } from '@/api/novedades';
import { discoveryApi, offersApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { useZones } from '@/components/explore/useZoneName';
import type { DoorRect } from '@/components/home/HomeDoors';
import { Muro, type MuroPin } from '@/components/home/Muro';
import { PuertaMapa } from '@/components/home/PuertaMapa';
import { MarketItemSheet } from '@/components/offers/MarketItemSheet';
import { SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { ZoneButton, ZoneList } from '@/components/ZoneButton';
import { mediaUrl } from '@/lib/image';
import { dayLabel, stripEntries } from '@/lib/novedades';
import { onFootOrDistance } from '@/lib/format';
import { mergeCatalogIntoMarket, priceView, type MarketItem } from '@/lib/offerMarket';
import { useLocation } from '@/lib/useCoords';
import { SkeletonBlock } from '@/components/Skeleton';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts } from '@/theme';

function whenLabel(iso: string, now: number): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  if (min < 24 * 60) return `Hace ${Math.floor(min / 60)} h`;
  return dayLabel(iso, now);
}

/**
 * Inicio (tablero «Inicio a la puerta»): solo dos cosas, una entrada al mapa y las novedades. Buscar, Empre AI, tus citas
 * y tus salidas viven en el mapa y en el botón Empre; aquí no se repiten. Arriba, lo nuevo de los negocios que sigues; al
 * bajar, el muro de lo que publicaron los negocios cerca. Con pocos datos cada parte se encoge o no se dibuja: nunca se
 * rellena con datos inventados.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const location = useLocation();
  const coords = location.coords;
  const { status, user } = useAuth();
  const signedIn = status === 'signedIn' && Boolean(user);
  const zones = useZones();
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [card, setCard] = useState<WithDistance | null>(null);
  const [previewItem, setPreviewItem] = useState<MarketItem | null>(null);
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

  // Cuántos negocios hay a la puerta: el número sale de lo que encontró el mapa, nunca inventado.
  const nearCount = discovery.length;

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
              {nearCount > 1 ? `${nearCount} negocios a la puerta de tu casa` : 'Los negocios a la puerta de tu casa'}
            </Text>
            <Text style={styles.lead}>Entra y mira quién está abierto ahora, a pocos pasos.</Text>
          </View>

          {location.denied && !coords && !zone ? (
            // Sin ubicación también funciona (tablero «Estados», teléfono 5): se elige el barrio y sigue igual.
            <View style={styles.where}>
              <Text style={styles.whereTitle} accessibilityRole="header">
                ¿Dónde estás?
              </Text>
              <Text style={styles.whereText}>Sin tu ubicación también funciona: elige tu barrio. Solo la usamos para buscar cerca de ti.</Text>
              <Pressable accessibilityRole="button" onPress={() => (location.settingsOnly ? void Linking.openSettings() : location.retry())} style={styles.whereBtn}>
                <Text style={styles.whereBtnText}>{location.settingsOnly ? 'Activarla en los ajustes' : 'Usar mi ubicación'}</Text>
              </Pressable>
              {zones.length ? (
                <View style={styles.whereZones}>
                  {zones.slice(0, 8).map((z) => (
                    <Pressable key={z.id} accessibilityRole="button" accessibilityLabel={`Estoy en ${z.name}`} onPress={() => setZoneId(z.id)} style={styles.whereZone}>
                      <Text style={styles.whereZoneText}>{z.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : open.isLoading && !open.data ? (
            // Cargando: la forma de lo que viene, nunca una rueda sola (tablero «Estados», teléfono 1).
            <View accessibilityLabel="Buscando negocios cerca" accessibilityLiveRegion="polite">
              <SkeletonBlock height={278} borderRadius={26} />
              <Text style={styles.loadingText}>Buscando negocios cerca…</Text>
            </View>
          ) : (
            <PuertaMapa items={mapItems} center={center} openCount={openNear.length} ticker={[]} whenOf={(iso) => whenLabel(iso, now)} onExplore={openExplore} />
          )}

          {strip.length ? (
            <View style={styles.section}>
              <Text style={styles.secTitle} accessibilityRole="header">
                Lo nuevo de los que sigues
              </Text>
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
            </View>
          ) : null}
        </View>

        <View style={[styles.pad, styles.body]}>
          {/* Al bajar: solo novedades, lo que publicaron los negocios cerca */}
          {pins.length ? (
            <View style={styles.section}>
              <View>
                <Text style={styles.secTitle} accessibilityRole="header">
                  Lo nuevo cerca
                </Text>
                <Text style={styles.secSub}>Lo que publicaron los negocios de tu barrio.</Text>
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
  content: { paddingBottom: 96, gap: 14 }, // el botón Empre flota encima: lo último no queda debajo
  pad: { paddingHorizontal: 16, gap: 14 },
  body: { gap: 26, paddingTop: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  me: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zone: { flex: 1, minWidth: 0 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  bellDot: { position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.brand },
  greet: { gap: 4 },
  where: { gap: 12, padding: 16, borderRadius: 22, backgroundColor: colors.surface },
  whereTitle: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink },
  whereText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  whereBtn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  whereBtnText: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.surface },
  whereZones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  whereZone: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  whereZoneText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  loadingText: { position: 'absolute', left: 16, bottom: 16, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  title: { fontSize: 30, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink, letterSpacing: -0.3 },
  lead: { fontSize: 15, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  section: { gap: 12 },
  secTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  secSub: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 2 },
  rail: { marginHorizontal: -16 },
  followIn: { gap: 16, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  follow: { width: 72, alignItems: 'center', gap: 6 },
  followRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  followName: { fontSize: 12, lineHeight: 15, fontFamily: fonts.ui.medium, color: colors.ink, textAlign: 'center' },
});
