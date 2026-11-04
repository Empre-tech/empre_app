import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { categoriesApi } from '@/api/endpoints';
import { offersApi } from '@/api/offers';
import { Button } from '@/components/Button';
import { UpdatingBar } from '@/components/explore/LoadingMotion';
import { Reveal, RollText } from '@/components/offers/MarketMotion';
import { FeaturedOffer, OfferRow, OfferTile, TILE_GAP, TILE_W, ZONE_W, ZoneCard } from '@/components/offers/OfferTiles';
import { SkeletonBlock } from '@/components/Skeleton';
import { loadLastCity, saveLastCity } from '@/lib/lastCityStore';
import { planKey, planLevel, planTitle } from '@/lib/plans';
import {
  effectiveSort,
  endText,
  flattenPages,
  pesos,
  listTitle,
  nearEnd,
  shortCategory,
  showZones,
  sortOptions,
  visibleSections,
  zoneFilterOrder,
  type MarketItem,
  type MarketSort,
} from '@/lib/offerMarket';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { cardShadow, colors, fonts, radius, spacing } from '@/theme';

type Coords = { latitude: number; longitude: number };

const COMPACT_AT = 90; // px bajados para pasar a la barra compacta
const MINI_H = 52; // alto de la barra compacta (la lista no queda debajo al saltar a una zona)

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
  const sections = (q ? [] : visibleSections(data)).filter((s) => !(s === 'near' && ordered.length > 0));
  const zonesOn = !q && showZones(data);
  const zoneName = data?.zones.find((z) => z.id === zoneId)?.name;
  const zoneLabel = picked?.name ?? (coords ? data?.zone || 'Cerca de ti' : city || 'Tu ciudad');
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {(market.isFetching && data) || (all.isFetching && !all.isFetchingNextPage && all.data) ? <UpdatingBar /> : null}
      <Animated.View
        pointerEvents={compact ? 'auto' : 'none'}
        aria-hidden={!compact}
        style={[styles.mini, { top: insets.top, opacity: bar, transform: [{ translateY: bar.interpolate({ inputRange: [0, 1], outputRange: [-MINI_H, 0] }) }] }]}
      >
        <Text style={styles.miniCity} numberOfLines={1}>
          {city || 'Ofertas'}
        </Text>
        {hasLoc && data?.zone ? (
          <Text style={styles.miniZone} numberOfLines={1}>
            · {data.zone}
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

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled" onScroll={onScroll} scrollEventThrottle={64}>
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: zonesOpen }}
            accessibilityLabel={`${picked ? 'Estás viendo' : 'Estás en'} ${zoneLabel}. Cambiar de zona`}
            disabled={!data?.zones.length}
            onPress={() => setZonesOpen((v) => !v)}
            style={styles.zoneBtn}
          >
            <Ionicons name="location" size={18} color={colors.ink} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.zoneLead}>{picked ? 'Estás viendo' : 'Estás en'}</Text>
              <RollText text={zoneLabel} style={styles.zoneName} />
            </View>
            {data?.zones.length ? <Ionicons name={zonesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} /> : null}
          </Pressable>
          {zonesOpen ? (
            <View style={styles.zoneList}>
              {coords ? (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: !picked }} onPress={() => { setPicked(null); setPin(null); setZonesOpen(false); }} style={[styles.zoneRow, !picked && styles.zoneRowOn]}>
                  <Text style={styles.zoneRowText}>Cerca de ti</Text>
                </Pressable>
              ) : null}
              {(data?.zones ?? []).map((z) => (
                <Pressable
                  key={z.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked?.id === z.id }}
                  onPress={() => {
                    if (z.latitude && z.longitude) setPicked({ id: z.id, name: z.name, latitude: z.latitude, longitude: z.longitude });
                    else goToList(z.id);
                    setPin(null);
                    setZonesOpen(false);
                  }}
                  style={[styles.zoneRow, picked?.id === z.id && styles.zoneRowOn]}
                >
                  <Text style={styles.zoneRowText}>{z.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.hero} accessibilityRole="header">
            {zoneTitle}
          </Text>
        </View>

        {mapCenter && ordered.length ? (
          <View style={styles.mapCard}>
            <MapView
              key={`${mapCenter.latitude.toFixed(3)},${mapCenter.longitude.toFixed(3)}`}
              style={StyleSheet.absoluteFill}
              initialRegion={{ latitude: mapCenter.latitude, longitude: mapCenter.longitude, latitudeDelta: 0.014, longitudeDelta: 0.014 }}
              showsUserLocation={Boolean(coords) && !picked}
              toolbarEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              {ordered.map((o) => {
                const on = o.id === ordered[0].id;
                return (
                  <Marker
                    key={o.id}
                    coordinate={{ latitude: o.latitude!, longitude: o.longitude! }}
                    accessibilityLabel={`${o.entity_name}: ${o.title}`}
                    onPress={() => setPin(o.id)}
                    tracksViewChanges={false}
                  >
                    <View style={[styles.pin, on && styles.pinOn]}>
                      <Ionicons name="pricetag" size={on ? 18 : 15} color={colors.ink} />
                    </View>
                  </Marker>
                );
              })}
            </MapView>
            <Pressable accessibilityRole="button" onPress={() => router.push('/map')} style={styles.mapBtn}>
              <Ionicons name="expand" size={14} color={colors.ink} />
              <Text style={styles.mapBtnText}>Abrir mapa</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats} accessibilityLabel="Categorías">
          <Chip label="Todas" active={!catId} onPress={() => setCatId(undefined)} />
          {(categories.data ?? []).map((c) => (
            <Chip key={c.id} label={shortCategory(c.name)} active={catId === c.id} onPress={() => setCatId(catId === c.id ? undefined : c.id)} />
          ))}
        </ScrollView>

        {ordered.length ? (
          <View style={styles.sec}>
            {header(picked ? `En ${picked.name}, ahora` : 'Cerca de ti, ahora', 'Toca un pin y su oferta queda primero')}
            {rail(ordered)}
          </View>
        ) : null}

        <View style={styles.searchWrap}>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              ref={searchRef}
              value={text}
              onChangeText={setText}
              placeholder={city ? `Busca en ${city}` : 'Busca una oferta o un negocio'}
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
        </View>

        {!hasLoc && !q && ready ? (
          <View style={styles.loc}>
            <Text style={styles.locText}>
              {locAsked ? 'Sin permiso de ubicación no podemos decir qué está cerca.' : city ? 'Con tu ubicación te mostramos primero lo que está cerca.' : 'Con tu ubicación te mostramos las ofertas de tu ciudad.'}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void askLocation()} style={styles.locBtn}>
              <Text style={styles.locBtnText}>Activar</Text>
            </Pressable>
          </View>
        ) : null}

        {!data && (market.isLoading || !ready) ? (
          <View style={styles.sec}>
            <View style={styles.sh}>
              <SkeletonBlock width={140} height={18} />
            </View>
            <View style={styles.rail}>
              {[0, 1].map((i) => (
                <SkeletonBlock key={i} width={TILE_W} height={214} borderRadius={radius.lg} />
              ))}
            </View>
          </View>
        ) : null}

        {data?.routes.length && !q ? (
          <View style={styles.sec}>
            {header('Planes para hoy', 'Negocios distintos, un mismo recorrido')}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {data.routes.map((r) => (
                <Pressable
                  key={planKey(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${planTitle(r, city)}. ${planLevel(r.level)}, ${r.stops.length} paradas.${r.saving > 0 ? ` Ahorras ${pesos(r.saving)}.` : ''}`}
                  onPress={() => router.push({ pathname: '/plan', params: { plan: JSON.stringify(r), city } })}
                  style={({ pressed }) => [styles.planCard, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.planTag} numberOfLines={1}>
                    {[r.zone?.toUpperCase(), planLevel(r.level).toUpperCase()].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={styles.planTitle} numberOfLines={2}>
                    {planTitle(r, city)}
                  </Text>
                  {r.stops.map((s, i) => (
                    <View key={s.id} style={styles.planStop}>
                      <Text style={styles.planTime}>{r.times[i] ? new Date(r.times[i]!).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : `${i + 1}.`}</Text>
                      <Text style={styles.planBiz} numberOfLines={1}>
                        {s.entity_name}
                      </Text>
                    </View>
                  ))}
                  {r.saving > 0 ? <Text style={styles.planSaving}>Ahorras {pesos(r.saving)}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

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
                {all.isFetchingNextPage || (all.isLoading && !all.data)
                  ? [0, 1].map((i) => <SkeletonBlock key={`sk${i}`} height={98} borderRadius={radius.lg} />)
                  : null}
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

function Chip({ label, active, onPress, soft }: { label: string; active: boolean; onPress: () => void; soft?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && (soft ? styles.chipSoftOn : styles.chipOn), pressed && styles.chipPressed]}
    >
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
  top: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  zoneBtn: { alignSelf: 'flex-start', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zoneLead: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  zoneName: { fontSize: 15, lineHeight: 19, fontFamily: fonts.ui.extrabold, color: colors.ink },
  zoneList: { marginBottom: spacing.sm, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  zoneRow: { minHeight: 46, justifyContent: 'center', paddingHorizontal: spacing.md },
  zoneRowOn: { backgroundColor: colors.selectedSoft },
  zoneRowText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  mapCard: { height: 220, marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.selectedSoft, borderWidth: 1, borderColor: colors.line },
  mapBtn: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surface, ...cardShadow },
  mapBtnText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  pin: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.accent },
  pinOn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, borderWidth: 4 },
  searchWrap: { paddingHorizontal: spacing.lg },
  planCard: { width: 270, gap: 4, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  planTag: { fontSize: 11, letterSpacing: 0.6, fontFamily: fonts.ui.extrabold, color: colors.muted },
  planTitle: { fontSize: 17, lineHeight: 22, fontFamily: fonts.display.bold, color: colors.ink, marginBottom: 2 },
  planStop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planTime: { width: 68, fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  planBiz: { flex: 1, fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  planSaving: { marginTop: 4, fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  hero: { fontSize: 26, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink },
  search: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 52, paddingHorizontal: spacing.lg, borderRadius: 26, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...cardShadow },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink, paddingVertical: 0 },
  mini: { position: 'absolute', left: 0, right: 0, zIndex: 5, height: MINI_H, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: spacing.lg, paddingRight: spacing.xs, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line },
  miniCity: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, flexShrink: 0 },
  miniZone: { flex: 1, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  miniBtn: { marginLeft: 'auto', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cats: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 4 },
  terms: { gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.selectedSoft, borderColor: colors.selected },
  chipSoftOn: { backgroundColor: colors.selectedSoft, borderColor: colors.selected },
  chipPressed: { transform: [{ scale: 0.97 }] },
  chipText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  chipOnText: { color: colors.selected },
  chipSoftText: { color: colors.selected },
  loc: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  locText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  locBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primary, justifyContent: 'center' },
  locBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
  sec: { paddingTop: spacing.md },
  sh: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  shTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  shWhy: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  rail: { flexDirection: 'row', gap: TILE_GAP, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  none: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, paddingHorizontal: spacing.lg },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  end: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center', paddingVertical: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
