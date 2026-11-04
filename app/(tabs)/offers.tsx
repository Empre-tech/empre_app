import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { categoriesApi } from '@/api/endpoints';
import { claimsApi, offersApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { ZoneButton, ZoneList } from '@/components/ZoneButton';
import { UpdatingBar } from '@/components/explore/LoadingMotion';
import { useMarkerTracking } from '@/components/explore/useMarkerTracking';
import { Reveal } from '@/components/offers/MarketMotion';
import { FeaturedOffer, OfferRow, OfferTile, TILE_GAP, TILE_W, ZONE_W, ZoneCard } from '@/components/offers/OfferTiles';
import { SkeletonBlock } from '@/components/Skeleton';
import { loadLastCity, saveLastCity } from '@/lib/lastCityStore';
import { displayIcon } from '@/lib/mapView';
import { MAP_STYLE } from '@/lib/mapStyle';
import { planHour, planKey, planLevel, planTag, planTitle, planWalk } from '@/lib/plans';
import {
  distanceLabel,
  effectiveSort,
  endText,
  flattenPages,
  pesos,
  priceView,
  listTitle,
  nearEnd,
  showZones,
  sortOptions,
  visibleSections,
  zoneFilterOrder,
  type MarketItem,
  type MarketSort,
} from '@/lib/offerMarket';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

type Coords = { latitude: number; longitude: number };

const COMPACT_AT = 72; // px bajados para pasar a la barra compacta
const MINI_H = 60; // alto de la barra compacta (la lista no queda debajo al saltar a una zona)

/**
 * Inicio de Ofertas (tablero «Inicio de Ofertas»): tu zona arriba, las ofertas en el mapa con la elegida primero en la
 * fila, categorías y, debajo, el resto de la vitrina. Nada patrocinado ni contadores.
 */
export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const reduce = useReduceMotion();
  const scrollRef = useRef<ScrollView>(null);
  const searchRef = useRef<TextInput>(null);

  const [coords, setCoords] = useState<Coords | null>(null);
  const [locAsked, setLocAsked] = useState(false);
  const [lastCity, setLastCity] = useState<string | null>(null); // null = aún leyendo el teléfono
  const [catId, setCatId] = useState<string | undefined>(); // categoría elegida en la fila con iconos
  const [term, setTerm] = useState<string | undefined>();
  const [sort, setSort] = useState<MarketSort>('near');
  const [zone, setZone] = useState<string | undefined>();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [compact, setCompact] = useState(false);
  // La zona que eligió ver: mueve el mapa y la vitrina a ese lugar. Sin elegir, donde estás.
  const [picked, setPicked] = useState<{ id: string; name: string; latitude: number; longitude: number } | null>(null);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [listY, setListY] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const { status } = useAuth();
  const claims = useQuery({ queryKey: ['claims', 'mine'], queryFn: claimsApi.mine, enabled: status === 'signedIn', retry: false, staleTime: 15_000 });
  const activeClaims = (claims.data ?? []).filter((c) => c.status === 'RECLAMADO').length;
  // Atrás del teléfono: de «Todas» vuelve a Ofertas, no se sale de la pestaña.
  useFocusEffect(
    useCallback(() => {
      if (!showAll) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setShowAll(false);
        return true;
      });
      return () => sub.remove();
    }, [showAll]),
  );

  useEffect(() => {
    void loadLastCity().then(setLastCity);
  }, []);
  // La ubicación se vuelve a leer cada vez que se entra a la pestaña: si te moviste de zona o de ciudad, la vitrina
  // cambia sola.
  const readPosition = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      // Sin ubicación: la vitrina usa la última ciudad conocida y no muestra «cerca» ni distancias.
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void readPosition();
    }, [readPosition]),
  );
  const askLocation = useCallback(async () => {
    setLocAsked(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (pos) setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      // Se queda sin ubicación.
    }
  }, []);
  // Búsqueda en el servidor, con una pausa corta para no pedir por cada letra.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });
  const category = catId;
  const center = picked ?? coords;
  const hasLoc = center !== null;
  const sortNow = effectiveSort(sort, hasLoc);
  const ready = lastCity !== null;
  const place = center ? { lat: center.latitude, long: center.longitude } : { city: lastCity || undefined };
  const placeKey = center ? `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}` : `city:${lastCity ?? ''}`;
  const key = [placeKey, category ?? 'all', term ?? ''].join('|');

  const market = useQuery({
    queryKey: ['offers-market', key],
    queryFn: () => offersApi.market({ ...place, category, term }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled: ready,
  });
  const data = market.data;
  const city = data?.city ?? '';
  // Zona elegida para la lista; si ya no es de esta ciudad (te moviste), no filtra.
  const zoneId = zone && (!data || data.zones.some((z) => z.id === zone)) ? zone : undefined;

  const all = useInfiniteQuery({
    queryKey: ['offers-market-all', placeKey, category ?? 'all', zoneId ?? '', q, sortNow],
    queryFn: ({ pageParam }) => offersApi.marketAll({ ...place, category, zone: zoneId, q: q || undefined, sort: sortNow, cursor: pageParam || undefined }),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor || undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled: ready,
  });
  const items = useMemo(() => flattenPages(all.data?.pages), [all.data?.pages]);

  // La ciudad que puso la ubicación queda guardada en el teléfono para cuando no haya ubicación.
  const saved = useRef('');
  useEffect(() => {
    if (coords && !picked && city && city !== saved.current && city !== lastCity) {
      saved.current = city;
      void saveLastCity(city);
    }
  }, [coords, picked, city, lastCity]);
  // El lector de pantalla se entera cuando cambias de zona o de ciudad (la primera vez no: ya lo lee el título).
  const place1 = data ? `${city}|${data.zone}` : '';
  const prevPlace = useRef('');
  useEffect(() => {
    if (!place1) return;
    if (prevPlace.current && prevPlace.current !== place1) {
      AccessibilityInfo.announceForAccessibility(data?.zone ? `Ahora en ${data.zone}, ${city}` : `Ofertas en ${city || 'todas las ciudades'}`);
    }
    prevPlace.current = place1;
  }, [place1, data?.zone, city]);

  const open = useCallback(
    (o: MarketItem) =>
      o.kind === 'service'
        ? router.push({ pathname: '/business/[id]', params: { id: o.entity_id } })
        : router.push({ pathname: '/offer/[id]', params: { id: o.id, entityId: o.entity_id } }),
    [router],
  );
  // Las ofertas del mapa: las cercanas con ubicación; la del pin elegido va primera en la fila.
  const onMap = useMemo(() => (data?.near ?? []).filter((o) => o.kind !== 'service' && o.latitude && o.longitude).slice(0, 12), [data?.near]);
  const ordered = useMemo(() => {
    const first = onMap.find((o) => o.id === pin) ?? onMap[0];
    return first ? [first, ...onMap.filter((o) => o.id !== first.id)] : [];
  }, [onMap, pin]);
  const mapCenter = center ?? (ordered[0] ? { latitude: ordered[0].latitude!, longitude: ordered[0].longitude! } : null);
  const sections = q ? [] : visibleSections(data);
  // Sin ubicaciones en el mapa, la fila igual muestra lo que hay.
  const railItems = ordered.length ? ordered : (data?.near ?? []).filter((o) => o.kind !== 'service').slice(0, 12);
  const zonesOn = !q && showZones(data);
  const zoneName = data?.zones.find((z) => z.id === zoneId)?.name;
  const zoneLabel = picked?.name ?? (data?.zone || (coords ? 'Cerca de ti' : city || 'Tu ciudad'));
  const zoneTitle = picked ? `Ofertas en ${picked.name}` : coords ? 'Ofertas a pasos de ti' : city ? `Ofertas en ${city}` : 'Ofertas';

  // Barra compacta: aparece al bajar (por umbral, no con cada píxel).
  const [bar] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      bar.setValue(compact ? 1 : 0);
      return;
    }
    const a = Animated.timing(bar, { toValue: compact ? 1 : 0, duration: 220, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [compact, reduce, bar]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const n = e.nativeEvent;
    const c = n.contentOffset.y > COMPACT_AT;
    if (c !== compact) setCompact(c);
    if (nearEnd(n) && all.hasNextPage && !all.isFetchingNextPage) void all.fetchNextPage();
  };
  const goToList = (id: string | undefined) => {
    setZone(id);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, listY - MINI_H - 4), animated: !reduce }), reduce ? 0 : 160);
  };

  const rail = (list: MarketItem[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} snapToInterval={TILE_W + TILE_GAP} decelerationRate="fast" snapToAlignment="start">
      {list.map((o, i) => (
        <Reveal key={o.id} delay={80 + Math.min(i, 5) * 50} distance={6} duration={280}>
          <OfferTile item={o} now={now} onPress={() => open(o)} />
        </Reveal>
      ))}
    </ScrollView>
  );
  const header = (title: string, why: string) => (
    <View style={styles.sh}>
      <Text style={styles.shTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.shWhy}>{why}</Text>
    </View>
  );
  const inCity = city ? ` en ${city}` : '';

  // Lo que el lienzo muestra al entrar; «Ver todas» y la lupa abren el resto de la vitrina.
  const home = !showAll;
  const closeAll = () => {
    setShowAll(false);
    setText('');
    setZone(undefined);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const openAll = (focus: boolean) => {
    setShowAll(true);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (focus) setTimeout(() => searchRef.current?.focus(), 120);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {(market.isFetching && data) || (all.isFetching && !all.isFetchingNextPage && all.data) ? <UpdatingBar /> : null}
      <Animated.View
        pointerEvents={compact ? 'auto' : 'none'}
        aria-hidden={!compact}
        style={[styles.mini, { top: insets.top, opacity: bar, transform: [{ translateY: bar.interpolate({ inputRange: [0, 1], outputRange: [-MINI_H, 0] }) }] }]}
      >
        <EmpreSymbol size={22} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Zona: ${zoneLabel}. Volver arriba para cambiarla`} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: !reduce })} style={styles.miniTap}>
          <Text style={styles.miniCity} numberOfLines={1}>
            {zoneLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Buscar ofertas" onPress={() => openAll(true)} style={styles.miniBtn}>
          <Ionicons name="search" size={20} color={colors.ink} />
        </Pressable>
      </Animated.View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onScroll={onScroll} scrollEventThrottle={64}>
        <Svg pointerEvents="none" width="100%" height={300} style={styles.wash}>
          <Defs>
            <LinearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.selectedSoft} />
              <Stop offset="1" stopColor={colors.bg} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height={300} fill="url(#wash)" />
        </Svg>
        <View style={styles.top}>
          {home ? <EmpreSymbol size={26} /> : (
            <Pressable accessibilityRole="button" accessibilityLabel="Volver a Ofertas" onPress={closeAll} style={styles.round}>
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
          )}
          <ZoneButton lead={picked ? 'Estás viendo' : 'Estás en'} name={zoneLabel} open={zonesOpen} disabled={!data?.zones.length} onPress={() => setZonesOpen((v) => !v)} />
          {home ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Buscar ofertas" onPress={() => openAll(true)} style={styles.round}>
              <Ionicons name="search" size={20} color={colors.ink} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Mis salidas${activeClaims ? `: ${activeClaims} por usar` : ''}`} onPress={() => router.push('/salidas')} style={styles.round}>
            <Ionicons name="ticket-outline" size={20} color={colors.ink} style={{ transform: [{ rotate: '45deg' }] }} />
            {activeClaims ? <View style={styles.roundDot} /> : null}
          </Pressable>
        </View>
        {zonesOpen ? (
          <View style={styles.zoneWrap}>
            <ZoneList
              options={[...(coords ? [{ id: '', name: 'Cerca de ti', where: 'aquí' }] : []), ...(data?.zones ?? []).map((z) => ({ id: z.id, name: z.name, where: z.here ? 'aquí' : z.distance_meters ? `a ${distanceLabel(z.distance_meters)}` : null }))]}
              selected={picked?.id ?? (coords ? '' : null)}
              onPick={(o) => {
                const z = data?.zones.find((x) => x.id === o.id);
                if (!z) setPicked(null);
                else if (z.latitude && z.longitude) setPicked({ id: z.id, name: z.name, latitude: z.latitude, longitude: z.longitude });
                else goToList(z.id);
                setPin(null);
                setZonesOpen(false);
              }}
            />
          </View>
        ) : null}

        <View style={styles.heroRow}>
          <Text style={styles.hero} accessibilityRole="header">
            {home ? zoneTitle : 'Todas las ofertas'}
          </Text>
          {home && railItems.length > 0 ? (
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>{railItems.length === 1 ? '1 activa' : `${railItems.length} activas`}</Text>
            </View>
          ) : null}
        </View>

        {home && mapCenter && ordered.length ? (
          <View style={styles.mapCard}>
            <MapView
              key={`${mapCenter.latitude.toFixed(3)},${mapCenter.longitude.toFixed(3)}`}
              style={StyleSheet.absoluteFill}
              initialRegion={{ latitude: mapCenter.latitude, longitude: mapCenter.longitude, latitudeDelta: 0.014, longitudeDelta: 0.014 }}
              showsUserLocation={Boolean(coords) && !picked}
              showsPointsOfInterests={false}
              customMapStyle={MAP_STYLE}
              toolbarEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              {ordered.map((o) => {
                const on = o.id === ordered[0].id;
                return <OfferMapPin key={o.id} item={o} selected={on} onPress={() => setPin(o.id)} />;
              })}
            </MapView>
            <View style={styles.mapZone} pointerEvents="none">
              <View style={styles.mapZoneDot} />
              <Text style={styles.mapZoneText} numberOfLines={1}>
                {zoneLabel}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/map')} style={styles.mapBtn}>
              <Ionicons name="expand-outline" size={14} color={colors.ink} />
              <Text style={styles.mapBtnText}>Abrir mapa</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} accessibilityLabel="Categorías">
          <Chip label="Todas" active={!catId} onPress={() => setCatId(undefined)} />
          {(categories.data ?? []).map((c) => (
            <Chip key={c.id} label={c.name} icon={c.icon} active={catId === c.id} onPress={() => setCatId(catId === c.id ? undefined : c.id)} />
          ))}
        </ScrollView>

        {!showAll && !hasLoc && ready ? (
          <View style={styles.loc}>
            <Text style={styles.locText}>{locAsked ? 'Sin permiso de ubicación no podemos decir qué está cerca.' : city ? 'Con tu ubicación te mostramos primero lo que está cerca.' : 'Con tu ubicación te mostramos las ofertas de tu ciudad.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => void askLocation()} style={styles.locBtn}>
              <Text style={styles.locBtnText}>Activar</Text>
            </Pressable>
          </View>
        ) : null}

        {home ? (
          <View style={styles.sec}>
            <View style={styles.railHead}>
              <Text style={styles.shTitle} accessibilityRole="header">
                {ordered.length && zoneLabel ? (zoneLabel === 'Cerca de ti' ? 'Cerca de ti, ahora' : `En ${zoneLabel}, ahora`) : city ? `En ${city}, ahora` : 'Ahora'}
              </Text>
              <Pressable accessibilityRole="link" onPress={() => openAll(false)} style={styles.seeAll}>
                <Text style={styles.seeAllText}>Ver todas</Text>
              </Pressable>
            </View>
            {!data && (market.isLoading || !ready) ? (
              <View style={styles.rail}>
                {[0, 1].map((i) => (
                  <SkeletonBlock key={i} width={TILE_W} height={280} borderRadius={20} />
                ))}
              </View>
            ) : null}
            {data && !railItems.length ? <Text style={styles.none}>{`Hoy no hay ofertas aquí${catId ? ' en esta categoría' : ''}. Prueba otra zona o mira todas.`}</Text> : null}
            {railItems.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} snapToInterval={TILE_W + TILE_GAP} decelerationRate="fast" snapToAlignment="start">
                {railItems.map((o, i) => (
                  <Reveal key={o.id} delay={80 + Math.min(i, 5) * 50} distance={6} duration={280}>
                    <OfferTile item={o} now={now} selected={i === 0 && ordered.length > 0} onPress={() => open(o)} />
                  </Reveal>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {home && data?.routes.length ? (
          <View style={styles.sec}>
            <View style={styles.sh}>
              <Text style={styles.shTitle} accessibilityRole="header">
                Planes para hoy
              </Text>
              <Text style={styles.shWhy}>Negocios distintos, un mismo recorrido</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} snapToInterval={272 + TILE_GAP} decelerationRate="fast" snapToAlignment="start">
              {data.routes.map((r) => (
                <Pressable
                  key={planKey(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${planTitle(r, city)}. ${planLevel(r.level)}, ${r.stops.length} paradas.${r.saving > 0 ? ` Ahorras ${pesos(r.saving)}.` : ''}`}
                  onPress={() => router.push({ pathname: '/plan', params: { plan: JSON.stringify(r), city } })}
                  style={({ pressed }) => [styles.planCard, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.planTop}>
                    <Text style={styles.planTag} numberOfLines={1}>
                      {planTag(r, city)}
                    </Text>
                    <Text style={styles.planLevel} numberOfLines={1}>
                      {planWalk(r)}
                    </Text>
                  </View>
                  <Text style={styles.planTitle} numberOfLines={2}>
                    {planTitle(r, city)}
                  </Text>
                  <View style={styles.planStops}>
                    <View style={styles.planLine} />
                    {r.stops.slice(0, 3).map((s, i) => (
                      <View key={s.id} style={styles.planStop}>
                        <View style={styles.planDot}>
                          <Ionicons name={displayIcon(s.category_icon) as keyof typeof Ionicons.glyphMap} size={15} color={colors.ink} />
                        </View>
                        {r.times[i] ? <Text style={styles.planTime}>{planHour(r.times[i]!)}</Text> : null}
                        <Text style={styles.planBiz} numberOfLines={1}>
                          {s.entity_name}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.planFoot}>
                    <Text style={styles.planSaving}>{r.saving > 0 ? <>Ahorras <Text style={{ color: colors.accentInk }}>{pesos(r.saving)}</Text></> : `${r.stops.length} paradas`}</Text>
                    <View style={styles.planGo}>
                      <Ionicons name="arrow-forward" size={18} color={colors.ink} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {showAll ? (
          <>
            <View style={styles.searchWrap}>
              <View style={styles.search}>
                <Ionicons name="search" size={18} color={colors.muted} />
                <TextInput ref={searchRef} value={text} onChangeText={setText} placeholder={city ? `Busca en ${city}` : 'Busca una oferta o un negocio'} placeholderTextColor={colors.muted} style={styles.searchInput} accessibilityLabel="Buscar en las ofertas" returnKeyType="search" />
                {text ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setText('')} hitSlop={10}>
                    <Ionicons name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {data?.featured && !q ? (
              <Reveal key={`featured|${key}|${data.featured.id}`} style={styles.sec}>
                <FeaturedOffer item={data.featured} now={now} onPress={() => open(data.featured!)} />
              </Reveal>
            ) : null}

            {data
              ? sections.map((s, i) => (
                  // La llave cambia con el lugar, el filtro o el término: lo nuevo vuelve a entrar con su cascada.
                  <Reveal key={`${s}|${key}`} delay={Math.min(i, 3) * 70} style={styles.sec}>
                    {s === 'near' ? (
                      <>
                        {header('Cerca de ti', 'A menos de 3 km, la más cercana primero')}
                        {rail(data.near)}
                      </>
                    ) : s === 'searched' ? (
                      <>
                        {header('Lo más buscado', `Lo que la gente busca esta semana${city ? ` en ${city}` : ' en Empre'}`)}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                          {data.searched.terms.map((t) => (
                            <Chip key={t.term} label={t.label} active={data.searched.term === t.term} soft onPress={() => setTerm(t.term)} />
                          ))}
                        </ScrollView>
                        {data.searched.items.length ? rail(data.searched.items) : <Text style={styles.none}>Ahora no hay ofertas para esto. Si sigues negocios, te enteras cuando publiquen.</Text>}
                      </>
                    ) : s === 'trending' ? (
                      <>
                        {header('Tendencia', `Las que más se están reclamando${inCity}, últimas 48 h`)}
                        {rail(data.trending)}
                      </>
                    ) : (
                      <>
                        {header(data.for_you.top_rated ? `Mejor valoradas${city ? ` de ${city}` : ''}` : 'Recomendado para ti', data.for_you.top_rated ? 'Según las reseñas de quienes fueron' : 'Según lo que sigues y reclamas')}
                        {rail(data.for_you.items)}
                      </>
                    )}
                  </Reveal>
                ))
              : null}

            {data && zonesOn ? (
              <Reveal key={`zones|${key}`} delay={Math.min(sections.length, 3) * 70} style={styles.sec}>
                {header('Por zona', `Explora otras partes de ${city}`)}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} snapToInterval={ZONE_W + TILE_GAP} decelerationRate="fast" snapToAlignment="start">
                  {data.zones.map((z, i) => (
                    <Reveal key={z.id} delay={80 + Math.min(i, 5) * 50} distance={6} duration={280}>
                      <ZoneCard zone={z} onPress={() => goToList(z.id)} />
                    </Reveal>
                  ))}
                </ScrollView>
              </Reveal>
            ) : null}

            {data || all.data ? (
              <View onLayout={(e) => setListY(e.nativeEvent.layout.y)}>
                <Reveal key={`all|${key}|${q ? 'q' : ''}`} delay={Math.min(sections.length + (zonesOn ? 1 : 0), 3) * 70} style={styles.sec}>
                  {header(q ? 'Resultados' : listTitle(city, zoneName), q ? `Con «${q}»${zoneName ? ` en ${zoneName}` : inCity}` : hasLoc ? 'Vigentes ahora, la más cercana primero' : 'Vigentes ahora')}
                  {data && data.zones.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                      <Chip label={city ? `Toda ${city}` : 'Todas las zonas'} active={!zoneId} soft onPress={() => setZone(undefined)} />
                      {zoneFilterOrder(data.zones).map((z) => (
                        <Chip key={z.id} label={z.name} active={zoneId === z.id} soft onPress={() => setZone(zoneId === z.id ? undefined : z.id)} />
                      ))}
                    </ScrollView>
                  ) : null}
                  {!q ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                      {sortOptions(hasLoc).map((o) => (
                        <Chip key={o.key} label={o.label} active={sortNow === o.key} onPress={() => setSort(o.key)} />
                      ))}
                    </ScrollView>
                  ) : null}
                  <View style={styles.list}>
                    {items.map((o, i) => (
                      // Solo la primera tanda entra en cascada; las siguientes aparecen al llegar, sin esperar.
                      <Reveal key={o.id} delay={i < 20 ? 60 + Math.min(i, 6) * 40 : 0} distance={6} duration={260}>
                        <OfferRow item={o} now={now} onPress={() => open(o)} />
                      </Reveal>
                    ))}
                    {all.isFetchingNextPage || (all.isLoading && !all.data) ? [0, 1].map((i) => <SkeletonBlock key={`sk${i}`} height={98} borderRadius={radius.lg} />) : null}
                    {all.data && !all.hasNextPage && items.length > 0 ? <Text style={styles.end}>{endText(city, zoneName)}</Text> : null}
                    {all.data && items.length === 0 && !all.isFetching ? <EmptyOffers searching={Boolean(q || zoneId)} /> : null}
                    {all.isError && all.data ? (
                      <View style={styles.empty}>
                        <Text style={styles.emptyText}>No pudimos cargar más ofertas.</Text>
                        <Button title="Reintentar" variant="secondary" onPress={() => void all.fetchNextPage()} />
                      </View>
                    ) : null}
                  </View>
                </Reveal>
              </View>
            ) : null}
          </>
        ) : null}

        {market.isError && !data ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No pudimos cargar las ofertas</Text>
            <Button
              title="Reintentar"
              variant="secondary"
              onPress={() => {
                void market.refetch();
                void all.refetch();
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Pin de oferta en el mini-mapa con rastreo reactivo (`useMarkerTracking`) para evitar que Android
 * congele un círculo gigante vacío en el primer fotograma. Muestra icono + ahorro en cápsula.
 */
function OfferMapPin({ item, selected, onPress }: { item: MarketItem; selected: boolean; onPress: () => void }) {
  const save = priceView(item).save;
  const look = `${item.id}|${selected ? 'on' : 'off'}|${save ?? ''}`;
  const { tracking, onLayout, markerRef } = useMarkerTracking(look);

  return (
    <Marker
      ref={markerRef}
      coordinate={{ latitude: item.latitude!, longitude: item.longitude! }}
      accessibilityLabel={`${item.entity_name}: ${item.title}${selected ? ', elegida' : ''}`}
      onPress={onPress}
      tracksViewChanges={tracking}
      zIndex={selected ? 10 : 1}
    >
      <View onLayout={onLayout} collapsable={false} style={styles.pinWrap}>
        <View style={[styles.pinPill, selected && styles.pinPillOn]}>
          <View style={[styles.pinIconBubble, selected && styles.pinIconBubbleOn]}>
            <Ionicons name={displayIcon(item.category_icon) as keyof typeof Ionicons.glyphMap} size={13} color={selected ? colors.ink : '#8F4300'} />
          </View>
          {save ? (
            <Text style={[styles.pinSaveText, selected && styles.pinSaveTextOn]} numberOfLines={1}>
              {save}
            </Text>
          ) : null}
        </View>
        <View style={[styles.pinTip, selected && styles.pinTipOn]} />
      </View>
    </Marker>
  );
}

function Chip({ label, icon, active, onPress, soft }: { label: string; icon?: string; active: boolean; onPress: () => void; soft?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && (soft ? styles.chipSoftOn : styles.chipOn), pressed && styles.chipPressed]}
    >
      {active && !soft ? <View style={styles.chipActiveDot} /> : null}
      {icon && !active ? <Ionicons name={displayIcon(icon) as keyof typeof Ionicons.glyphMap} size={15} color={colors.muted} /> : null}
      <Text style={[styles.chipText, active && (soft ? styles.chipSoftText : styles.chipOnText)]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyOffers({ searching }: { searching: boolean }) {
  const router = useRouter();
  return (
    <View style={styles.empty}>
      <Ionicons name="pricetag-outline" size={36} color={colors.muted} />
      <Text style={styles.emptyTitle}>{searching ? 'Nada con esa búsqueda' : 'Aún no hay ofertas aquí'}</Text>
      <Text style={styles.emptyText}>{searching ? 'Prueba con otra palabra, otra zona o quita el filtro.' : 'Explora el mapa para ver negocios cerca.'}</Text>
      {searching ? null : <Button title="Ver en el mapa" variant="secondary" onPress={() => router.push('/map')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { gap: 16, paddingBottom: 24 },
  wash: { position: 'absolute', left: 0, right: 0, top: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  roundDot: { position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.surface },
  zoneWrap: { marginHorizontal: 20, marginTop: -8 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20 },
  hero: { flex: 1, fontSize: 28, lineHeight: 32, letterSpacing: -0.3, fontFamily: fonts.display.bold, color: colors.ink },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: '#FFF1E3' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  livePillText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#8F4300' },
  mapCard: { height: 200, marginHorizontal: 20, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.selectedSoft, borderWidth: 1, borderColor: colors.line },
  mapBtn: { position: 'absolute', right: 10, top: 10, minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  mapBtnText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  mapZone: { position: 'absolute', left: 12, bottom: 12, maxWidth: '70%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  mapZoneDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.verified },
  mapZoneText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  pinWrap: { alignItems: 'center', paddingBottom: 4 },
  pinPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 4, paddingRight: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.accent, shadowColor: colors.ink, shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  pinPillOn: { backgroundColor: colors.ink, borderColor: '#fff', shadowOpacity: 0.28, elevation: 5 },
  pinIconBubble: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1E3' },
  pinIconBubbleOn: { backgroundColor: colors.accent },
  pinSaveText: { fontSize: 12, fontFamily: fonts.display.bold, color: colors.ink },
  pinSaveTextOn: { color: '#fff' },
  pinTip: { width: 8, height: 8, marginTop: -4, backgroundColor: colors.accent, transform: [{ rotate: '45deg' }] },
  pinTipOn: { backgroundColor: colors.ink },
  searchWrap: { paddingHorizontal: 20 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 52, paddingHorizontal: spacing.lg, borderRadius: 26, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...softShadow },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink, paddingVertical: 0 },
  mini: { position: 'absolute', left: 0, right: 0, zIndex: 5, height: MINI_H, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 20, paddingRight: 12, backgroundColor: 'rgba(255,255,255,0.94)', borderBottomWidth: 1, borderBottomColor: colors.hairline },
  miniTap: { flex: 1, minHeight: 44, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniCity: { flexShrink: 1, fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  miniBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cats: { gap: 8, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 4 },
  terms: { gap: 6, paddingHorizontal: 20, paddingBottom: spacing.sm },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.selectedSoft, borderColor: colors.selected, borderWidth: 1.5 },
  chipSoftOn: { backgroundColor: colors.selectedSoft, borderColor: colors.selected, borderWidth: 1.5 },
  chipPressed: { transform: [{ scale: 0.97 }] },
  chipActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  chipText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  chipOnText: { color: colors.selected },
  chipSoftText: { color: colors.selected },
  loc: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: 20, padding: spacing.md, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  locText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.muted },
  locBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center' },
  locBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
  sec: { gap: 8 },
  railHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20 },
  seeAll: { minHeight: 44, justifyContent: 'center' },
  seeAllText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  sh: { paddingHorizontal: 20, gap: 2 },
  shTitle: { flexShrink: 1, fontSize: 21, lineHeight: 26, fontFamily: fonts.display.bold, color: colors.ink },
  shWhy: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  rail: { flexDirection: 'row', gap: TILE_GAP, paddingHorizontal: 20, paddingTop: 3, paddingBottom: 12 },
  planCard: { width: 272, gap: 12, padding: 18, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, ...softShadow },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  planTag: { flexShrink: 1, fontSize: 12, letterSpacing: 0.9, fontFamily: fonts.ui.extrabold, color: colors.faint },
  planLevel: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.verified },
  planTitle: { fontSize: 22, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  planStops: { flexDirection: 'row', alignItems: 'flex-start' },
  planLine: { position: 'absolute', left: 20, right: 20, top: 15, borderTopWidth: 1.5, borderStyle: 'dashed', borderTopColor: colors.line },
  planStop: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5 },
  planDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.accent },
  planTime: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  planBiz: { maxWidth: 78, fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  planFoot: { marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planSaving: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  planGo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  none: { marginHorizontal: 20, padding: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, fontSize: 14.5, lineHeight: 21, fontFamily: fonts.ui.medium, color: colors.muted },
  list: { paddingHorizontal: 20, gap: spacing.sm },
  end: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center', paddingVertical: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
