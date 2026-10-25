import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { categoriesApi } from '@/api/endpoints';
import { claimsApi, offersApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { UpdatingBar } from '@/components/explore/LoadingMotion';
import { BarrioBand, SavedCard } from '@/components/offers/barrio/BarrioBand';
import { GroupCards, RoutesRail, VoicesRail } from '@/components/offers/barrio/BarrioRails';
import { Bento } from '@/components/offers/barrio/Bento';
import { NeighborsRow } from '@/components/offers/barrio/Neighbors';
import { OfferSheet } from '@/components/offers/barrio/OfferSheet';
import { RouteView } from '@/components/offers/barrio/RouteView';
import { Reveal } from '@/components/offers/MarketMotion';
import { OfferRow, OfferTile, TILE_GAP, TILE_W, ZONE_W, ZoneCard } from '@/components/offers/OfferTiles';
import { SkeletonBlock } from '@/components/Skeleton';
import { buildGroups, categoryFilter, groupOfName, type GroupId } from '@/lib/categoryGroups';
import { effectiveClaimStatus } from '@/lib/claims';
import { loadLastCity, saveLastCity } from '@/lib/lastCityStore';
import { bandHook, bestByGroup, trustDistances, type MarketRoute } from '@/lib/offerBarrio';
import { effectiveSort, endText, flattenPages, listTitle, nearEnd, showZones, sortOptions, visibleSections, zoneFilterOrder, type MarketItem, type MarketResponse, type MarketSort } from '@/lib/offerMarket';
import { useNow } from '@/lib/useNow';
import { usePullRefresh } from '@/lib/usePullRefresh';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';

type Coords = { latitude: number; longitude: number };

const COMPACT_AT = 140; // px bajados para pasar a la barra compacta (la franja es más alta que el título de antes)
const MINI_H = 52; // alto de la barra compacta (la lista no queda debajo al saltar a una zona)

// Lejos de toda ciudad de Empre, las distancias no dicen nada: se quitan (auditoría 3.48, P1).
const noDistance = (o: MarketItem): MarketItem => (o.distance_meters === null ? o : { ...o, distance_meters: null });
function withoutDistances(r: MarketResponse): MarketResponse {
  const m = (l: MarketItem[]) => l.map(noDistance);
  return {
    ...r,
    zones: r.zones.map((z) => ({ ...z, distance_meters: null })),
    featured: r.featured ? noDistance(r.featured) : null,
    near: [],
    searched: { ...r.searched, items: m(r.searched.items) },
    trending: m(r.trending),
    for_you: { ...r.for_you, items: m(r.for_you.items) },
    spotlight: r.spotlight.map((s) => ({ ...s, item: noDistance(s.item) })),
    bento: m(r.bento),
    routes: [], // una ruta a pie no tiene sentido sin saber dónde estás
    neighbors: r.neighbors.map((n) => ({ ...n, item: noDistance(n.item) })),
    voices: r.voices.map((v) => ({ ...v, item: noDistance(v.item) })),
  };
}

/**
 * Pestaña Ofertas: el barrio (3.48, mockup ofertas_donde_buscar.html versión 4), sobre la vitrina de la ciudad de 3.38
 * a 3.40. Arriba la franja de tu barrio con el titular, el buscador y «Tus vecinos hoy»; «Este mes ahorraste»; el
 * mosaico «Hoy en tu barrio» (un tipo de negocio por pieza, con la pasarela en la grande); «Rutas del barrio»; «A pocas
 * cuadras»; «Lo recomiendan tus vecinos»; «¿Qué se te antoja?»; las secciones de siempre; los barrios y todas las de
 * la ciudad por tandas. Nada patrocinado ni contadores. El reclamo no cambia: la tarjeta abre el perfil en esa oferta.
 */
export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const reduce = useReduceMotion();
  const { status } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const searchRef = useRef<TextInput>(null);

  const [coords, setCoords] = useState<Coords | null>(null);
  const [locAsked, setLocAsked] = useState(false);
  const [lastCity, setLastCity] = useState<string | null>(null); // null = aún leyendo el teléfono
  const [group, setGroup] = useState<GroupId | undefined>(); // «¿Qué se te antoja?»
  const [term, setTerm] = useState<string | undefined>();
  const [sort, setSort] = useState<MarketSort>('near');
  const [zone, setZone] = useState<string | undefined>();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [compact, setCompact] = useState(false);
  const [listY, setListY] = useState(0);
  const [zonesY, setZonesY] = useState(0);
  const [sheet, setSheet] = useState<MarketItem | null>(null); // la hoja de la oferta abierta
  const [routeOpen, setRouteOpen] = useState<MarketRoute | null>(null); // «Ver la ruta» (3.49)

  useEffect(() => {
    void loadLastCity().then(setLastCity);
  }, []);
  // La ubicación se vuelve a leer cada vez que se entra a la pestaña: si te moviste de zona o de ciudad, la vitrina
  // cambia sola.
  const readPosition = useCallback(async () => {
    try {
      const { status: perm } = await Location.getForegroundPermissionsAsync();
      if (perm !== 'granted') return;
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
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') return;
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
  const groups = useMemo(() => buildGroups(categories.data ?? []), [categories.data]);
  const category = categoryFilter(group, undefined, groups);
  const hasLoc = coords !== null;
  const sortNow = effectiveSort(sort, hasLoc);
  const ready = lastCity !== null;
  const place = coords ? { lat: coords.latitude, long: coords.longitude } : { city: lastCity || undefined };
  const placeKey = coords ? `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}` : `city:${lastCity ?? ''}`;
  const key = [placeKey, category ?? 'all', term ?? ''].join('|');

  const market = useQuery({
    queryKey: ['offers-market', key],
    queryFn: () => offersApi.market({ ...place, category, term }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled: ready,
  });
  const savings = useQuery({ queryKey: ['offers-savings'], queryFn: offersApi.savings, staleTime: 60_000, enabled: status === 'signedIn' });
  // Punto en «Mis boletos» mientras tengas un QR sin usar (la misma lista de reclamos de la pantalla del reclamo).
  const mine = useQuery({ queryKey: ['claims', 'mine'], queryFn: claimsApi.mine, enabled: status === 'signedIn', retry: false, staleTime: 15_000 });
  const activeTicket = (mine.data ?? []).some((c) => effectiveClaimStatus(c, now) === 'RECLAMADO');
  const raw = market.data;
  const city = raw?.city ?? '';
  const trust = trustDistances(hasLoc, city);
  const data = useMemo(() => (raw && !trust ? withoutDistances(raw) : raw), [raw, trust]);
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
  const items = useMemo(() => {
    const l = flattenPages(all.data?.pages);
    return trust ? l : l.map(noDistance);
  }, [all.data?.pages, trust]);
  // Tirar para actualizar: la vitrina, la lista completa y tu ahorro a la vez.
  const pull = usePullRefresh(useCallback(() => Promise.all([market.refetch(), all.refetch(), status === 'signedIn' ? savings.refetch() : null]), [market, all, savings, status]));

  // La ciudad que puso la ubicación queda guardada en el teléfono para cuando no haya ubicación.
  const saved = useRef('');
  useEffect(() => {
    if (hasLoc && city && city !== saved.current && city !== lastCity) {
      saved.current = city;
      void saveLastCity(city);
    }
  }, [hasLoc, city, lastCity]);
  // El lector de pantalla se entera cuando cambias de zona o de ciudad (la primera vez no: ya lo lee la franja).
  const place1 = data ? `${city}|${data.zone}` : '';
  const prevPlace = useRef('');
  useEffect(() => {
    if (!place1) return;
    if (prevPlace.current && prevPlace.current !== place1) {
      AccessibilityInfo.announceForAccessibility(data?.zone ? `Ahora en ${data.zone}, ${city}` : `Ofertas en ${city || 'todas las ciudades'}`);
    }
    prevPlace.current = place1;
  }, [place1, data?.zone, city]);

  // Toda tarjeta abre la hoja de la oferta (3.48); el perfil queda a un toque en la fila del negocio.
  const open = (o: MarketItem) => setSheet(o);
  // Salir de la hoja: primero se cierra y luego se navega (en Android, navegar mientras un Modal se cierra puede
  // dejar la pantalla nueva sin aparecer).
  const leaveSheet = (go: () => void) => {
    setSheet(null);
    setTimeout(go, 350);
  };
  // De «Ver la ruta» a una oferta o a otra pantalla: igual, primero se cierra la ruta.
  const leaveRoute = (go: () => void) => {
    setRouteOpen(null);
    setTimeout(go, 350);
  };
  const business = (o: MarketItem) => leaveSheet(() => router.push({ pathname: '/business/[id]', params: { id: o.entity_id, offer: o.id, src: 'offers' } }));
  const chat = useCallback((o: MarketItem) => router.push({ pathname: '/chat/[entityId]', params: { entityId: o.entity_id, name: o.entity_name, avatar: o.profile_photo } }), [router]);
  const tickets = useCallback(() => router.push('/claims'), [router]);
  const sections = q ? [] : visibleSections(data);
  const zonesOn = !q && showZones(data);
  const zoneName = data?.zones.find((z) => z.id === zoneId)?.name;
  const inCity = city ? ` en ${city}` : '';
  // Todo lo que se ve arriba (para el titular y el «Hasta −X %» de cada grupo).
  const visible = useMemo(
    () => (data ? [...data.spotlight.map((s) => s.item), ...data.bento, ...data.near, ...data.trending, ...data.for_you.items, ...data.searched.items, ...items] : []),
    [data, items],
  );
  const hook = bandHook(visible);
  const best = useMemo(() => bestByGroup(visible, groupOfName), [visible]);
  // Al cambiar de zona o de orden, la lista vieja se atenúa y llegan esqueletos: nunca se mezclan sin aviso.
  const listStale = all.isPlaceholderData && all.isFetching;

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
  const scrollTo = (y: number) => setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - MINI_H - 4), animated: !reduce }), reduce ? 0 : 160);
  const goToList = (id: string | undefined) => {
    setZone(id);
    scrollTo(listY);
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

  const search = (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        ref={searchRef}
        value={text}
        onChangeText={setText}
        placeholder={data?.zone ? 'Busca un negocio del barrio' : city ? `Busca en ${city}` : 'Busca una oferta o un negocio'}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        accessibilityLabel="Buscar en las ofertas"
        returnKeyType="search"
      />
      {text ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setText('')} hitSlop={10}>
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {(market.isFetching && data) || (all.isFetching && !all.isFetchingNextPage && all.data) ? <UpdatingBar /> : null}
      <Animated.View
        pointerEvents={compact ? 'auto' : 'none'}
        aria-hidden={!compact}
        style={[styles.mini, { paddingTop: insets.top, height: MINI_H + insets.top, opacity: bar, transform: [{ translateY: bar.interpolate({ inputRange: [0, 1], outputRange: [-MINI_H - insets.top, 0] }) }] }]}
      >
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.miniCity} numberOfLines={1}>
          {data?.zone || city || 'Ofertas'}
        </Text>
        {data?.zone && city ? (
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.miniZone} numberOfLines={1}>
            · {city}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buscar ofertas"
          onPress={() => {
            scrollRef.current?.scrollTo({ y: 0, animated: !reduce });
            setTimeout(() => searchRef.current?.focus(), reduce ? 0 : 250);
          }}
          style={styles.miniBtn}
        >
          <Ionicons name="search" size={20} color={colors.ink} />
        </Pressable>
      </Animated.View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={64}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={colors.white} colors={[colors.primary]} progressViewOffset={insets.top} />}
      >
        <View style={{ paddingTop: insets.top }} />
        <BarrioBand city={city} zone={hasLoc ? (data?.zone ?? '') : ''} hook={q ? 0 : hook} search={search} onPlace={() => (zonesOn ? scrollTo(zonesY) : askLocation())} onTickets={tickets} ticketDot={activeTicket}>
          {!q && data ? <NeighborsRow neighbors={data.neighbors} now={now} onClaim={open} onChat={chat} /> : null}
        </BarrioBand>
        {status === 'signedIn' && !q ? <SavedCard savings={savings.data} onTickets={tickets} /> : <View style={styles.bandGap} />}

        {!hasLoc && !q && ready ? (
          <View style={styles.loc}>
            <Text style={styles.locText}>
              {locAsked ? 'Sin permiso de ubicación no podemos decir qué está cerca.' : city ? 'Con tu ubicación te mostramos primero tu barrio.' : 'Con tu ubicación te mostramos las ofertas de tu barrio.'}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void askLocation()} style={styles.locBtn}>
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.locBtnText}>
                Activar
              </Text>
            </Pressable>
          </View>
        ) : null}
        {hasLoc && raw && !trust && !q ? (
          <View style={styles.loc}>
            <Text style={styles.locText}>Estás lejos de las ciudades de Empre, por eso no te mostramos distancias. Estas son las que terminan pronto.</Text>
          </View>
        ) : null}

        {!data && (market.isLoading || !ready) ? (
          <View style={styles.sec}>
            <View style={styles.sh}>
              <SkeletonBlock width={150} height={18} />
            </View>
            <View style={styles.bentoSk}>
              <SkeletonBlock height={232} borderRadius={24} style={styles.flex} />
              <View style={styles.bentoSkCol}>
                <SkeletonBlock height={112} borderRadius={22} />
                <SkeletonBlock height={112} borderRadius={22} />
              </View>
            </View>
          </View>
        ) : null}

        {data && !q && (data.spotlight.length || data.bento.length) ? (
          <Reveal key={`bento|${key}`} style={styles.sec}>
            {header(data.zone && trust ? `Hoy en ${data.zone}` : 'Hoy en tu ciudad', 'Un vecino de cada tipo, para que veas de todo')}
            <Bento slides={data.spotlight} tiles={data.bento} zone={trust ? data.zone : ''} onOpen={open} />
          </Reveal>
        ) : null}

        {data && !q && data.routes.length ? (
          <Reveal key={`routes|${key}`} delay={70} style={styles.sec}>
            {header('Rutas del barrio', 'Planes con 3 vecinos distintos, cerca entre sí')}
            <RoutesRail routes={data.routes} city={city} hereZone={trust ? data.zone : ''} onOpen={open} onRoute={setRouteOpen} />
          </Reveal>
        ) : null}

        {data
          ? sections.map((s, i) => (
              // La llave cambia con el lugar, el filtro o el término: lo nuevo vuelve a entrar con su cascada.
              <Reveal key={`${s}|${key}`} delay={Math.min(i + 1, 3) * 70} style={styles.sec}>
                {s === 'near' ? (
                  <>
                    {header('A pocas cuadras', 'Tus vecinos más cercanos, a menos de 3 km')}
                    {rail(data.near)}
                  </>
                ) : s === 'searched' ? (
                  <>
                    {header('Lo más buscado', `Lo que la gente busca esta semana${city ? ` en ${city}` : ' en Empre'}`)}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                      {data.searched.terms.map((t) => (
                        <Chip key={t.term} label={t.label} selected={data.searched.term === t.term} tone="soft" onPress={() => setTerm(t.term)} />
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

        {data && !q && data.voices.length ? (
          <Reveal key={`voices|${key}`} delay={70} style={styles.sec}>
            {header('Lo recomiendan tus vecinos', 'Reseñas de quienes canjearon, sin contar votos')}
            <VoicesRail voices={data.voices} now={now} onOpen={open} />
          </Reveal>
        ) : null}

        {!q ? (
          <View style={styles.sec}>
            {header('¿Qué se te antoja?', 'Los tipos de negocio de Explorar, con el mayor ahorro de cada uno')}
            <GroupCards best={best} selected={group} onSelect={setGroup} />
          </View>
        ) : null}

        {data && zonesOn ? (
          <View onLayout={(e) => setZonesY(e.nativeEvent.layout.y)}>
            <Reveal key={`zones|${key}`} style={styles.sec}>
              {header(`Barrios de ${city}`, 'El tuyo primero; toca uno para ver sus ofertas')}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} snapToInterval={ZONE_W + TILE_GAP} decelerationRate="fast" snapToAlignment="start">
                {data.zones.map((z, i) => (
                  <Reveal key={z.id} delay={80 + Math.min(i, 5) * 50} distance={6} duration={280}>
                    <ZoneCard zone={z} onPress={() => goToList(z.id)} />
                  </Reveal>
                ))}
              </ScrollView>
            </Reveal>
          </View>
        ) : null}

        {data || all.data ? (
          <View onLayout={(e) => setListY(e.nativeEvent.layout.y)}>
            <View style={styles.sec}>
              {header(q ? 'Resultados' : listTitle(city, zoneName), listStale ? `Buscando${zoneName ? ` en ${zoneName}` : ''}…` : q ? `Con «${q}»${zoneName ? ` en ${zoneName}` : inCity}` : hasLoc && trust ? 'Vigentes ahora, la más cercana primero' : 'Vigentes ahora')}
              {data && data.zones.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                  <Chip label={city ? `Toda ${city}` : 'Todas las zonas'} selected={!zoneId} tone="soft" onPress={() => setZone(undefined)} />
                  {zoneFilterOrder(data.zones).map((z) => (
                    <Chip key={z.id} label={z.name} selected={zoneId === z.id} tone="soft" onPress={() => setZone(zoneId === z.id ? undefined : z.id)} />
                  ))}
                </ScrollView>
              ) : null}
              {!q ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                  {sortOptions(hasLoc && trust).map((o) => (
                    <Chip key={o.key} label={o.label} selected={sortNow === o.key} onPress={() => setSort(o.key)} />
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.list}>
                {listStale ? [0, 1].map((i) => <SkeletonBlock key={`stale${i}`} height={98} borderRadius={radius.lg} />) : null}
                <View style={[styles.listItems, listStale && styles.dim]}>
                  {items.map((o, i) => (
                    // Solo la primera tanda entra en cascada; las siguientes aparecen al llegar, sin esperar.
                    <Reveal key={o.id} delay={i < 20 ? 60 + Math.min(i, 6) * 40 : 0} distance={6} duration={260}>
                      <OfferRow item={o} now={now} onPress={() => open(o)} />
                    </Reveal>
                  ))}
                </View>
                {all.isFetchingNextPage || (all.isLoading && !all.data) ? [0, 1].map((i) => <SkeletonBlock key={`sk${i}`} height={98} borderRadius={radius.lg} />) : null}
                {all.data && !all.hasNextPage && items.length > 0 && !listStale ? <Text style={styles.end}>{endText(city, zoneName)}</Text> : null}
                {all.data && items.length === 0 && !all.isFetching ? <EmptyOffers searching={Boolean(q || zoneId)} /> : null}
                {all.isError && all.data ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>No pudimos cargar más ofertas.</Text>
                    <Button title="Reintentar" variant="secondary" onPress={() => void all.fetchNextPage()} />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
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
      {routeOpen ? (
        <RouteView
          route={routeOpen}
          city={city}
          hereZone={trust ? (data?.zone ?? '') : ''}
          signedIn={status === 'signedIn'}
          onClose={() => setRouteOpen(null)}
          onOpenOffer={(o) => leaveRoute(() => setSheet(o))}
          onTickets={() => leaveRoute(tickets)}
          onSignIn={() => leaveRoute(() => router.push('/(auth)/login'))}
        />
      ) : null}
      {sheet ? (
        <OfferSheet
          key={sheet.id}
          item={sheet}
          now={now}
          signedIn={status === 'signedIn'}
          onClose={() => setSheet(null)}
          onBusiness={business}
          onOpenOffer={(o) => leaveSheet(() => setSheet(o))}
          onSignIn={() => leaveSheet(() => router.push('/(auth)/login'))}
          onShowQR={(c, o) => leaveSheet(() => router.push({ pathname: '/offer/claim', params: { claimId: c.id, offerId: o.id, entityId: o.entity_id } }))}
        />
      ) : null}
    </View>
  );
}

function EmptyOffers({ searching }: { searching: boolean }) {
  const router = useRouter();
  return (
    <View style={styles.empty}>
      <Ionicons name="pricetag-outline" size={36} color={colors.muted} />
      <Text style={styles.emptyTitle}>{searching ? 'Nada con esa búsqueda' : 'Aún no hay ofertas aquí'}</Text>
      <Text style={styles.emptyText}>{searching ? 'Prueba con otra palabra, otra zona o quita el filtro.' : 'Explora el mapa para ver negocios cerca.'}</Text>
      {searching ? null : <Button title="Ver en el mapa" variant="secondary" onPress={() => router.replace('/')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 46, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink, paddingVertical: 0 },
  bandGap: { height: spacing.sm },
  mini: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: spacing.lg, paddingRight: spacing.xs, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line },
  miniCity: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, flexShrink: 0 },
  miniZone: { flex: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  miniBtn: { marginLeft: 'auto', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  terms: { gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  loc: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  locText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  locBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center' },
  locBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.white },
  sec: { paddingTop: spacing.lg },
  sh: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  shTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  shWhy: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  rail: { flexDirection: 'row', gap: TILE_GAP, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  bentoSk: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg },
  bentoSkCol: { flex: 1, gap: 8 },
  none: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, paddingHorizontal: spacing.lg },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  listItems: { gap: spacing.sm },
  dim: { opacity: 0.45 },
  end: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center', paddingVertical: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
