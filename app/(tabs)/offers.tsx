import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askApi } from '@/api/ask';
import { catalogApi } from '@/api/catalog';
import { categoriesApi } from '@/api/endpoints';
import { claimsApi, discoveryApi, offersApi } from '@/api/offers';
import type { DiscoveryItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { ZoneButton, ZoneList } from '@/components/ZoneButton';
import { UpdatingBar } from '@/components/explore/LoadingMotion';
import { MarketItemSheet } from '@/components/offers/MarketItemSheet';
import { Reveal } from '@/components/offers/MarketMotion';
import { FeaturedOffer, OfferRow, OfferTile, TILE_GAP, TILE_W, ZONE_W, ZoneCard } from '@/components/offers/OfferTiles';
import { Showcase } from '@/components/offers/Showcase';
import { SkeletonBlock } from '@/components/Skeleton';
import { ActionTile } from '@/components/system/parts';
import type { ServiceItem } from '@/lib/catalog';
import { mediaUrl } from '@/lib/image';
import { loadLastCity, saveLastCity } from '@/lib/lastCityStore';
import { displayIcon } from '@/lib/mapView';
import {
  askItemsToMarketItems,
  distanceLabel,
  effectiveSort,
  endText,
  filterVitrinaItems,
  flattenPages,
  listTitle,
  mergeCatalogIntoMarket,
  nearEnd,
  pesos,
  showZones,
  sortOptions,
  visibleSections,
  zoneFilterOrder,
  type MarketItem,
  type MarketSort,
  type VitrinaFilter,
} from '@/lib/offerMarket';
import { planHour, planKey, planLevel, planTag, planTitle, planWalk } from '@/lib/plans';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, radius, softShadow, spacing } from '@/theme';

type Coords = { latitude: number; longitude: number };

const COMPACT_AT = 72; // px bajados para pasar a la barra compacta
const MINI_H = 60; // alto de la barra compacta (la lista no queda debajo al saltar a una zona)

const VITRINA_FILTERS: { key: VitrinaFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'Todo', icon: 'grid-outline' },
  { key: 'offers', label: 'Con oferta', icon: 'flame-outline' },
  { key: 'services', label: 'Catálogo y servicios', icon: 'pricetag-outline' },
  { key: 'open', label: 'Abierto ahora', icon: 'time-outline' },
];

