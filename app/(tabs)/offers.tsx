import { Ionicons } from '@/components/Icon';
import { keepPreviousData, useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { Avatar } from '@/components/Avatar';
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
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenGlow } from '@/components/ScreenGlow';

import { askApi } from '@/api/ask';
import { catalogApi } from '@/api/catalog';
import { categoriesApi } from '@/api/endpoints';
import { discoveryApi, offersApi } from '@/api/offers';
import type { DiscoveryItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { artKeyFor } from '@/components/CategoryArt';
import { UpdatingBar } from '@/components/explore/LoadingMotion';
import { BizVitrinaSheet } from '@/components/offers/BizFaces';
import { AskManySheet } from '@/components/offers/AskManySheet';
import { BestPriceRail, HeroCarousel, Relampago } from '@/components/offers/OfferSpotlight';
import { BizShelf, ChosenFaces, CategoryIcons, ResultsByBusiness, SearchedChips, SectionHead } from '@/components/offers/HomeBlocks';
import { FilterRow, FiltersSheet, LensTabs, type FilterTag, type ShowFilter } from '@/components/offers/LensFilters';
import { MarketItemSheet } from '@/components/offers/MarketItemSheet';
import { OfferAlertCard } from '@/components/offers/OfferAlertCard';
import { Reveal } from '@/components/offers/MarketMotion';
import { FeaturedOffer, OfferRow, OfferTile, TILE_GAP, TILE_W, ZONE_W, ZoneCard } from '@/components/offers/OfferTiles';
import { Showcase } from '@/components/offers/Showcase';
import { SkeletonBlock } from '@/components/Skeleton';
import { publicCatalog, type ServiceItem } from '@/lib/catalog';
import { mediaUrl, resolveImageUrl } from '@/lib/image';
import { onFootOrDistance } from '@/lib/format';
import { loadLastCity, saveLastCity } from '@/lib/lastCityStore';
import { displayIcon } from '@/lib/mapView';
import { bestPrices } from '@/lib/askMany';
import { groupResults, iconGroups, mostPopular } from '@/lib/offerHome';
import { applyFilters, availableLenses, lensItems, type BizFace, type LensKey } from '@/lib/offerLenses';
import {
  askItemsToMarketItems,
  catalogMarketItem,
  endingToday,
  heroPicks,
  effectiveSort,
  endText,
  filterVitrinaItems,
  flattenPages,
  listTitle,
  mergeCatalogIntoMarket,
  nearestOtherZone,
  offerSections,
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
  const [catId, setCatId] = useState<string | undefined>(); // categoría elegida (segundo nivel)
  const [art, setArt] = useState<string | undefined>(); // ícono elegido (comida, belleza, ropa…): junta varias categorías
  const [term, setTerm] = useState<string | undefined>();
  const [sort, setSort] = useState<MarketSort>('near');
  const [zone, setZone] = useState<string | undefined>();
  const [vitrinaFilter, setVitrinaFilter] = useState<VitrinaFilter>('all');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [compact, setCompact] = useState(false);
  const [picked, setPicked] = useState<{ id: string; name: string; latitude: number; longitude: number } | null>(null);
  const [, setPin] = useState<string | null>(null);
  const [listY, setListY] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);
  // Ofertas por tendencias (3.61): la lente elegida, la hoja de filtros y la vitrina de un negocio.
  const [lens, setLens] = useState<LensKey | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [face, setFace] = useState<BizFace | null>(null);
  const win = useWindowDimensions();

  const { user } = useAuth();

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
  const allCats = useMemo(() => categories.data ?? [], [categories.data]);
  // Los íconos: las categorías sueltas juntas por su ilustración. El orden sale de lo que hay cerca sin filtro.
  const groupsAll = useMemo(() => iconGroups(allCats, [], artKeyFor), [allCats]);
  const artGroup = groupsAll.find((g) => g.key === art);
  // El filtro: la categoría elegida; si solo hay ícono, todas las suyas (el servidor acepta varias).
  const category = catId ?? (artGroup ? artGroup.ids.join(',') : undefined);
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
        limit: 12,
      }),
    staleTime: 60_000,
    enabled: ready,
  });
  const nearbyBiz = useMemo(() => nearbyBizQuery.data?.items ?? [], [nearbyBizQuery.data?.items]);
  const allNearQuery = useQuery({
    queryKey: ['vitrina-discover', placeKey, 'all'],
    queryFn: () => discoveryApi.discover({ ...(center ? { lat: center.latitude, long: center.longitude } : {}), limit: 12 }),
    staleTime: 60_000,
    enabled: ready,
  });
  const allNear = useMemo(() => allNearQuery.data?.items ?? [], [allNearQuery.data?.items]);
  const groups = useMemo(() => iconGroups(allCats, allNear, artKeyFor), [allCats, allNear]);
  const popular = useMemo(() => mostPopular(allNear), [allNear]);
  const bizById = useMemo(() => {
    const map: Record<string, DiscoveryItem> = {};
    for (const b of nearbyBiz) map[b.id] = b;
    return map;
  }, [nearbyBiz]);

  const catalogQueries = useQueries({
    queries: nearbyBiz.slice(0, 10).map((b) => ({
      queryKey: ['catalog', b.id],
      queryFn: () => catalogApi.list(b.id),
      staleTime: 2 * 60_000,
    })),
  });

  const catalogsByEntity = useMemo(() => {
    const map: Record<string, ServiceItem[]> = {};
    nearbyBiz.slice(0, 10).forEach((b, idx) => {
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

  // Todo lo que la Vitrina ya cargó: de aquí salen los negocios que ofrecen lo mismo (3.64). Sin otra consulta.
  // Todo el catálogo cargado de los negocios cerca: con él «Para decidir» compara el mismo producto entre negocios.
  const catalogPool = useMemo(
    () => nearbyBiz.flatMap((b) => publicCatalog(catalogsByEntity[b.id] ?? []).map((it) => catalogMarketItem(b, it, resolvePhoto(it.photos?.[0]) ?? resolveImageUrl(b.photos?.[0] ?? b.profile_url) ?? undefined))),
    [nearbyBiz, catalogsByEntity, resolvePhoto],
  );
  const askPool = useMemo(() => [...mergedNear, ...items, ...catalogPool], [mergedNear, items, catalogPool]);

  const sections = q ? [] : visibleSections(data);


  const zonesOn = !q && showZones(data);
  const zoneName = data?.zones.find((z) => z.id === zoneId)?.name;

  const goToList = (id: string | undefined) => {
    setZone(id);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, listY - MINI_H - 4), animated: !reduce }), reduce ? 0 : 160);
  };

  // Lentes: solo las que tienen algo. Encima van los filtros de la hoja (abiertos y orden).
  const lenses = useMemo(() => availableLenses(data, now), [data, now]);
  const lensKey = lens && lenses.some((l) => l.key === lens) ? lens : (lenses[0]?.key ?? null);
  const lensMeta = lenses.find((l) => l.key === lensKey) ?? null;
  const lensList = useMemo(() => (lensKey ? applyFilters(lensItems(lensKey, data, now), { openOnly, sort: sortNow }) : []), [lensKey, data, now, openOnly, sortNow]);
  const lensTop = lensList.slice(0, 3);
  const lensRest = lensList.slice(3, 7);
  const halfW = Math.floor((win.width - 40 - 10) / 2);

  // Pocas ofertas aquí (tablero «Ofertas», teléfono 4): de cerca a lejos, primero las de tu puerta y luego el barrio
  // vecino con lo mismo. Nunca se rellena con el catálogo.
  const few = Boolean(data) && !q && lensList.length < 4;
  const vecino = few ? nearestOtherZone(data?.zones ?? [], [zoneId, picked?.id]) : null;
  const vecinoQ = useQuery({
    queryKey: ['offers-vecino', placeKey, category ?? 'all', vecino?.id ?? ''],
    queryFn: () => offersApi.marketAll({ ...place, category, zone: vecino?.id, sort: 'near' }),
    enabled: ready && Boolean(vecino),
    staleTime: 60_000,
  });
  const vecinoItems = useMemo(() => (vecinoQ.data?.items ?? []).filter((o) => o.kind !== 'service').slice(0, 6), [vecinoQ.data]);
  const vecinoLejos = vecino ? onFootOrDistance((vecino.distance_meters ?? 0) / 1000) : null;
  // Lo último con pocas ofertas: que te avisen en la zona que estás viendo (o donde estás), no un relleno.
  const alertZone = few ? (data?.zones.find((z) => z.id === (picked?.id ?? zoneId)) ?? data?.zones.find((z) => z.here) ?? null) : null;
  const alertCat = (categories.data ?? []).find((c) => c.id === catId);

  // Todas las ofertas conocidas (sin servicios): para los negocios que dan la cara y su vitrina.
  const knownOffers = useMemo(() => {
    const d = data;
    const raw = d ? [...(d.featured ? [d.featured] : []), ...d.near, ...d.trending, ...d.for_you.items, ...d.searched.items, ...rawAllItems] : rawAllItems;
    const seen = new Set<string>();
    return raw.filter((o) => o.kind !== 'service' && (seen.has(o.id) ? false : (seen.add(o.id), true)));
  }, [data, rawAllItems]);
  // Lo de adentro del ícono elegido (Jugos, Almuerzos…), solo si hay más de una.
  const subCats = useMemo(() => (artGroup && artGroup.ids.length > 1 ? allCats.filter((c) => artGroup.ids.includes(c.id)).slice(0, 14) : []), [allCats, artGroup]);
  // Lo llamativo (tablero «Empre Offers» v41): las que más ahorran en un carrusel, las que terminan hoy con su cuenta
  // atrás y, aparte, el mejor precio del mismo producto entre negocios. Ninguna oferta sale dos veces.
  const hero = useMemo(() => (q || category ? [] : heroPicks(knownOffers, now)), [knownOffers, now, q, category]);
  const flash = useMemo(() => (q || category ? [] : endingToday(knownOffers, now, new Set(hero.map((o) => o.id)))), [knownOffers, now, q, category, hero]);
  const best = useMemo(() => (q || category ? [] : bestPrices(catalogPool)), [catalogPool, q, category]);
  const offerRails = useMemo(() => {
    if (q || category) return [];
    const taken = new Set([...hero, ...flash].map((o) => o.id));
    return offerSections(knownOffers.filter((o) => !taken.has(o.id)), now).filter((r) => r.key !== 'hoy');
  }, [knownOffers, now, q, category, hero, flash]);
  // Cada negocio cerca con lo que vende (productos y servicios): el volumen de la portada.
  // A tu puerta: los más cercanos con lo que venden, abiertos primero, sin repetir a los de «Los más elegidos».
  const shelves = useMemo(() => {
    const chosen = new Set(popular.map((x) => x.item.id));
    return nearbyBiz
      .filter((b) => !chosen.has(b.id))
      .map((b) => ({ biz: b, items: publicCatalog(catalogsByEntity[b.id] ?? []).slice(0, 10) }))
      .filter((x) => x.items.length > 0)
      .sort((a, b) => Number(b.biz.is_open_now) - Number(a.biz.is_open_now) || (a.biz.distance_meters ?? 0) - (b.biz.distance_meters ?? 0))
      .slice(0, 3);
  }, [nearbyBiz, catalogsByEntity, popular]);
  const shelvesOpen = shelves.some((x) => x.biz.is_open_now);
  // Resultados de una búsqueda: un grupo por negocio con solo lo que coincide.
  const resultGroups = useMemo(() => (q ? groupResults(items, q) : []), [items, q]);
  const [askAll, setAskAll] = useState(false);
  const searchTerm = (label: string) => {
    setText(label);
    openAll(false);
  };

  const pickZone = (id: string) => {
    const z = data?.zones.find((x) => x.id === id);
    if (!z) setPicked(null);
    else if (z.latitude && z.longitude) setPicked({ id: z.id, name: z.name, latitude: z.latitude, longitude: z.longitude });
    else goToList(z.id);
    setPin(null);
  };
  const show: ShowFilter = vitrinaFilter === 'offers' || vitrinaFilter === 'services' ? vitrinaFilter : 'all';
  const tags: FilterTag[] = [
    ...(picked ? [{ key: 'zone', label: picked.name, onRemove: () => setPicked(null) }] : []),
    ...(show !== 'all' ? [{ key: 'show', label: show === 'offers' ? 'Solo ofertas' : 'Solo catálogo', onRemove: () => setVitrinaFilter('all') }] : []),
    ...(sort !== 'near' ? [{ key: 'sort', label: sort === 'ends' ? 'Terminan pronto' : 'Mayor ahorro', onRemove: () => setSort('near') }] : []),
    ...(openOnly ? [{ key: 'open', label: 'Abiertos ahora', onRemove: () => setOpenOnly(false) }] : []),
  ];
  const clearFilters = () => {
    setPicked(null);
    setVitrinaFilter('all');
    setSort('near');
    setOpenOnly(false);
  };


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
  const activeCount = knownOffers.filter((o) => Date.parse(o.ends_at) > now).length;
  const heroLine = !data ? 'Buscando ofertas cerca…' : activeCount ? `${activeCount === 1 ? '1 oferta activa' : `${activeCount} ofertas activas`} cerca` : 'Hoy no hay ofertas cerca · mira lo que venden';

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
      <ScreenGlow height={insets.top + 340} />
      {(market.isFetching && data) || (all.isFetching && !all.isFetchingNextPage && all.data) ? <UpdatingBar /> : null}
      <Animated.View
        pointerEvents={compact ? 'auto' : 'none'}
        aria-hidden={!compact}
        style={[styles.mini, { top: insets.top, opacity: bar, transform: [{ translateY: bar.interpolate({ inputRange: [0, 1], outputRange: [-MINI_H, 0] }) }] }]}
      >
        <Avatar uri={user?.profile_picture_url} name={user?.name ?? 'Tú'} size={32} />
        <Pressable accessibilityRole="search" accessibilityLabel="Buscar un producto, servicio u oferta" onPress={() => openAll(true)} style={styles.miniField}>
          <Ionicons name="search" size={18} color={colors.ink} />
          <Text style={styles.fieldText} numberOfLines={1}>
            Comida, cortes, tenis, ofertas…
          </Text>
        </Pressable>
      </Animated.View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onScroll={onScroll} scrollEventThrottle={64}>
        <View style={styles.top}>
          {home ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Tu perfil" onPress={() => router.push('/(tabs)/profile')} hitSlop={4}>
              <Avatar uri={user?.profile_picture_url} name={user?.name ?? 'Tú'} size={44} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Volver a la vitrina" onPress={closeAll} style={styles.round}>
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
          )}
          {home ? (
            <Pressable accessibilityRole="search" accessibilityLabel="Buscar un producto, servicio u oferta" onPress={() => openAll(true)} style={styles.field}>
              <Ionicons name="search" size={18} color={colors.ink} />
              <Text style={styles.fieldText} numberOfLines={1}>
                Comida, cortes, tenis, ofertas…
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Buscar con voz en Empre AI" onPress={() => router.push({ pathname: '/ask', params: { voice: '1' } })} style={styles.fieldMic}>
                <Ionicons name="mic-outline" size={17} color={colors.primaryDark} />
              </Pressable>
            </Pressable>
          ) : null}
        </View>

        {home ? null : (
          <View style={styles.heroRow}>
            <Text style={styles.hero} accessibilityRole="header">
              Todas las ofertas
            </Text>
          </View>
        )}

        {home ? (
          <>
            {/* Barrios: como las pestañas de categoría de las grandes tiendas, pero por ubicación (tablero «Ofertas») */}
            {(data?.zones ?? []).length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barrios} accessibilityLabel="Barrios">
                {[{ id: '', name: 'A tu puerta', latitude: 0, longitude: 0 }, ...(data?.zones ?? [])].map((z) => {
                  const on = (picked?.id ?? '') === z.id;
                  return (
                    <Pressable
                      key={z.id || 'here'}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        if (!z.id) setPicked(null);
                        else if (z.latitude && z.longitude) setPicked({ id: z.id, name: z.name, latitude: z.latitude, longitude: z.longitude });
                        else goToList(z.id);
                      }}
                      style={styles.barrio}
                    >
                      <Text style={[styles.barrioText, on && styles.barrioOn]}>{z.name}</Text>
                      <View style={[styles.barrioBar, on && styles.barrioBarOn]} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            {/* Categorías a la vista: dos filas de íconos, un toque y filtra */}
            {groups.length ? (
              <CategoryIcons
                groups={groups}
                active={art}
                onPick={(k) => {
                  setArt(k);
                  setCatId(undefined);
                }}
              />
            ) : null}
            {tags.length ? <FilterRow cats={[]} tags={tags} onCat={() => undefined} onOpen={() => setFiltersOpen(true)} /> : null}
            {artGroup && subCats.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} accessibilityLabel={`Dentro de ${artGroup.label}`}>
                <Chip label={`Todo ${artGroup.label.toLowerCase()}`} active={!catId} onPress={() => setCatId(undefined)} />
                {subCats.map((c) => (
                  <Chip key={c.id} label={c.name} active={catId === c.id} onPress={() => setCatId(catId === c.id ? undefined : c.id)} />
                ))}
              </ScrollView>
            ) : null}
            {/* Las lentes solo cuando no hay secciones (búsqueda, categoría o pocas ofertas): si no, repetirían «Terminan hoy» */}
            {offerRails.length === 0 && lenses.length > 1 ? (
              <View style={styles.lensBar}>
                <LensTabs lenses={lenses} active={lensKey} onPick={setLens} />
              </View>
            ) : null}
          </>
        ) : (
          <>
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
                    <Ionicons name={f.icon} size={14} color={colors.ink} />
                    <Text style={[styles.vitrinaPillText, active && styles.vitrinaPillTextOn]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} accessibilityLabel="Categorías">
              <Chip label="Todas" active={!catId} onPress={() => setCatId(undefined)} />
              {(categories.data ?? []).map((c) => (
                <Chip key={c.id} label={c.name} icon={c.icon} active={catId === c.id} onPress={() => setCatId(catId === c.id ? undefined : c.id)} />
              ))}
            </ScrollView>
          </>
        )}

        {!showAll && !hasLoc && ready ? (
          <View style={styles.loc}>
            <Text style={styles.locText}>{locAsked ? 'Sin permiso de ubicación no podemos decir qué está cerca.' : city ? 'Con tu ubicación te mostramos primero lo que está cerca.' : 'Con tu ubicación te mostramos el catálogo y las ofertas de tu ciudad.'}</Text>
            <Pressable accessibilityRole="button" onPress={() => void askLocation()} style={styles.locBtn}>
              <Text style={styles.locBtnText}>Activar</Text>
            </Pressable>
          </View>
        ) : null}

        {home ? (
          <>
            {/* Lo más pegado: los mejor reseñados cerca */}
            {hero.length ? <HeroCarousel items={hero} bizById={bizById} now={now} onOpen={open} /> : null}
            {!q && !category && data?.searched.terms.length ? (
              <SearchedChips title={city ? `Lo más buscado en ${city}` : 'Lo más buscado cerca'} terms={data.searched.terms.slice(0, 6)} onPick={searchTerm} />
            ) : null}
            {best.length ? <BestPriceRail picks={best} onOpen={open} /> : null}
            {!q && !category && popular.length ? <ChosenFaces picks={popular} onOpen={(id) => router.push({ pathname: '/business/[id]', params: { id } })} /> : null}

            {!data && (market.isLoading || !ready) ? (
              <View style={styles.rail}>
                {[0, 1].map((i) => (
                  <SkeletonBlock key={i} width={TILE_W} height={280} borderRadius={20} />
                ))}
              </View>
            ) : null}

            {show !== 'services' && flash.length ? <Relampago items={flash} onOpen={open} /> : null}
            {/* Las demás ofertas por secciones: 2x1 y gratis, con descuento, precio especial */}
            {show !== 'services'
              ? offerRails.map((r) => (
                  <View key={r.key} style={styles.sec}>
                    {header(r.title, r.why)}
                    {rail(r.items)}
                  </View>
                ))
              : null}

            {/* 4 · Lo de la lente elegida (cuando aún no hay secciones: búsqueda, categoría o pocas ofertas) */}
            {data && show !== 'services' && lensMeta && offerRails.length === 0 ? (
              <Reveal key={`lens|${key}|${lensKey}`} style={styles.sec}>
                {header(lensMeta.title, lensKey === 'buscado' || lensKey === 'canjea' ? `${lensMeta.why}${inCity}` : lensMeta.why)}
                {lensKey === 'buscado' && data.searched.terms.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.terms}>
                    {data.searched.terms.map((t) => (
                      <Chip key={t.term} label={t.label} active={data.searched.term === t.term} soft onPress={() => setTerm(t.term)} />
                    ))}
                  </ScrollView>
                ) : null}
                {lensTop.length ? (
                  <View style={styles.pad}>
                    <Showcase key={lensKey} items={lensTop} now={now} onOpen={open} />
                  </View>
                ) : (
                  <Text style={styles.none}>{openOnly ? 'Nada abierto ahora en esta lente. Quita «Abiertos ahora» para ver el resto.' : 'Ahora no hay ofertas para esto. Mira abajo el catálogo.'}</Text>
                )}
                {lensRest.length ? (
                  <View style={styles.grid}>
                    {lensRest.map((o, i) => (
                      <OfferTile key={o.id} item={o} now={now} width={lensRest.length % 2 === 1 && i === lensRest.length - 1 ? halfW * 2 + 10 : halfW} onPress={() => open(o)} />
                    ))}
                  </View>
                ) : null}
              </Reveal>
            ) : null}

            {data && !lenses.length && show !== 'services' && activeCount > 0 ? <Text style={styles.quietLine}>{heroLine}</Text> : null}

          </>
        ) : null}

        {home && show !== 'services' && data?.routes.length ? (
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

        {home ? (
          <>
            {/* A tu puerta: dos o tres negocios cercanos con lo que venden; el resto sale al buscar o con un ícono */}
            {!q && show !== 'offers' && shelves.length ? <SectionHead title={shelvesOpen ? 'A tu puerta, abiertos ahora' : 'A tu puerta'} sub="Lo que venden los más cercanos" /> : null}
            {!q && show !== 'offers'
              ? shelves.map((x) => (
                  <BizShelf
                    key={x.biz.id}
                    biz={x.biz}
                    items={x.items}
                    onBiz={() => router.push({ pathname: '/business/[id]', params: { id: x.biz.id } })}
                    onItem={(it) => open(catalogMarketItem(x.biz, it, resolvePhoto(it.photos?.[0]) ?? resolveImageUrl(x.biz.photos?.[0] ?? x.biz.profile_url) ?? undefined))}
                  />
                ))
              : null}

            {/* Pocas ofertas: el barrio vecino, con lo mismo que estás viendo */}
            {vecino && vecinoItems.length && show !== 'services' ? (
              <View style={styles.sec}>
                <View style={styles.railHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shTitle} accessibilityRole="header">
                      {`En ${vecino.name}`}
                    </Text>
                    <Text style={styles.shWhy}>{[`${vecinoItems.length === 1 ? '1 oferta' : `${vecinoItems.length} ofertas`}`, vecinoLejos].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Pressable accessibilityRole="link" accessibilityLabel={`Ver las ofertas de ${vecino.name}`} onPress={() => pickZone(vecino.id)} style={styles.seeAll}>
                    <Text style={styles.seeAllText}>Ver todas</Text>
                  </Pressable>
                </View>
                {rail(vecinoItems)}
              </View>
            ) : null}

            {alertZone && show !== 'services' ? <OfferAlertCard zoneId={alertZone.id} zoneName={alertZone.name} categoryId={alertCat?.id} categoryName={alertCat?.name} /> : null}

            {!q ? (
              <Pressable accessibilityRole="link" onPress={() => router.push('/cerca')} style={({ pressed }) => [styles.moreLink, pressed && { opacity: 0.8 }]}>
                <Text style={styles.moreLinkText}>Todo lo que venden cerca</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
            ) : null}
          </>
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
                    q ? `Resultados para «${q}»` : listTitle(city, zoneName),
                    q
                      ? ''
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
                  {q && resultGroups.length ? (
                    <ResultsByBusiness
                      q={q}
                      groups={resultGroups}
                      bizById={bizById}
                      onBiz={(id) => router.push({ pathname: '/business/[id]', params: { id } })}
                      onItem={open}
                      onAsk={() => setAskAll(true)}
                    />
                  ) : null}
                  <View style={styles.list}>
                    {(q && resultGroups.length ? [] : items).map((o, i) => (
                      <Reveal key={o.id} delay={i < 20 ? 60 + Math.min(i, 6) * 40 : 0} distance={6} duration={260}>
                        <OfferRow item={o} now={now} onPress={() => open(o)} />
                      </Reveal>
                    ))}
                    {all.isFetchingNextPage || (all.isLoading && !all.data) ? [0, 1].map((i) => <SkeletonBlock key={`sk${i}`} height={98} borderRadius={radius.lg} />) : null}
                    {all.data && !all.hasNextPage && items.length > 0 && !(q && resultGroups.length) ? <Text style={styles.end}>{endText(city, zoneName)}</Text> : null}
                    {all.data && (q ? resultGroups.length === 0 : items.length === 0) && !all.isFetching && !askSearchQuery.isFetching ? <EmptyOffers searching={Boolean(q || zoneId)} /> : null}
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
      <AskManySheet visible={askAll} product={q} items={resultGroups.map((g) => g.items[0])} onClose={() => setAskAll(false)} />
      <MarketItemSheet item={selectedItem} onClose={() => setSelectedItem(null)} pool={askPool} onPick={setSelectedItem} />
      <FiltersSheet
        visible={filtersOpen}
        zones={[...(coords ? [{ id: '', name: 'Cerca de ti', on: !picked }] : []), ...(data?.zones ?? []).map((z) => ({ id: z.id, name: z.name, on: picked?.id === z.id }))]}
        onZone={pickZone}
        show={show}
        onShow={setVitrinaFilter}
        sorts={sortOptions(hasLoc)}
        sort={sortNow}
        onSort={setSort}
        openOnly={openOnly}
        onOpenOnly={setOpenOnly}
        onClear={clearFilters}
        onClose={() => setFiltersOpen(false)}
      />
      <BizVitrinaSheet
        face={face}
        offers={face ? knownOffers.filter((o) => o.entity_id === face.id) : []}
        catalog={face ? (catalogsByEntity[face.id] ?? []) : []}
        now={now}
        onOffer={(o) => {
          setFace(null);
          open(o);
        }}
        onBusiness={(id) => {
          setFace(null);
          router.push({ pathname: '/business/[id]', params: { id } });
        }}
        onClose={() => setFace(null)}
      />
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
  moreLink: { marginHorizontal: 20, minHeight: 48, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  moreLinkText: { fontFamily: fonts.ui.semibold, fontSize: 15, color: colors.ink },
  peek: { marginHorizontal: 20, padding: 14, gap: 12, borderRadius: 20, backgroundColor: colors.surface },
  peekRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  peekCell: { flex: 1, gap: 4 },
  // Sin ofertas cerca, lo que venden se ve más grande: seis, en dos filas (nunca un aviso vacío)
  peekCellWide: { flex: 0, width: '31%' },
  peekImg: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.bg },
  peekText: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.ink, textAlign: 'center' },
  barrios: { gap: 20, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: -8 },
  barrio: { minHeight: 44, justifyContent: 'flex-end', gap: 8 },
  barrioText: { fontFamily: fonts.ui.semibold, fontSize: 15, color: colors.muted },
  barrioOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  barrioBar: { height: 3, borderRadius: 2, backgroundColor: 'transparent', marginBottom: -1 },
  barrioBarOn: { backgroundColor: colors.primary },
  lensBar: { gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 },
  emptyCard: { marginHorizontal: 20, padding: 18, gap: 10, borderRadius: 20, backgroundColor: colors.surface },
  pad: { paddingHorizontal: 20, gap: 14 },
  field: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 5, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  fieldText: { flex: 1, minWidth: 0, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted },
  fieldMic: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sandSoft },
  miniField: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  tilesLabel: { marginTop: 6, marginBottom: -6, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { gap: 28, paddingBottom: 120 },
  wash: { position: 'absolute', left: 0, right: 0, top: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  roundDot: { position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.surface },
  zoneWrap: { marginHorizontal: 20, marginTop: -8 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20 },
  hero: { fontSize: 20, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  quietLine: { paddingHorizontal: 20, fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  vitrinaPills: { gap: 8, paddingHorizontal: 20 },
  vitrinaPill: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  vitrinaPillOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  vitrinaPillText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  vitrinaPillTextOn: { color: colors.ink },
  searchWrap: { paddingHorizontal: 20 },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 52, paddingHorizontal: spacing.lg, borderRadius: 26, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...softShadow },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink, paddingVertical: 0 },
  mini: { position: 'absolute', left: 0, right: 0, zIndex: 5, height: MINI_H, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, backgroundColor: 'rgba(245,238,225,0.97)', borderBottomWidth: 1, borderBottomColor: colors.hairline },
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
  sec: { gap: 12 },
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
  planTitle: { fontSize: 20, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
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
