import { Ionicons } from '@/components/Icon';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ScreenGlow } from '@/components/ScreenGlow';
import { artKeyFor, artKeyMatch } from '@/components/CategoryArt';
import { focusReasonRow, forYou, forYouHeader, myInterests, peopleInterests, seenBusinesses } from '@/lib/interests';
import { learnPlaceSuffixes, otherZone, rowNames } from '@/lib/businessName';
import { FEW_BUSINESSES } from '@/lib/fewBusinesses';
import { openStatus } from '@/lib/openStatus';
import { noteInterest, useInterestSignals } from '@/lib/interestStore';
import { BusinessArt, CategoryIllustration } from '@/components/CategoryIllustration';
import { artCounts, closeChip, hourLabel } from '@/lib/offerHome';
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
import { HomeSearchBar, HomeSearchPanel, type HomeCat } from '@/components/home/HomeSearch';
import { handOffItem } from '@/lib/offerHandoff';
import { SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { ZoneButton, ZoneList } from '@/components/ZoneButton';
import { mediaUrl, resolveImageUrl } from '@/lib/image';
import { dayLabel, stripEntries } from '@/lib/novedades';
import { onFootOrDistance } from '@/lib/format';
import { endingToday, mergeCatalogIntoMarket, priceView } from '@/lib/offerMarket';
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
 * Inicio (tablero «Inicio a la puerta», 2026-11-14), en el orden de las apps de barrio que más se usan: dónde estás,
 * buscar (abre el buscador del mapa), las categorías con cuántos negocios hay, el mapa, tus negocios, lo abierto ahora
 * con cuándo cierra, una línea hacia Ofertas y, al bajar, el muro. Empre AI sigue en el botón Empre. Con pocos datos
 * cada parte se esconde (buscar y el mapa siempre están): nunca se rellena con datos inventados.
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
  // Buscar en el inicio (2026-11-22): filtra lo del inicio en vez de abrir el mapa.
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [searchCat, setSearchCat] = useState<HomeCat | null>(null);
  const searchRef = useRef<TextInput>(null);
  const stopSearch = () => {
    setSearching(false);
    setQuery('');
    setSearchCat(null);
    Keyboard.dismiss();
  };
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

  const open = useQuery({ queryKey: ['home-near', ...placeKey], queryFn: () => discoveryApi.discover({ ...place, limit: 40 }), staleTime: 60_000 });
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
  // Las categorías de arriba: solo las que tienen negocios cerca, juntadas por su dibujo, con el número real.
  const cats = useMemo(() => artCounts(discovery, artKeyFor, 8), [discovery]);
  // Hoy en tu barrio: las ofertas que terminan hoy; aquí solo se cuentan, se ven en Ofertas.
  const endingSoon = useMemo(() => endingToday(marketItems, now, new Set(), 20), [marketItems, now]);

  const newsAll = useMemo(() => news.data ?? [], [news.data]);
  const unseen = newsAll.filter((n) => n.unseen);
  const strip = useMemo(() => stripEntries(newsAll), [newsAll]);

  // Para ti (cuando todavía no sigues a nadie): lo que más buscas manda, lo que ya miraste vuelve y lo que busca la
  // gente del barrio completa. Todo sale de señales guardadas solo en este teléfono (src/lib/interests.ts).
  const signals = useInterestSignals();
  const mine = useMemo(() => myInterests(signals, now), [signals, now]);
  const seen = useMemo(() => seenBusinesses(signals, now), [signals, now]);
  const people = useMemo(() => peopleInterests((market.data?.searched.terms ?? []).map((t) => t.label || t.term), artKeyMatch), [market.data]);
  const forYouPicks = useMemo(() => (strip.length ? [] : forYou(discovery, mine, people, seen, artKeyFor, 8)), [strip.length, discovery, mine, people, seen]);
  const forYouHead = forYouPicks.length ? forYouHeader(mine, people) : null;
  // Si todos (o al menos cuatro) están por la misma razón («Lo viste hace poco»), la razón va una vez en el título, la
  // fila se queda con esos y debajo de cada uno va lo que lo distingue; el resto sigue en «Abierto ahora cerca».
  const forYouRow = useMemo(() => focusReasonRow(forYouPicks), [forYouPicks]);
  const forYouShown = forYouRow.picks;
  const forYouShared = forYouRow.title;
  // Los nombres sin el barrio («Helados del Mar Mamatoco» → «Helados del Mar»), salvo dos sedes juntas. Los barrios
  // salen de las zonas registradas y de los mismos nombres cercanos (las zonas registradas son pocas).
  const zoneNames = useMemo(() => [...zones.map((z) => z.name), ...learnPlaceSuffixes(discovery.map((b) => b.name))], [zones, discovery]);

  // Abierto ahora cerca: lo más cercano primero, con cuándo cierra; sin repetir lo que ya salió en «Para ti».
  const openCards = useMemo(() => {
    const sorted = [...openNear].sort((a, b) => a.distance_meters - b.distance_meters);
    const shown = new Set(forYouShown.map((p) => p.item.id));
    const rest = sorted.filter((b) => !shown.has(b.id));
    return (rest.length >= 2 ? rest : sorted).slice(0, 8);
  }, [openNear, forYouShown]);

  // Al bajar: un muro corto tipo Pinterest de lo que ofrecen los negocios cerca (tablero «Inicio», teléfono 2). Solo lo
  // que publicaron, seis para no saturar; al tocar uno se abre en Ofertas, con su media hoja (los componentes se pasan
  // la mano: Inicio no repite lo que ya hace Ofertas).
  const pins: MuroPin[] = marketItems.slice(0, 6).map((m) => {
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
      onPress: () => {
        handOffItem(m);
        router.push('/(tabs)/offers');
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

  // Cuántos negocios hay a la puerta: el número sale de lo que encontró el mapa, nunca inventado.
  const nearCount = discovery.length;
  // Poco volumen: con menos de 8 negocios cerca, las filas repetirían los mismos negocios. Se muestra una sola lista
  // donde cada uno sale una vez (sin los que ya sigues), abiertos primero y luego por cercanía.
  const few = nearCount > 0 && nearCount < FEW_BUSINESSES;
  const followedIds = new Set(strip.map((w) => w.entityId));
  const fewList = few ? [...discovery].filter((b) => !followedIds.has(b.id)).sort((a, b) => Number(Boolean(b.is_open_now)) - Number(Boolean(a.is_open_now)) || a.distance_meters - b.distance_meters) : [];
  const fewNames = rowNames(fewList.map((b) => b.name), zoneNames);
  const reasonById = new Map(forYouPicks.map((p) => [p.item.id, p.reason]));

  // Los nombres de cada fila, sin el barrio (dos sedes juntas quedan completas).
  const stripNames = rowNames(strip.map((w) => w.name), zoneNames);
  const forYouNames = rowNames(forYouShown.map((p) => p.item.name), zoneNames);
  const openNames = rowNames(openCards.map((b) => b.name), zoneNames);
  // Cuando la razón va en el título, debajo de cada uno: cuándo cierra si es pronto, si no el tipo y a cuánto queda.
  const distinct = (b: (typeof forYouPicks)[number]['item']) => {
    const chip = closeChip(b.closes_at, now);
    if (chip?.soon) return chip.text;
    return [b.category_name, b.distance_meters != null ? onFootOrDistance(b.distance_meters / 1000) : null].filter(Boolean).join(' · ');
  };

  return (
    <View style={styles.screen}>
      <ScreenGlow />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="handled">
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

          {/* Buscar: filtra lo del inicio (recientes, sugeridos y categorías al tocarla; productos, servicios y negocios al escribir) */}
          <HomeSearchBar
            ref={searchRef}
            value={query}
            active={searching}
            onChange={(v) => {
              setQuery(v);
              setSearching(true);
            }}
            onFocus={() => setSearching(true)}
            onSubmit={() => Keyboard.dismiss()}
            onCancel={stopSearch}
          />

          {searching ? (
            <HomeSearchPanel
              query={query}
              cat={searchCat}
              cats={cats}
              discovery={discovery}
              center={center ?? null}
              onQuery={(q) => {
                setQuery(q);
                Keyboard.dismiss();
              }}
              onCat={(c) => {
                setSearchCat(c);
                if (c) noteInterest('category', c.key);
                Keyboard.dismiss();
              }}
              onOpenBusiness={(b) => setCard({ ...b, distanceKm: b.distance_meters != null ? b.distance_meters / 1000 : null } as unknown as WithDistance)}
            />
          ) : (
          <>
          {/* Las categorías con lo que hay: cada una filtra el inicio */}
          {cats.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.catsIn}>
              {cats.map((c) => (
                <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={`${c.label}, ${c.count} ${c.count === 1 ? 'negocio' : 'negocios'} cerca`} onPress={() => {
                    noteInterest('category', c.key);
                    // Filtra el inicio por esa categoría (productos, servicios y negocios), sin ir al mapa.
                    setSearchCat(c);
                    setSearching(true);
                  }} style={({ pressed }) => [styles.cat, pressed && styles.pressed]}>
                  <CategoryIllustration k={c.key} size={34} />
                  <Text style={styles.catText}>{c.label}</Text>
                  <Text style={styles.catCount}>{c.count}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

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
              <SkeletonBlock height={196} borderRadius={22} />
              <Text style={styles.loadingText}>Buscando negocios cerca…</Text>
            </View>
          ) : (
            <View style={styles.mapBlock}>
              {/* La promesa, como título de sección: ya no ocupa media pantalla */}
              <View style={styles.secHead}>
                <Text style={styles.secTitle} accessibilityRole="header">
                  A la puerta de tu casa
                </Text>
                {nearCount > 1 ? <Text style={styles.secCount}>{`${nearCount} negocios`}</Text> : null}
              </View>
              <PuertaMapa items={mapItems} center={center} openCount={openNear.length} ticker={[]} whenOf={(iso) => whenLabel(iso, now)} onExplore={openExplore} />
            </View>
          )}

          {strip.length ? (
            <View style={styles.section}>
              <View>
                <Text style={styles.secTitle} accessibilityRole="header">
                  Tus negocios
                </Text>
                <Text style={styles.secSub}>El anillo rojo: publicó algo nuevo</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.followIn}>
                {strip.map((w, i) => (
                  <Pressable key={w.entityId} accessibilityRole="button" accessibilityLabel={`${stripNames[i].name}${w.ring === 'offer' ? ', oferta nueva' : w.ring === 'post' ? ', publicó' : ''}`} onPress={() => router.push({ pathname: '/business/[id]', params: { id: w.entityId } })} style={styles.follow}>
                    <View style={[styles.followRing, { borderColor: w.ring === 'none' ? colors.line : colors.brandRef }]}>
                      <Avatar uri={w.profileUrl} name={stripNames[i].name} size={56} />
                    </View>
                    <Text style={styles.followName} numberOfLines={2}>
                      {stripNames[i].name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Para ti: cuando no sigues a nadie, lo que más buscas y lo que busca la gente; cada uno dice por qué está */}
          {!few && forYouHead && forYouShown.length ? (
            <View style={styles.section}>
              {/* Solo el título: el porqué va debajo de cada negocio; si es el mismo para todos, va aquí una vez */}
              <Text style={styles.secTitle} accessibilityRole="header">
                {forYouShared ?? forYouHead.title}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.followIn}>
                {forYouShown.map(({ item: b, reason, source }, i) => {
                  const name = forYouNames[i].name;
                  const why = forYouShared ? distinct(b) : reason;
                  return (
                    <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${name}. ${why}`} onPress={() => router.push({ pathname: '/business/[id]', params: { id: b.id } })} style={({ pressed }) => [styles.follow, styles.forYou, pressed && styles.pressed]}>
                      <View style={[styles.followRing, { borderColor: source === 'visto' ? colors.ink : colors.line }]}>
                        <Avatar uri={b.profile_url} name={name} size={56} />
                      </View>
                      <Text style={styles.followName} numberOfLines={2}>
                        {name}
                      </Text>
                      <Text style={styles.forWhy} numberOfLines={2}>
                        {why}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Abierto ahora cerca: cuándo cierra y a cuántos pasos (como DoorDash y Too Good To Go) */}
          {!few && openCards.length ? (
            <View style={styles.section}>
              <View style={styles.secHead}>
                <Text style={styles.secTitle} accessibilityRole="header">
                  Abierto ahora cerca
                </Text>
                <Pressable accessibilityRole="link" accessibilityLabel="Ver todos los abiertos en el mapa" hitSlop={8} onPress={() => router.push({ pathname: '/map', params: { abierto: '1' } })} style={styles.seeAll}>
                  <Text style={styles.seeAllText}>Ver todos</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.openIn}>
                {openCards.map((b, i) => {
                  const photo = resolveImageUrl(b.photos?.[0]) ?? resolveImageUrl(b.profile_url);
                  const chip = closeChip(b.closes_at, now);
                  const walk = onFootOrDistance(b.distance_meters / 1000);
                  const { name, sede } = openNames[i];
                  const away = otherZone(sede, zoneName);
                  return (
                    <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={[name, away, b.category_name, chip?.text, walk].filter(Boolean).join(', ')} onPress={() => router.push({ pathname: '/business/[id]', params: { id: b.id } })} style={({ pressed }) => [styles.openCard, pressed && styles.pressed]}>
                      <View style={styles.openImg}>
                        {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : <BusinessArt k={artKeyFor(b.category_name, b.category_icon)} size={156} round={false} />}
                        {chip ? <Text style={[styles.openChip, chip.soon && { color: colors.primaryDark }]}>{chip.text}</Text> : null}
                      </View>
                      <Text style={styles.openName} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.openSub} numberOfLines={1}>
                        {[away ?? b.category_name, walk].filter(Boolean).join(' · ')}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Poco volumen: cada negocio una vez, con lo suyo (abierto o no, a cuánto queda y por qué te sale) */}
          {fewList.length ? (
            <View style={styles.section}>
              <View style={styles.secHead}>
                <Text style={styles.secTitle} accessibilityRole="header">
                  Todo lo que hay cerca
                </Text>
                <Text style={styles.secCount}>{fewList.length === 1 ? '1 negocio' : `${fewList.length} negocios`}</Text>
              </View>
              <View style={styles.fewList}>
                {fewList.map((b, i) => {
                  const photo = resolveImageUrl(b.photos?.[0]) ?? resolveImageUrl(b.profile_url);
                  const said = openStatus(b.has_hours === false ? null : b.is_open_now, b.closes_at, now);
                  const walk = onFootOrDistance(b.distance_meters / 1000);
                  const name = fewNames[i].name;
                  const status = said?.text ?? null;
                  const why = reasonById.get(b.id);
                  return (
                    <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={[name, b.category_name, walk, status, why].filter(Boolean).join(', ')} onPress={() => router.push({ pathname: '/business/[id]', params: { id: b.id } })} style={({ pressed }) => [styles.fewRow, i > 0 && styles.fewRowLine, pressed && styles.pressed]}>
                      <View style={styles.fewImg}>
                        {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : <BusinessArt k={artKeyFor(b.category_name, b.category_icon)} size={64} round={false} />}
                      </View>
                      <View style={styles.fewBody}>
                        <Text style={styles.fewName} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.fewSub} numberOfLines={1}>
                          {[b.category_name, walk].filter(Boolean).join(' · ')}
                        </Text>
                        {status || why ? (
                          <View style={styles.fewStatus}>
                            {said?.open ? <View style={styles.fewDot} /> : null}
                            <Text style={[styles.fewStatusText, said?.soon && { color: colors.primaryDark }, said && !said.open && { color: colors.muted }]} numberOfLines={1}>
                              {[status, why].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </Pressable>
                  );
                })}
              </View>
              {/* El poco volumen juega a favor: Empre está empezando aquí y cualquiera puede sumar su negocio */}
              <Pressable accessibilityRole="button" onPress={() => router.push('/business/new')} style={({ pressed }) => [styles.invite, pressed && styles.pressed]}>
                <View style={styles.inviteIcon}>
                  <Ionicons name="storefront-outline" size={20} color={colors.ink} />
                </View>
                <View style={styles.todayBody}>
                  <Text style={styles.todayTitle}>{`Empre está empezando en ${zoneName ?? 'tu barrio'}`}</Text>
                  <Text style={styles.todaySub} numberOfLines={2}>
                    ¿Tienes un negocio cerca? Súmalo gratis en 2 minutos.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}

          {/* Hoy en tu barrio: una línea que lleva a Ofertas; aquí las ofertas no se repiten */}
          {endingSoon.length ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/offers')} style={({ pressed }) => [styles.today, pressed && styles.pressed]}>
              <View style={styles.todayIcon}>
                <Ionicons name="pricetag-outline" size={20} color={colors.ink} />
              </View>
              <View style={styles.todayBody}>
                <Text style={styles.todayTitle}>{endingSoon.length === 1 ? '1 oferta termina hoy' : `${endingSoon.length} ofertas terminan hoy`}</Text>
                <Text style={styles.todaySub} numberOfLines={1}>
                  {[
                    hourLabel(endingSoon[0].ends_at) ? `La primera termina a las ${hourLabel(endingSoon[0].ends_at)}` : null,
                    endingSoon[0].distance_meters != null ? `a ${onFootOrDistance(endingSoon[0].distance_meters / 1000)}` : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
          </>
          )}
        </View>

        {!searching ? (
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
              <Pressable accessibilityRole="link" onPress={() => router.push('/(tabs)/offers')} style={({ pressed }) => [styles.moreOffers, pressed && styles.pressed]}>
                <Text style={styles.moreOffersText}>Ver todo en Ofertas</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.ink} />
              </Pressable>
            </View>
          ) : (
            <SystemSection title="Cerca de ti">
              <SystemGroup>
                <SystemRow first icon="map-outline" tag="Para empezar" title="Mira el mapa de tu barrio" sub="Cuando los negocios publiquen, aquí verás lo que ofrecen" onPress={() => router.push('/map')} />
              </SystemGroup>
            </SystemSection>
          )}
        </View>
        ) : null}
        <BusinessCardModal entity={card} onClose={() => setCard(null)} origin="home" />
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
              borderRadius: grow.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  door: { position: 'absolute', zIndex: 20, backgroundColor: colors.sand },
  content: { paddingBottom: 96, gap: 14 }, // el botón Empre flota encima: lo último no queda debajo
  pad: { paddingHorizontal: 16, gap: 14 },
  body: { gap: 26, paddingTop: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  me: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zone: { flex: 1, minWidth: 0 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  bellDot: { position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.brandRef },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  search: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  searchText: { flex: 1, fontSize: 15, fontFamily: fonts.ui.medium, color: colors.muted },
  searchWithMic: { paddingRight: 14 },
  searchMic: { width: 36, height: 36, marginRight: -8, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sandSoft },
  catsIn: { gap: 8, paddingHorizontal: 16, paddingVertical: 2 },
  cat: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 5, paddingRight: 14, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  catText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  catCount: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, fontVariant: ['tabular-nums'] },
  mapBlock: { gap: 10, marginTop: 4 },
  secHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  secCount: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  seeAll: { minHeight: 44, justifyContent: 'center' },
  seeAllText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  openIn: { gap: 12, paddingHorizontal: 16 },
  openCard: { width: 156, gap: 5 },
  openImg: { width: 156, height: 104, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.sandSoft },
  openChip: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(255,254,251,0.95)', fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.ink },
  openName: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink, paddingHorizontal: 2 },
  openSub: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted, paddingHorizontal: 2, marginTop: -3 },
  today: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  todayIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  todayBody: { flex: 1, gap: 2 },
  todayTitle: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  todaySub: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  where: { gap: 12, padding: 16, borderRadius: 22, backgroundColor: colors.surface },
  whereTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  whereText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  whereBtn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandRef },
  whereBtnText: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  whereZones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  whereZone: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  whereZoneText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  loadingText: { position: 'absolute', left: 16, bottom: 16, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  section: { gap: 12 },
  secTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  secSub: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 2 },
  rail: { marginHorizontal: -16 },
  followIn: { gap: 16, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  follow: { width: 72, alignItems: 'center', gap: 6 },
  followRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  followName: { fontSize: 12, lineHeight: 15, fontFamily: fonts.ui.medium, color: colors.ink, textAlign: 'center' },
  forYou: { width: 84 },
  moreOffers: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  moreOffersText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  forWhy: { fontSize: 11, lineHeight: 14, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center', marginTop: -3 },
  fewList: { borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  fewRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  fewRowLine: { borderTopWidth: 1, borderTopColor: colors.hairline },
  fewImg: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.sandSoft },
  fewBody: { flex: 1, minWidth: 0, gap: 2 },
  fewName: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  fewSub: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  fewStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fewDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brandRef },
  fewStatusText: { flexShrink: 1, fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.ink },
  invite: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: colors.well },
  inviteIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