/**
 * Vitrina Unificada de Empre (Ofertas + Catálogo de Servicios y Productos):
 * - Combina las ofertas activas con los servicios y productos con precio de los negocios cercanos para asegurar volumen real.
 * - Permite buscar un producto o servicio específico y detectar al instante si tiene una oferta vigente.
 * - Al tocar cualquier tarjeta, abre `MarketItemSheet` con respuestas instantáneas de Empre AI y chat directo al negocio.
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
  const [vitrinaFilter, setVitrinaFilter] = useState<VitrinaFilter>('all');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [compact, setCompact] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string; latitude: number; longitude: number } | null>(null);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [listY, setListY] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);

  const { status } = useAuth();
  const claims = useQuery({ queryKey: ['claims', 'mine'], queryFn: claimsApi.mine, enabled: status === 'signedIn', retry: false, staleTime: 15_000 });
  const activeClaims = (claims.data ?? []).filter((c) => c.status === 'RECLAMADO').length;

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

  const readPosition = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      // Sin ubicación: la vitrina usa la última ciudad conocida.
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

  // Negocios cercanos y sus catálogos publicados: nutren la vitrina con servicios/productos con precio real.
  const nearbyBizQuery = useQuery({
    queryKey: ['vitrina-discover', placeKey, category ?? 'all'],
    queryFn: () =>
      discoveryApi.discover({
        ...(center ? { lat: center.latitude, long: center.longitude } : {}),
        category,
        limit: 8,
      }),
    staleTime: 60_000,
    enabled: ready,
  });
  const nearbyBiz = useMemo(() => nearbyBizQuery.data?.items ?? [], [nearbyBizQuery.data?.items]);
  const bizById = useMemo(() => {
    const map: Record<string, DiscoveryItem> = {};
    for (const b of nearbyBiz) map[b.id] = b;
    return map;
  }, [nearbyBiz]);

  const catalogQueries = useQueries({
    queries: nearbyBiz.slice(0, 6).map((b) => ({
      queryKey: ['catalog', b.id],
      queryFn: () => catalogApi.list(b.id),
      staleTime: 2 * 60_000,
    })),
  });

  const catalogsByEntity = useMemo(() => {
    const map: Record<string, ServiceItem[]> = {};
    nearbyBiz.slice(0, 6).forEach((b, idx) => {
      const items = catalogQueries[idx]?.data;
      if (items) map[b.id] = items;
    });
    return map;
  }, [nearbyBiz, catalogQueries]);

  // Búsqueda inteligente de productos y servicios específicos vía `/api/ask` cuando el usuario busca en la vitrina
  const askSearchQuery = useQuery({
    queryKey: ['vitrina-ask-search', q, placeKey],
    queryFn: () =>
      askApi.ask({
        q,
        ...(center ? { lat: center.latitude, long: center.longitude } : {}),
      }),
    enabled: Boolean(q && q.length >= 2),
    staleTime: 30_000,
  });

  const rawAllItems = useMemo(() => flattenPages(all.data?.pages), [all.data?.pages]);

  const resolvePhoto = useCallback((id?: string) => (id ? mediaUrl(id) : undefined), []);

  // Lista unificada para «Todas» y búsqueda: ofertas + servicios del catálogo + hallazgos de Empre AI
  const items = useMemo(() => {
    const merged = mergeCatalogIntoMarket(rawAllItems, nearbyBiz, catalogsByEntity, resolvePhoto);
    if (q && askSearchQuery.data?.items.length) {
      const askMapped = askItemsToMarketItems(askSearchQuery.data.items, bizById, resolvePhoto);
      const seen = new Set(merged.map((m) => m.service_id ?? m.id));
      for (const a of askMapped) {
        const keyId = a.service_id ?? a.id;
        if (!seen.has(keyId)) {
          seen.add(keyId);
          merged.push(a);
        }
      }
    }
    return filterVitrinaItems(merged, vitrinaFilter);
  }, [rawAllItems, nearbyBiz, catalogsByEntity, q, askSearchQuery.data?.items, bizById, vitrinaFilter, resolvePhoto]);

  const saved = useRef('');
  useEffect(() => {
    if (coords && !picked && city && city !== saved.current && city !== lastCity) {
      saved.current = city;
      void saveLastCity(city);
    }
  }, [coords, picked, city, lastCity]);

  const place1 = data ? `${city}|${data.zone}` : '';
  const prevPlace = useRef('');
  useEffect(() => {
    if (!place1) return;
    if (prevPlace.current && prevPlace.current !== place1) {
      AccessibilityInfo.announceForAccessibility(data?.zone ? `Ahora en ${data.zone}, ${city}` : `Vitrina en ${city || 'todas las ciudades'}`);
    }
    prevPlace.current = place1;
  }, [place1, data?.zone, city]);

  // Al tocar cualquier tarjeta se abre la ficha interactiva rápida (con Empre AI y chat directo)
  const open = useCallback((o: MarketItem) => {
    setSelectedItem(o);
  }, []);

  // Ítems combinados para la portada: ofertas cercanas + servicios destacados del catálogo de negocios cercanos
  const mergedNear = useMemo(
    () => mergeCatalogIntoMarket(data?.near ?? [], nearbyBiz, catalogsByEntity, resolvePhoto),
    [data?.near, nearbyBiz, catalogsByEntity, resolvePhoto],
  );

  const onMap = useMemo(() => mergedNear.filter((o) => o.latitude && o.longitude).slice(0, 14), [mergedNear]);
  const ordered = useMemo(() => {
    const first = onMap.find((o) => o.id === pin) ?? onMap[0];
    return first ? [first, ...onMap.filter((o) => o.id !== first.id)] : [];
  }, [onMap, pin]);
  const sections = q ? [] : visibleSections(data);
  const baseRailItems = ordered.length ? ordered : mergedNear.slice(0, 14);
  const railItems = useMemo(() => filterVitrinaItems(baseRailItems, vitrinaFilter), [baseRailItems, vitrinaFilter]);

  // Servicios del catálogo destacados para su propia fila cuando hay tanto ofertas como catálogo
  const catalogSpotlightItems = useMemo(
    () => mergedNear.filter((o) => o.kind === 'service' || Boolean(o.service_id)).slice(0, 10),
    [mergedNear],
  );

  const zonesOn = !q && showZones(data);
  const zoneName = data?.zones.find((z) => z.id === zoneId)?.name;
  const zoneLabel = picked?.name ?? (data?.zone || (coords ? 'Cerca de ti' : city || 'Tu ciudad'));

  // La vitrina superior (Showcase): solo las ofertas reales con vigencia que terminan primero.
  const showcase = useMemo(
    () =>
      baseRailItems
        .filter((o) => o.kind !== 'service' && Boolean(o.ends_at))
        .sort((a, b) => (a.ends_at ?? '9').localeCompare(b.ends_at ?? '9'))
        .slice(0, 3),
    [baseRailItems],
  );
  const restItems = railItems.filter((o) => !showcase.some((x) => x.id === o.id));
  const zoneTitle = picked ? `Vitrina en ${picked.name}` : coords ? 'Catálogo y ofertas cerca' : city ? `Catálogo y ofertas en ${city}` : 'Catálogo y ofertas';

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
        <EmpreSymbol product="offers" size={24} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Zona: ${zoneLabel}. Volver arriba para cambiarla`} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: !reduce })} style={styles.miniTap}>
          <Text style={styles.miniCity} numberOfLines={1}>
            {zoneLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Buscar servicios, productos u ofertas" onPress={() => openAll(true)} style={styles.miniBtn}>
          <Ionicons name="search" size={20} color={colors.ink} />
        </Pressable>
      </Animated.View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onScroll={onScroll} scrollEventThrottle={64}>
        <View style={styles.top}>
          {home ? (
            <EmpreSymbol product="offers" size={32} />
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Volver a la vitrina" onPress={closeAll} style={styles.round}>
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
          )}
          <ZoneButton lead={picked ? 'Estás viendo' : 'Estás en'} name={zoneLabel} open={zonesOpen} disabled={!data?.zones.length} onPress={() => setZonesOpen((v) => !v)} />
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
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.hero} accessibilityRole="header">
              {home ? zoneTitle : 'Catálogo y ofertas'}
            </Text>
            <Text style={styles.heroSub}>
              Servicios con precio al día, productos y ofertas activas · Pregunta con Empre AI
            </Text>
          </View>
        </View>

        {/* PÍLDORAS DE FILTRO DE VITRINA (Inspirado en Swiggy / Shop) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vitrinaPills}>
          {VITRINA_FILTERS.map((f) => {
            const active = vitrinaFilter === f.key;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setVitrinaFilter(f.key)}
                style={({ pressed }) => [styles.vitrinaPill, active && styles.vitrinaPillOn, pressed && styles.chipPressed]}
              >
                <Ionicons name={f.icon} size={14} color={active ? '#fff' : colors.ink} />
                <Text style={[styles.vitrinaPillText, active && styles.vitrinaPillTextOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {home ? (
          <View style={styles.pad}>
            <Pressable accessibilityRole="search" accessibilityLabel="Buscar un producto, servicio u oferta" onPress={() => openAll(true)} style={styles.field}>
              <Ionicons name="search" size={20} color={colors.ink} />
              <Text style={styles.fieldText} numberOfLines={1}>
                Busca un servicio, producto o mira si tiene oferta…
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Buscar con voz en Empre AI" onPress={() => router.push({ pathname: '/ask', params: { voice: '1' } })} style={styles.fieldMic}>
                <Ionicons name="mic-outline" size={18} color={colors.primaryDark} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Abrir el mapa de ofertas" onPress={() => router.push('/map')} style={styles.fieldSlot}>
                <Ionicons name="map-outline" size={18} color={colors.ink} />
              </Pressable>
            </Pressable>
            {showcase.length && vitrinaFilter !== 'services' ? <Showcase items={showcase} now={now} onOpen={open} /> : null}
            {(categories.data ?? []).length ? <Text style={styles.tilesLabel}>Por tipo de negocio</Text> : null}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} accessibilityLabel="Categorías">
          {home ? null : <Chip label="Todas" active={!catId} onPress={() => setCatId(undefined)} />}
          {(categories.data ?? []).map((c) =>
            home ? (
              <ActionTile key={c.id} width={108} icon={displayIcon(c.icon) as keyof typeof Ionicons.glyphMap} label={c.name} selected={catId === c.id} onPress={() => setCatId(catId === c.id ? undefined : c.id)} />
            ) : (
              <Chip key={c.id} label={c.name} icon={c.icon} active={catId === c.id} onPress={() => setCatId(catId === c.id ? undefined : c.id)} />
            ),
          )}
        </ScrollView>

        {!showAll && !hasLoc && ready ? (
          <View style={styles.loc}>
            <Text style={styles.locText}>{locAsked ? 'Sin permiso de ubicación no podemos decir qué está cerca.' : city ? 'Con tu ubicación te mostramos primero lo que está cerca.' : 'Con tu ubicación te mostramos el catálogo y las ofertas de tu ciudad.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => void askLocation()} style={styles.locBtn}>
              <Text style={styles.locBtnText}>Activar</Text>
            </Pressable>
          </View>
        ) : null}

        {home ? (
          <View style={styles.sec}>
            <View style={styles.railHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shTitle} accessibilityRole="header">
                  {vitrinaFilter === 'services'
                    ? 'Servicios y productos del catálogo'
                    : vitrinaFilter === 'offers'
                      ? 'Ofertas activas ahora'
                      : ordered.length && zoneLabel
                        ? zoneLabel === 'Cerca de ti'
                          ? 'Destacados cerca de ti'
                          : `En ${zoneLabel}, ahora`
                        : city
                          ? `En ${city}, ahora`
                          : 'Destacados ahora'}
                </Text>
                <Text style={styles.shWhy}>Toca cualquiera para preguntar con Empre AI o ver si tiene oferta</Text>
              </View>
              <Pressable accessibilityRole="link" onPress={() => openAll(false)} style={styles.seeAll}>
                <Text style={styles.seeAllText}>{restItems.length ? 'Ver todo' : 'Explorar todo'}</Text>
              </Pressable>
            </View>
            {!data && (market.isLoading || !ready) ? (
              <View style={styles.rail}>
                {[0, 1].map((i) => (
                  <SkeletonBlock key={i} width={TILE_W} height={280} borderRadius={20} />
                ))}
              </View>
            ) : null}
            {data && !restItems.length && !railItems.length ? (
              <Text style={styles.none}>{`Hoy no hay resultados con este filtro${catId ? ' en esta categoría' : ''}. Prueba «Todo» o explora todas las zonas.`}</Text>
            ) : null}
            {(restItems.length ? restItems : railItems).length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} snapToInterval={TILE_W + TILE_GAP} decelerationRate="fast" snapToAlignment="start">
                {(restItems.length ? restItems : railItems).map((o, i) => (
                  <Reveal key={o.id} delay={80 + Math.min(i, 5) * 50} distance={6} duration={280}>
                    <OfferTile item={o} now={now} onPress={() => open(o)} />
                  </Reveal>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {/* FILA DEDICADA DE CATÁLOGO DE SERVICIOS Y PRODUCTOS (Para garantizar volumen y descubrimiento por precio) */}
        {home && vitrinaFilter === 'all' && catalogSpotlightItems.length > 0 ? (
          <View style={styles.sec}>
            <View style={styles.railHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shTitle} accessibilityRole="header">
                  Del catálogo de los negocios
                </Text>
                <Text style={styles.shWhy}>Precios publicados por cada local · Mira al instante si tienen oferta</Text>
              </View>
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  setVitrinaFilter('services');
                  openAll(false);
                }}
                style={styles.seeAll}
              >
                <Text style={styles.seeAllText}>Ver catálogo</Text>
              </Pressable>
            </View>
            {rail(catalogSpotlightItems)}
          </View>
        ) : null}

        {home && data?.routes.length ? (
          <View style={styles.sec}>
            <View style={styles.sh}>
              <Text style={styles.shTitle} accessibilityRole="header">
                Planes para hoy
              </Text>
              <Text style={styles.shWhy}>Negocios distintos, un mismo recorrido (combina ofertas y servicios)</Text>
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
                <TextInput
                  ref={searchRef}
                  value={text}
                  onChangeText={setText}
                  placeholder={city ? `Busca un servicio, producto u oferta en ${city}` : 'Busca un servicio, producto u oferta'}
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  accessibilityLabel="Buscar en el catálogo y ofertas"
                  returnKeyType="search"
                />
                {text ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setText('')} hitSlop={10}>
                    <Ionicons name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {data?.featured && !q && vitrinaFilter !== 'services' ? (
              <Reveal key={`featured|${key}|${data.featured.id}`} style={styles.sec}>
                <FeaturedOffer item={data.featured} now={now} onPress={() => open(data.featured!)} />
              </Reveal>
            ) : null}

            {data
              ? sections.map((s, i) => (
                  <Reveal key={`${s}|${key}`} delay={Math.min(i, 3) * 70} style={styles.sec}>
                    {s === 'near' ? (
                      <>
                        {header('Cerca de ti', 'Ofertas y servicios de catálogo a menos de 3 km')}
                        {rail(mergedNear)}
                      </>
                    ) : s === 'searched' ? (
                      <>
                        {header('Lo más buscado', `Lo que la gente busca esta semana${city ? ` en ${city}` : ' en Empre'}`)}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                          {data.searched.terms.map((t) => (
                            <Chip key={t.term} label={t.label} active={data.searched.term === t.term} soft onPress={() => setTerm(t.term)} />
                          ))}
                        </ScrollView>
                        {data.searched.items.length ? rail(data.searched.items) : <Text style={styles.none}>Ahora no hay ofertas para esto. Mira abajo los servicios del catálogo.</Text>}
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
                  {header(
                    q ? 'Productos, servicios y ofertas' : listTitle(city, zoneName),
                    q
                      ? `Coincidencias con «${q}» · Toca cualquiera para consultar con Empre AI o ver si tiene oferta`
                      : hasLoc
                        ? 'Catálogo al día y ofertas vigentes, lo más cercano primero'
                        : 'Catálogo al día y ofertas vigentes',
                  )}
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
                      <Reveal key={o.id} delay={i < 20 ? 60 + Math.min(i, 6) * 40 : 0} distance={6} duration={260}>
                        <OfferRow item={o} now={now} onPress={() => open(o)} />
                      </Reveal>
                    ))}
                    {all.isFetchingNextPage || (all.isLoading && !all.data) ? [0, 1].map((i) => <SkeletonBlock key={`sk${i}`} height={98} borderRadius={radius.lg} />) : null}
                    {all.data && !all.hasNextPage && items.length > 0 ? <Text style={styles.end}>{endText(city, zoneName)}</Text> : null}
                    {all.data && items.length === 0 && !all.isFetching && !askSearchQuery.isFetching ? <EmptyOffers searching={Boolean(q || zoneId)} /> : null}
                    {all.isError && all.data ? (
                      <View style={styles.empty}>
                        <Text style={styles.emptyText}>No pudimos cargar más elementos.</Text>
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
            <Text style={styles.emptyTitle}>No pudimos cargar la vitrina</Text>
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

      {/* FICHA RÁPIDA INTERACTIVA CON EMPRE AI + DETECCIÓN DE OFERTA + CHAT DIRECTO */}
      <MarketItemSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </View>
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
      <Text style={styles.emptyTitle}>{searching ? 'Nada con esa búsqueda' : 'Aún no hay servicios ni ofertas aquí'}</Text>
      <Text style={styles.emptyText}>{searching ? 'Prueba con otra palabra, otra zona o pregúntale a Empre AI.' : 'Explora el mapa para ver negocios cerca.'}</Text>
      {searching ? (
        <Button title="Preguntarle a Empre AI" variant="secondary" onPress={() => router.push('/ask')} />
      ) : (
        <Button title="Ver en el mapa" variant="secondary" onPress={() => router.push('/map')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20, gap: 14 },
  field: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  fieldText: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.faint },
  fieldMic: { width: 40, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  fieldSlot: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  tilesLabel: { marginTop: 6, marginBottom: -6, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { gap: 16, paddingBottom: 120 },
  wash: { position: 'absolute', left: 0, right: 0, top: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  roundDot: { position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.surface },
  zoneWrap: { marginHorizontal: 20, marginTop: -8 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20 },
  hero: { fontSize: 27, lineHeight: 31, letterSpacing: -0.3, fontFamily: fonts.display.bold, color: colors.ink },
  heroSub: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  vitrinaPills: { gap: 8, paddingHorizontal: 20 },
  vitrinaPill: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  vitrinaPillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  vitrinaPillText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  vitrinaPillTextOn: { color: '#fff' },
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
  shTitle: { flexShrink: 1, fontSize: 20, lineHeight: 25, fontFamily: fonts.display.bold, color: colors.ink },
  shWhy: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
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
