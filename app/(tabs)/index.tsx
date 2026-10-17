import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi, entitiesApi } from '@/api/endpoints';
import { claimsApi, discoverApi, discoveryApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import type { Category, DiscoverItem, DiscoveryItem, DiscoverSectionId } from '@/api/types';
import { Button } from '@/components/Button';
import { BusinessSheet } from '@/components/explore/BusinessSheet';
import { type CardModel } from '@/components/explore/ExploreCards';
import { AllCategoriesModal } from '@/components/explore/AllCategoriesModal';
import { GroupRow } from '@/components/explore/GroupRow';
import { ExploreSheet } from '@/components/explore/ExploreSheet';
import { type WithDistance } from '@/components/explore/FeaturedCard';
import { PinMarker } from '@/components/explore/PinMarker';
import { BubbleMarker } from '@/components/explore/BubbleMarker';
import { useMapLevel, useMapMarkers } from '@/components/explore/useMapMarkers';
import { useZoneName, useZones } from '@/components/explore/useZoneName';
import { track } from '@/analytics/track';
import { ContextRow } from '@/components/explore/ContextRow';
import { LoadingChip } from '@/components/explore/LoadingChip';
import { LocationStrip } from '@/components/explore/LocationStrip';
import { PlaceSheet } from '@/components/explore/PlaceSheet';
import { PhotoViewer, type ViewerTarget } from '@/components/explore/PhotoViewer';
import { MapLabelMarker } from '@/components/explore/MapLabelMarker';
import { MapLegend, YouDot, YOU_DOT } from '@/components/explore/MapReferences';
import { ExploreGuide, type GuideRect } from '@/components/explore/ExploreGuide';
import { StackMarker } from '@/components/explore/StackMarker';
import { SearchBar } from '@/components/explore/SearchBar';
import { useFeaturedSheet } from '@/components/explore/useFeaturedSheet';
import { DEFAULT_REGION } from '@/config';
import { categoryColor } from '@/lib/categoryColor';
import { buildGroups, categoryFilter, groupIdOf, type GroupId } from '@/lib/categoryGroups';
import { focusCenterLat } from '@/lib/placeCard';
import { stripText } from '@/lib/locationStrip';
import { photoTotal } from '@/lib/photoStrip';
import { anyHiddenBelow, boxCenter, displayIcon, nearestTo, pointerAngle, showYouDot, toScreen, usefulBox } from '@/lib/mapView';
import { shouldAutoStart } from '@/lib/exploreGuide';
import { loadGuideSeen, saveGuideSeen } from '@/lib/exploreGuideStore';
import { snippetLines } from '@/lib/reviewSnippet';
import { effectiveClaimStatus } from '@/lib/claims';
import { boxAround, EXTRAS_MAX, ZONE_FICHA_MAX, openLine, pickExtras, reasonPill, relatedFrom, SEARCH_NEAR_KM, sheetHeader } from '@/lib/discover';
import { formatDistance } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { allWithinMeters, type Cluster } from '@/lib/cluster';
import { FETCH_FACTOR, mergePins, needsRefetch, padBox, visibleInOrder, type Box } from '@/lib/mapArea';
import { distanceKm, hasLocation, type Coords } from '@/lib/geo';
import { contextChips, removedAnnouncement, type FilterId } from '@/lib/context';
import { sameIds } from '@/lib/pinsCache';
import { loadPinsCache, savePinsCache } from '@/lib/pinsCacheStore';
import { isBubbleLevel } from '@/lib/mapLevels';
import { NEAR_ME_M, zoneAt } from '@/lib/zoneName';
import { cameraTargets, emphasize, isFarResult } from '@/lib/proximity';
import { MAP_STYLE } from '@/lib/mapStyle';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

/** Opciones del filtro "cerca de mí". `null` = sin límite de distancia. */
const RADIUS_OPTIONS: { label: string; km: number | null }[] = [
  { label: 'Cualquier distancia', km: null },
  { label: 'Menos de 1 km', km: 1 },
  { label: 'Menos de 3 km', km: 3 },
  { label: 'Menos de 5 km', km: 5 },
  { label: 'Menos de 10 km', km: 10 },
  { label: 'Menos de 20 km', km: 20 },
  { label: 'Menos de 60 km', km: 60 },
];


/** Alto estimado de la ficha del negocio mientras no se mide (para encuadrar el mapa sin esperar). */
const SHEET_ESTIMATE = 300;

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [categoryId, setCategoryId] = useState<string | undefined>();
  // El grupo elegido (filtra por todas sus categorías) y, dentro, opcionalmente una categoría.
  const [groupId, setGroupId] = useState<GroupId | undefined>();
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>();
  const [allCatsOpen, setAllCatsOpen] = useState(false);
  // Alto medido de la ficha del negocio elegido (0 = aún no medido).
  const [sheetH, setSheetH] = useState(0);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  // Región con la que se monta el mapa la PRIMERA vez: null mientras no
  // sabemos todavía si conviene arrancar ya centrados en el usuario (si ya
  // había dado permiso antes) o mostrar la vista general de todo el país
  // (si no, o si no hay una posición reciente a mano). Evita el "salto" de
  // ver primero Colombia completa y luego animar hacia la ubicación real.
  const [startupRegion, setStartupRegion] = useState<Region | null>(null);
  // `region` arranca en el país entero; el mapa no siempre avisa su región inicial hasta que se mueve.
  // Sin esto el nivel del mapa (burbujas) y la zona pedida al servidor salían del país, y el mapa
  // quedaba vacío hasta tocarlo. En cuanto se sabe con qué región se monta el mapa, esa es la real.
  const [regionSynced, setRegionSynced] = useState(false);
  if (startupRegion !== null && !regionSynced) {
    setRegionSynced(true);
    setRegion(startupRegion);
  }
  // Negocio seleccionado: tocar un pin o una tarjeta abre su detalle (franja, Ver perfil, Cómo llegar).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mientras el dedo mueve el mapa: el panel compacto baja un poco y el buscador se desvanece.
  const [mapMoving, setMapMoving] = useState(false);
  // Negocios de una pila que comparten un mismo punto: se abren en «En este lugar».
  const [placeItems, setPlaceItems] = useState<WithDistance[] | null>(null);
  // Vista del panel: Descubre (por defecto) o la lista (Todos / Resultados).
  const [view, setView] = useState<'discover' | 'results'>('discover');
  // «Ver más» de una sección de Descubre: la lista filtrada por esa sección.
  const [sectionFilter, setSectionFilter] = useState<DiscoverSectionId | null>(null);
  // Alcance de la búsqueda: por defecto alrededor de la persona («near», 5 km); «zone» tras «Buscar en esta zona»;
  // null = sin límite, solo si la persona pide «Buscar más lejos».
  const [searchArea, setSearchArea] = useState<{ min_lat: number; max_lat: number; min_lng: number; max_lng: number; kind: 'near' | 'zone' } | null>(null);
  // Con una búsqueda activa, mover el mapa no busca solo: aparece «Buscar en esta zona».
  const [areaDirty, setAreaDirty] = useState(false);
  // Distingue un arrastre del usuario de un movimiento hecho por la app (centrar, encuadrar).
  const userMovedRef = useRef(false);
  // Respaldo: si el arrastre termina sin que cambie la región, onRegionChangeComplete
  // no se dispara y el panel se quedaría bajado; este temporizador lo devuelve.
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
    },
    [],
  );
  const onMapDrag = () => {
    userMovedRef.current = true;
    if (!mapMoving) setMapMoving(true);
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => setMapMoving(false), 1500);
  };
  // El mapa terminó de moverse: sin búsqueda se actualiza la zona (y Descubre);
  // con búsqueda solo se ofrece buscar en la zona nueva. El panel no cambia de estado.
  const onMapSettled = (next: Region) => {
    setRegion(next);
    if (moveTimer.current) clearTimeout(moveTimer.current);
    setMapMoving(false);
    if (userMovedRef.current && debouncedSearch) setAreaDirty(true);
    userMovedRef.current = false;
  };
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const sheet = useFeaturedSheet(mapSize.height);
  // Alto real de lo que flota arriba (franja, buscador y categorías): el área útil y los encuadres lo dejan libre.
  const [topH, setTopH] = useState(0);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [openNow, setOpenNow] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  // Distingue "sin permiso" de "tardó/falló obteniendo el GPS", para poder mostrar
  // un mensaje útil en vez de repetir "necesitamos tu ubicación" sin explicar qué pasó.
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Evita volver a centrar automáticamente cada vez que se remonta el MapView
  // (p. ej. al alternar entre mapa y lista); solo centramos la primera vez.
  const didCenterRef = useRef(false);

  // No golpeamos el backend en cada tecla: esperamos una pausa corta.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  const requestLocation = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationDenied(true);
        return null;
      }
      setLocationDenied(false);
      // Con GPS débil (adentro de un edificio, etc.) esto puede quedarse colgado; sin límite
      // de tiempo el botón "Usar mi ubicación" parece no hacer nada. Si tarda más de 12s,
      // lo tratamos como error y se lo explicamos al usuario en vez de dejarlo esperando.
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
      ]);
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setUserCoords(coords);
      return coords;
    } catch (error) {
      setLocationError(
        error instanceof Error && error.message === 'timeout'
          ? 'Tardamos demasiado en obtener tu ubicación. Revisa que el GPS esté activado e intenta de nuevo.'
          : 'No pudimos obtener tu ubicación. Revisa que la ubicación del celular esté activada e intenta de nuevo.',
      );
      return null;
    } finally {
      setLocating(false);
    }
  };

  // Antes de montar el mapa: si ya teníamos permiso de ubicación de una vez
  // anterior, intenta arrancar YA centrados en el usuario usando una posición
  // reciente en caché (getLastKnownPositionAsync es casi instantáneo, a
  // diferencia de pedir un fix nuevo de GPS). Con permiso pero sin caché,
  // dejamos el loading y el fix fresco recentra en cuanto llega; solo si NO
  // hay permiso caemos a la vista del país (no hay cómo ubicar al usuario).
  useEffect(() => {
    let active = true;
    (async () => {
      let granted = false;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        granted = permission.status === 'granted';
        if (granted) {
          const last = await Promise.race([
            Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
          ]);
          if (!active) return;
          if (last) {
            const coords = { latitude: last.coords.latitude, longitude: last.coords.longitude };
            setUserCoords(coords);
            setStartupRegion({ ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 });
            // Ya arrancamos centrados en la posición real: que el efecto de
            // abajo no la vuelva a animar encima cuando llegue el fix fresco.
            didCenterRef.current = true;
            return;
          }
        }
      } catch {
        // Sigue al fallback de abajo.
      }
      // Sin permiso concedido: no hay forma de centrar en el usuario.
      if (active && !granted) setStartupRegion(DEFAULT_REGION);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Con permiso concedido pero sin posición en caché, el mapa espera (loading)
  // al fix fresco: en cuanto llega, arranca centrado en el usuario (nunca la
  // vista del país completo).
  useEffect(() => {
    if (startupRegion === null && userCoords) {
      setStartupRegion({ ...userCoords, latitudeDelta: 0.03, longitudeDelta: 0.03 });
      didCenterRef.current = true;
    }
  }, [startupRegion, userCoords]);

  // Pide la ubicación del usuario (permite centrar el mapa y ordenar/filtrar por distancia).
  // Esto PIDE el permiso si todavía no se ha concedido, y en cualquier caso
  // trae un fix fresco y preciso (el "last known" de arriba es solo para
  // arrancar rápido, no reemplaza este fix).
  useEffect(() => {
    let active = true;
    (async () => {
      const coords = await requestLocation();
      if (!active || !coords) return;
    })();
    return () => {
      active = false;
    };
  }, []);

  // Centra el mapa en la ubicación del usuario apenas tenemos AMBAS cosas: las
  // coordenadas y que el MapView nativo ya terminó de montarse. Si se llama a
  // animateToRegion antes de que el mapa esté listo (típico en un arranque en
  // frío, la primera vez que se abre la app), la llamada se pierde en
  // silencio y el mapa se queda en la región por defecto.
  useEffect(() => {
    if (didCenterRef.current || !mapReady || !userCoords) return;
    didCenterRef.current = true;
    mapRef.current?.animateToRegion({ ...userCoords, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
  }, [mapReady, userCoords]);

  /** Centra y aleja el mapa lo justo para que el círculo del filtro de distancia quepa entero. */
  const focusRadius = (center: Coords, km: number) => {
    // 1° de latitud ≈ 111km; en longitud se acorta según el coseno de la latitud.
    const latitudeDelta = (km / 111) * 2.6;
    const longitudeDelta = latitudeDelta / Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.1);
    mapRef.current?.animateToRegion({ ...center, latitudeDelta, longitudeDelta }, 400);
  };

  // Cada vez que se aplica un filtro (categoría o búsqueda) volvemos a centrar
  // el mapa en la ubicación del usuario, para que no se quede mirando una zona
  // donde ya no hay resultados relevantes. Comparamos contra el valor anterior
  // "a mano" (en vez de solo listar las deps) para no disparar esto también en
  // el primer render, que ya lo cubre el efecto de centrado inicial de arriba.
  const previousFiltersRef = useRef({ groupId, categoryId, subcategoryId });
  useEffect(() => {
    const previous = previousFiltersRef.current;
    const changed = previous.groupId !== groupId || previous.categoryId !== categoryId || previous.subcategoryId !== subcategoryId;
    previousFiltersRef.current = { groupId, categoryId, subcategoryId };
    // Con búsqueda el mapa se encuadra en los resultados (más abajo), no en el usuario.
    if (!changed || !userCoords || debouncedSearch) return;
    mapRef.current?.animateToRegion({ ...userCoords, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
  }, [groupId, categoryId, subcategoryId, debouncedSearch, userCoords]);

  // Una búsqueda nueva empieza en la zona de la persona (o, sin ubicación, donde mira el mapa), en la
  // vista de resultados; borrarla vuelve a Descubre.
  const nearArea = () => {
    const center = userCoords ?? { latitude: region.latitude, longitude: region.longitude };
    return { ...boxAround(center, SEARCH_NEAR_KM), kind: 'near' as const };
  };
  const [lastSearch, setLastSearch] = useState('');
  if (lastSearch !== debouncedSearch) {
    setLastSearch(debouncedSearch);
    setSearchArea(debouncedSearch ? nearArea() : null);
    setAreaDirty(false);
    setSectionFilter(null);
    setView(debouncedSearch ? 'results' : 'discover');
  }

  // Ordenamos/filtramos por distancia con la ubicación real del usuario, esté donde
  // esté: alguien probando la app desde otra ciudad (o viajando) también debe poder
  // usar "cerca de mí", aunque el resultado sea que todo quede lejos.
  const reference = userCoords;
  const { status: authStatus } = useAuth();

  const myEntities = useQuery({
    queryKey: ['my-entities'],
    queryFn: entitiesApi.mine,
    enabled: authStatus === 'signedIn',
    staleTime: 60_000,
  });
  // Set de ids de mis propios negocios, para diferenciar su pin en el mapa
  // (hallazgo de UI: el pin del propio negocio se ve igual que cualquier otro).
  const myEntityIds = useMemo(() => new Set((myEntities.data ?? []).map((e) => e.id)), [myEntities.data]);

  // Rectángulo visible del mapa (para la consulta por zona) y si el mapa está
  // centrado en el usuario (para el título del encabezado).
  const bbox = useMemo(() => {
    const halfLat = region.latitudeDelta / 2;
    const halfLng = region.longitudeDelta / 2;
    return {
      min_lat: +(region.latitude - halfLat).toFixed(5),
      max_lat: +(region.latitude + halfLat).toFixed(5),
      min_lng: +(region.longitude - halfLng).toFixed(5),
      max_lng: +(region.longitude + halfLng).toFixed(5),
    };
  }, [region]);
  // Área útil (3.24, `area_util.html`): lo que de verdad se ve, entre lo que flota arriba y el panel COMPACTO (no su alto
  // actual, para que la lista no cambie al subirlo). Descubre y la lista de la zona usan esta: nunca nombran negocios
  // escondidos bajo el panel. Los pines y las burbujas siguen pidiéndose para todo el mapa.
  const listBox = useMemo(
    () => (mapSize.height > 0 && topH > 0 ? usefulBox(region, mapSize.height, topH, sheet.heights.peek) : bbox),
    [region, mapSize.height, topH, sheet.heights.peek, bbox],
  );
  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });
  const groups = useMemo(() => buildGroups(categories.data ?? []), [categories.data]);
  // Lo que se manda como filtro: la categoría, o todas las del grupo elegido.
  const catFilter = categoryFilter(groupId, categoryId, groups);
  const searching = debouncedSearch.length > 0;
  // Sin búsqueda: la zona visible. Con búsqueda: toda la ciudad, o la zona que el usuario pidió.
  // Sin búsqueda se pide un área más grande que la pantalla (el doble) y solo se vuelve a
  // pedir al salir de ella o al acercarse mucho: mover el mapa un poco no consulta.
  const [fetchBox, setFetchBox] = useState<Box | null>(null);
  if (!searching && startupRegion !== null && needsRefetch(fetchBox, bbox)) setFetchBox(padBox(bbox, FETCH_FACTOR));
  const scope = searching
    ? searchArea && { min_lat: searchArea.min_lat, max_lat: searchArea.max_lat, min_lng: searchArea.min_lng, max_lng: searchArea.max_lng }
    : fetchBox ?? bbox;
  const searchScope = searchArea ? searchArea.kind : 'all';
  const refKey = reference ? `${reference.latitude.toFixed(3)},${reference.longitude.toFixed(3)}` : 'no-ref';
  const entities = useQuery({
    queryKey: [
      'discovery',
      catFilter ?? 'all',
      subcategoryId ?? 'all',
      debouncedSearch,
      scope ? `${scope.min_lat},${scope.min_lng},${scope.max_lat},${scope.max_lng}` : 'ciudad',
      refKey,
    ],
    queryFn: () =>
      discoveryApi.discover({
        ...(scope ?? {}),
        // Referencia del usuario para la distancia; 0/0 = sin señal.
        lat: reference?.latitude,
        long: reference?.longitude,
        category: catFilter,
        subcategory: subcategoryId,
        q: debouncedSearch || undefined,
        // Suficiente para poblar el mapa; el orden sigue siendo el ranking.
        limit: 50,
      }),
    // Al mover el mapa el bbox cambia (queryKey nuevo): mantenemos los
    // resultados anteriores mientras llegan los de la nueva zona, para no
    // parpadear ni mostrar el spinner en cada movimiento.
    placeholderData: keepPreviousData,
  });

  // Niveles 1 y 2 del mapa (F10): sin búsqueda ni filtros que el servidor no conozca, los negocios
  // llegan agrupados en casillas con su conteo en vez de uno por uno. Con «abiertos ahora» o un radio
  // el conteo del servidor no coincidiría, así que se vuelve a los pines.
  const level = useMapLevel(region.latitudeDelta);
  const bubbleMode = !searching && isBubbleLevel(level) && radiusKm === null && !openNow;
  const cellsQuery = useQuery({
    queryKey: ['cells', catFilter ?? 'all', subcategoryId ?? 'all', bbox.min_lat, bbox.min_lng, bbox.max_lat, bbox.max_lng, Math.round(Math.log2(region.latitudeDelta) * 4)],
    queryFn: () => discoveryApi.cells({ ...bbox, lat_delta: region.latitudeDelta, category: catFilter, subcategory: subcategoryId }),
    enabled: bubbleMode && startupRegion !== null,
    // Al mover el mapa se muestran las burbujas anteriores hasta que lleguen las nuevas.
    placeholderData: keepPreviousData,
  });
  const zones = useZones();

  // Descubre: lo arma el servidor para la zona visible (también se ve durante una búsqueda).
  const sectionsQuery = useQuery({
    queryKey: ['discover-sections', catFilter ?? 'all', subcategoryId ?? 'all', listBox.min_lat, listBox.min_lng, listBox.max_lat, listBox.max_lng, refKey],
    queryFn: () => discoverApi.sections({ ...listBox, lat: reference?.latitude, long: reference?.longitude, category: catFilter, subcategory: subcategoryId }),
    enabled: startupRegion !== null,
    placeholderData: keepPreviousData,
  });
  // «Ver más» de una sección: la misma regla, con más negocios.
  const sectionMoreQuery = useQuery({
    queryKey: ['discover-section', sectionFilter, catFilter ?? 'all', subcategoryId ?? 'all', listBox.min_lat, listBox.min_lng, listBox.max_lat, listBox.max_lng, refKey],
    queryFn: () => discoverApi.sections({ ...listBox, lat: reference?.latitude, long: reference?.longitude, category: catFilter, subcategory: subcategoryId, section: sectionFilter ?? undefined, limit: 50 }),
    enabled: sectionFilter !== null,
  });
  // Reclamos con QR activo: su negocio muestra «Tu QR» en vez de la pastilla de la oferta.
  const claimsQuery = useQuery({ queryKey: ['claims-mine'], queryFn: claimsApi.mine, enabled: authStatus === 'signedIn', staleTime: 30_000 });
  const now = useNow(30_000);
  const qrByEntity = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of claimsQuery.data ?? []) {
      if (c.offer?.entity_id && effectiveClaimStatus(c, now) === 'RECLAMADO') map.set(c.offer.entity_id, c.offer_id);
    }
    return map;
  }, [claimsQuery.data, now]);

  const fetched = useMemo<WithDistance[]>(() => {
    const withDistance = (entities.data?.items ?? []).map((entity) => ({
      ...entity,
      distanceKm: entity.distance_meters > 0 ? entity.distance_meters / 1000 : null,
    }));
    const filtered =
      radiusKm && reference
        ? withDistance.filter((entity) => entity.distanceKm !== null && entity.distanceKm <= radiusKm)
        : withDistance;
    // El "abiertos ahora" se aplica acá (el descubrimiento ya los pone primero).
    const openFiltered = openNow ? filtered.filter((e) => e.is_open_now) : filtered;
    // Sin reordenar: el backend devuelve el orden correcto (ranking + diversificación).
    return openFiltered;
  }, [entities.data, reference, radiusKm, openNow]);

  // Pines acumulados (sin búsqueda): cada respuesta SUMA negocios a los que ya estaban y solo se
  // quitan los que quedaron muy lejos; así una consulta nunca hace desaparecer un pin que se ve.
  // Cambiar de categoría o de filtros empieza de cero.
  const filterKey = `${catFilter}|${subcategoryId}|${radiusKm}|${openNow}|${refKey}`;
  const [pins, setPins] = useState<{ key: string; data: unknown; store: Map<string, WithDistance> }>(() => ({ key: '', data: null, store: new Map() }));
  if (!searching && entities.data && !entities.isPlaceholderData && (pins.data !== entities.data || pins.key !== filterKey)) {
    const base = pins.key === filterKey ? pins.store : new Map<string, WithDistance>();
    setPins({ key: filterKey, data: entities.data, store: mergePins(base, fetched, padBox(fetchBox ?? bbox, FETCH_FACTOR)) });
  }
  // Caché de los últimos pines: al abrir, salen al instante (guardados en el teléfono) y se
  // reemplazan por los frescos apenas llega la respuesta del servidor. Solo con los filtros por defecto.
  useEffect(() => {
    let alive = true;
    void loadPinsCache<DiscoveryItem>().then((saved) => {
      if (!alive || !saved) return;
      setPins((p) =>
        p.store.size === 0 && p.data === null
          ? { key: 'cache', data: null, store: new Map(saved.map((i) => [i.id, { ...i, distanceKm: null }])) }
          : p,
      );
    });
    return () => {
      alive = false;
    };
  }, []);
  const defaultFilters = catFilter === undefined && subcategoryId === undefined && radiusKm === null && !openNow;
  const savedIdsRef = useRef<{ id: string }[]>([]);
  const freshItems = !entities.isPlaceholderData ? entities.data?.items : undefined;
  useEffect(() => {
    if (searching || !defaultFilters || !freshItems || freshItems.length === 0) return;
    if (sameIds(freshItems, savedIdsRef.current)) return;
    savedIdsRef.current = freshItems;
    void savePinsCache(freshItems);
  }, [searching, defaultFilters, freshItems]);

  // La lista de la zona: lo que se ve, en el orden del servidor. En búsqueda, los resultados.
  // Con búsqueda, del más cercano al más lejano (F11): ese orden es el del énfasis del mapa.
  const plan = useMemo(() => (searching ? emphasize(fetched) : null), [searching, fetched]);
  const items = useMemo(() => (plan ? plan.map((p) => p.item) : visibleInOrder(pins.store, fetched, listBox)), [plan, fetched, pins.store, listBox]);
  const hasNearResults = useMemo(() => (plan ?? []).some((p) => p.tier !== 'far' && p.distanceM !== null), [plan]);
  const closestIds = useMemo(() => new Set((plan ?? []).filter((p) => p.tier === 'big').map((p) => p.item.id)), [plan]);
  const known = useMemo(() => (searching ? fetched : [...pins.store.values()]), [searching, fetched, pins.store]);
  const { tier, markers } = useMapMarkers({
    known,
    region,
    mapSize,
    selectedId,
    myEntityIds,
    searching,
    level,
    // Burbujas solo cuando las casillas ya llegaron (y se mantienen las anteriores al mover el mapa):
    // mientras llegan, o si fallan, se ven los pines; el mapa nunca queda vacío esperando.
    cells: bubbleMode ? cellsQuery.data ?? null : null,
    zones,
  });

  // Sin pines todavía y pidiendo la zona: el mapa lo dice en vez de verse vacío (con búsqueda ya lo
  // dice el panel: «Buscando…»).
  const mapLoading = !searching && startupRegion !== null && markers.length === 0 && (entities.isFetching || cellsQuery.isFetching);

  // En qué zona está la persona (o qué zona mira el mapa): nombre del encabezado del panel.
  const viewPoint = useMemo(() => ({ latitude: region.latitude, longitude: region.longitude }), [region.latitude, region.longitude]);
  const zoneName = useZoneName({ user: userCoords, view: viewPoint });
  const strip = useMemo(() => stripText(zoneName, { hasUser: userCoords !== null, denied: locationDenied }), [zoneName, userCoords, locationDenied]);

  // Resultados de búsqueda: mientras llega una consulta nueva se muestra «Buscando…», no la anterior.
  const resultsStatus: 'loading' | 'error' | 'ok' = entities.isError ? 'error' : entities.isLoading || entities.isPlaceholderData ? 'loading' : 'ok';
  // «También podría interesarte»: misma categoría que el primer resultado, otras subcategorías.
  const topCategory = searching && resultsStatus === 'ok' ? items[0]?.category_id : undefined;
  const relatedQuery = useQuery({
    queryKey: ['discovery-related', topCategory, scope ? `${scope.min_lat},${scope.min_lng}` : 'ciudad', refKey],
    queryFn: () => discoveryApi.discover({ ...(scope ?? {}), lat: reference?.latitude, long: reference?.longitude, category: topCategory, limit: 30 }),
    enabled: Boolean(topCategory),
  });
  const related = useMemo(
    () => (topCategory ? relatedFrom(items, relatedQuery.data?.items ?? []) : []),
    [topCategory, items, relatedQuery.data],
  );

  // Al llegar los resultados de una búsqueda, el mapa los encuadra y el panel compacto pasa a intermedio.
  const fittedRef = useRef('');
  useEffect(() => {
    if (!searching) {
      fittedRef.current = '';
      return;
    }
    if (resultsStatus !== 'ok') return;
    const key = `${debouncedSearch}|${catFilter}|${searchScope}`;
    if (fittedRef.current === key) return;
    fittedRef.current = key;
    if (sheet.getAnchor() === 'peek') sheet.snapTo('medium');
    // La cámara encuadra los más cercanos (a menos de 1,5 km), no todos: los lejanos no deben alejar el mapa.
    const coords = (plan ? cameraTargets(plan) : []).filter(hasLocation).map((e) => ({ latitude: e.latitude, longitude: e.longitude }));
    // Si ninguno cabe cerca, el mapa se queda en la zona de la persona.
    if (coords.length === 0 && searchScope !== 'zone' && userCoords) {
      mapRef.current?.animateToRegion({ ...userCoords, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
    }
    // Se encuadra lo encontrado cerca o más lejos; si la persona eligió la zona, el mapa no se mueve.
    if (coords.length > 0 && searchScope !== 'zone') {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: Math.max(150, topH + 16), right: 48, bottom: sheet.heights.medium + 40, left: 48 },
        animated: true,
      });
    }
  }, [searching, resultsStatus, debouncedSearch, catFilter, searchScope, plan, sheet, userCoords, topH]);

  // Medición (anónima): una búsqueda cuenta una vez por consulta y alcance, cuando llegan los resultados.
  const trackedSearch = useRef('');
  useEffect(() => {
    if (!searching) {
      trackedSearch.current = '';
      return;
    }
    if (resultsStatus !== 'ok') return;
    const key = `${debouncedSearch}|${searchScope}`;
    if (trackedSearch.current === key) return;
    trackedSearch.current = key;
    track('search_submitted', undefined, { query: debouncedSearch, results: items.length, scope: searchScope });
    if (items.length === 0) track('search_no_results', undefined, { query: debouncedSearch, scope: searchScope });
  }, [searching, resultsStatus, debouncedSearch, searchScope, items.length]);

  // Un filtro cuenta cuando se aplica (no al quitarlo ni al arrancar).
  const prevFilters = useRef({ groupId, categoryId, subcategoryId, radiusKm, openNow });
  useEffect(() => {
    const p = prevFilters.current;
    if ((categoryId && categoryId !== p.categoryId) || (groupId && groupId !== p.groupId)) track('filter_applied', undefined, { filter: 'category' });
    if (subcategoryId && subcategoryId !== p.subcategoryId) track('filter_applied', undefined, { filter: 'subcategory' });
    if (radiusKm !== null && radiusKm !== p.radiusKm) track('filter_applied', undefined, { filter: 'radius' });
    if (openNow && !p.openNow) track('filter_applied', undefined, { filter: 'open' });
    prevFilters.current = { groupId, categoryId, subcategoryId, radiusKm, openNow };
  }, [groupId, categoryId, subcategoryId, radiusKm, openNow]);

  const openBusiness = (id: string) => router.push({ pathname: '/business/[id]', params: { id, src: searching ? 'search' : 'map' } });

  const selectedEntity = useMemo(
    () => (selectedId ? known.find((e) => e.id === selectedId) ?? null : null),
    [known, selectedId],
  );

  // Toca un pin: selecciona y centra dejando espacio abajo para que el banner
  // no tape el pin (el centro queda un poco al sur del negocio).
  // El negocio elegido queda en el centro del espacio libre (bajo el buscador y sobre la ficha), no en el centro de
  // la pantalla. Se encuadra con un alto de ficha estimado y se afina cuando la ficha mide su alto real.
  const focusBusiness = (coords: { latitude: number; longitude: number }, sheetHeight: number) => {
    const delta = 0.008;
    const latitude = mapSize.height > 0 ? focusCenterLat(coords.latitude, delta, mapSize.height, insets.top + 64, sheetHeight) : coords.latitude - 0.0016;
    mapRef.current?.animateToRegion({ latitude, longitude: coords.longitude, latitudeDelta: delta, longitudeDelta: delta }, 420);
  };
  const selectBusiness = (id: string, coords: { latitude: number; longitude: number }) => {
    setSelectedId(id);
    setPlaceItems(null);
    setSheetH(0);
    focusBusiness(coords, SHEET_ESTIMATE);
  };
  const onSheetHeight = (h: number) => {
    // Solo se vuelve a encuadrar si el alto real difiere de verdad de lo estimado (una vez por negocio).
    if (!selectedEntity || sheetH !== 0 || Math.abs(h - SHEET_ESTIMATE) < 24) {
      setSheetH(h);
      return;
    }
    setSheetH(h);
    focusBusiness({ latitude: selectedEntity.latitude, longitude: selectedEntity.longitude }, h);
  };

  // Tocar una pila: si sus negocios comparten punto (≤ 50 m) o ya no se puede
  // acercar más, se abre «En este lugar»; si no, se acerca el mapa y la pila se
  // abre sola.
  const onStackPress = (cluster: Cluster<WithDistance>) => {
    setSelectedId(null);
    if (allWithinMeters(cluster.items, 50) || region.latitudeDelta < 0.002) {
      setPlaceItems(cluster.items);
      return;
    }
    mapRef.current?.animateToRegion(
      {
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        latitudeDelta: region.latitudeDelta / 2.5,
        longitudeDelta: region.longitudeDelta / 2.5,
      },
      300,
    );
  };

  // Tocar una burbuja acerca el mapa hacia ella; los negocios salen al llegar al siguiente nivel.
  const onBubblePress = (latitude: number, longitude: number) => {
    setSelectedId(null);
    mapRef.current?.animateToRegion(
      { latitude, longitude, latitudeDelta: region.latitudeDelta / 2.5, longitudeDelta: region.longitudeDelta / 2.5 },
      400,
    );
  };

  const directionsTo = (latitude: number, longitude: number) => {
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`);
  };

  const clearAllFilters = () => {
    setGroupId(undefined);
    setCategoryId(undefined);
    setSubcategoryId(undefined);
    setRadiusKm(null);
    setOpenNow(false);
  };

  const openFilters = () => {
    if (!reference && !locating) void requestLocation();
    setFiltersOpen(true);
  };

  const activeFilterCount = (categoryId || groupId ? 1 : 0) + (subcategoryId ? 1 : 0) + (radiusKm !== null ? 1 : 0) + (openNow ? 1 : 0);
  const selectedCategory = (categories.data ?? []).find((c) => c.id === categoryId) ?? null;
  const selectedGroup = groups.find((g) => g.id === groupId) ?? null;
  const selectedSubcategory = (selectedCategory?.subcategories ?? []).find((s) => s.id === subcategoryId) ?? null;
  const radiusLabel = radiusKm ? `< ${radiusKm} km` : null;

  // Fila de contexto (F12): zona, alcance y filtros activos, cada uno con su ✕.
  const contextFilters: { id: FilterId; label: string }[] = [];
  if (selectedCategory) contextFilters.push({ id: 'category', label: selectedCategory.name });
  else if (selectedGroup) contextFilters.push({ id: 'category', label: selectedGroup.name });
  if (selectedSubcategory) contextFilters.push({ id: 'subcategory', label: selectedSubcategory.name });
  if (radiusLabel) contextFilters.push({ id: 'radius', label: radiusLabel });
  if (openNow) contextFilters.push({ id: 'open', label: 'Abiertos ahora' });
  const contextRow = contextChips({
    searching,
    scope: searchScope,
    hasLocation: userCoords !== null,
    filters: contextFilters,
    areaDirty: areaDirty && resultsStatus !== 'loading',
  });
  const removeFilter = (id: FilterId) => {
    if (id === 'category') {
      setGroupId(undefined);
      setCategoryId(undefined);
      setSubcategoryId(undefined);
    } else if (id === 'subcategory') setSubcategoryId(undefined);
    else if (id === 'radius') setRadiusKm(null);
    else setOpenNow(false);
    AccessibilityInfo.announceForAccessibility(removedAnnouncement('filter'));
  };
  const removeScope = () => {
    setSearchArea(nearArea());
    setAreaDirty(false);
    AccessibilityInfo.announceForAccessibility(removedAnnouncement('scope'));
  };
  const clearContext = () => {
    clearAllFilters();
    setSearchArea(nearArea());
    setAreaDirty(false);
    AccessibilityInfo.announceForAccessibility(removedAnnouncement('all'));
  };
  // Elegir un grupo filtra por todas sus categorías; elegir una categoría (desde «Ver todas» o los filtros) fija
  // también su grupo, para que la segunda fila de arriba muestre dónde está.
  const chooseGroup = (id: GroupId | undefined) => {
    setGroupId(id);
    setCategoryId(undefined);
    setSubcategoryId(undefined);
  };
  const chooseCategory = (id: string | undefined) => {
    setCategoryId(id);
    setSubcategoryId(undefined);
    setGroupId(id ? groupIdOf(id, groups) : undefined);
  };

  // La reseña verificada más reciente de los destacados que se ven (y los adicionales): una sola consulta, hasta 12.
  const extraEntities = useMemo(() => (searching ? [] : pickExtras(known, listBox, EXTRAS_MAX)), [searching, known, listBox]);
  const snippetIds = searching ? [] : [...items.slice(0, ZONE_FICHA_MAX), ...extraEntities].map((e) => e.id);
  const snippetsKey = [...snippetIds].sort().join(',');
  const snippetsQuery = useQuery({
    queryKey: ['review-snippets', snippetsKey],
    queryFn: () => discoveryApi.reviewSnippets(snippetIds),
    enabled: snippetIds.length > 0,
    staleTime: 10 * 60_000,
  });
  const snippets = snippetsQuery.data;
  // La ficha del negocio elegido: su reseña viene de los destacados ya cargados o, si no está entre ellos, de una consulta.
  const selectedSnippetQuery = useQuery({
    queryKey: ['review-snippet', selectedId],
    queryFn: () => discoveryApi.reviewSnippets([selectedId ?? '']),
    enabled: selectedId !== null && !snippets?.[selectedId],
    staleTime: 10 * 60_000,
  });
  const selectedSnippet = selectedId ? (snippets?.[selectedId] ?? selectedSnippetQuery.data?.[selectedId]) : undefined;
  const selectedReview = selectedSnippet ? snippetLines(selectedSnippet, now) : undefined;

  const toModel = (e: WithDistance, line?: string): CardModel => ({
    id: e.id,
    name: e.name,
    latitude: e.latitude,
    longitude: e.longitude,
    image: e.profile_url,
    color: categoryColor(e.category_color),
    icon: displayIcon(e.category_icon),
    open: e.has_hours ? e.is_open_now : null,
    distance: formatDistance(e.distanceKm),
    sub: e.subcategory || e.category_name,
    line,
    pill: e.has_active_offer && e.active_offer ? reasonPill({ kind: 'offer', ends_at: e.active_offer.ends_at }, now) : null,
    mine: qrByEntity.has(e.id),
    rating: e.avg_rating,
    reviews: e.review_count,
    tagline: e.tagline || undefined,
    review: snippets?.[e.id] ? snippetLines(snippets[e.id], now) : undefined,
    photos: e.photos,
    photosCount: e.photos_count,
  });
  const discoverModel = (it: DiscoverItem, sectionId: DiscoverSectionId): CardModel => ({
    id: it.entity_id,
    name: it.name,
    latitude: it.latitude,
    longitude: it.longitude,
    image: it.profile_url,
    cover: it.cover_url,
    color: categoryColor(it.category_color),
    icon: displayIcon(it.category_icon),
    open: it.is_open_now,
    distance: formatDistance(it.distance_meters > 0 ? it.distance_meters / 1000 : null),
    sub: it.subcategory || it.category_name,
    line: sectionId === 'open' ? openLine(it.closes_at) : it.tagline || undefined,
    pill: reasonPill(it.reason, now),
    mine: qrByEntity.has(it.entity_id),
    photos: it.photos,
    photosCount: it.photos_count,
  });
  const zoneModels = searching ? [] : items.map((e) => toModel(e));
  // Adicionales: los pines acumulados que están cerca pero fuera de la zona que se ve, con el nombre de su zona.
  const extraModels = extraEntities.map((e) => ({ ...toModel(e), zoneLabel: zoneAt(zones, e)?.zone.name ?? null }));
  const widenMap = () =>
    mapRef.current?.animateToRegion(
      {
        latitude: region.latitude,
        longitude: region.longitude,
        latitudeDelta: Math.max(region.latitudeDelta * 4, 0.2),
        longitudeDelta: Math.max(region.longitudeDelta * 4, 0.2),
      },
      500,
    );
  const header = sheetHeader({
    searching,
    query: debouncedSearch,
    status: resultsStatus,
    results: items.length,
    scope: searchScope,
    zoneCount: items.length,
    categoryName: selectedCategory?.name ?? selectedGroup?.name,
    view,
    extraCount: extraModels.length,
    openCount: searching ? 0 : items.filter((e) => e.has_hours && e.is_open_now).length,
    zoneStatus: entities.isError ? 'error' : entities.isLoading ? 'loading' : 'ok',
  });
  // Visor de fotos de un destacado, encima del mapa (3.22).
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const openPhoto = (m: CardModel, index: number) => {
    if (!m.photos?.length) return;
    setViewer({ id: m.id, name: m.name, photos: m.photos, total: photoTotal({ id: m.id, name: m.name, photos: m.photos, photosCount: m.photosCount }), index });
  };
  // «Volver» lleva el mapa a la persona; sin ubicación, la pide y luego centra.
  const goToMe = async () => {
    const coords = userCoords ?? (await requestLocation());
    if (coords) mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
  };
  const sections = sectionsQuery.data ?? [];
  const avatars = (sections[0]?.items ?? []).slice(0, 3).map((it) => ({ key: it.entity_id, color: categoryColor(it.category_color).fg, letter: it.name.charAt(0) }));
  const sectionTitle = sections.find((sec) => sec.id === sectionFilter)?.title ?? '';
  const onSelectCard = (m: CardModel) => {
    // Si el negocio está entre los pines, se selecciona en el mapa; si no, se abre su perfil.
    if (known.some((e) => e.id === m.id)) selectBusiness(m.id, { latitude: m.latitude, longitude: m.longitude });
    else openBusiness(m.id);
  };
  const clearSearch = () => {
    setSearch('');
    setDebouncedSearch('');
  };

  // El buscador y los chips se desvanecen mientras el dedo mueve el mapa, y los chips
  // se esconden con el panel expandido (queda una franja de mapa con el buscador).
  const reduceMotion = useReduceMotion();
  const [topFade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const to = mapMoving ? 0 : 1;
    if (reduceMotion) topFade.setValue(to);
    else Animated.timing(topFade, { toValue: to, duration: 150, useNativeDriver: true }).start();
  }, [mapMoving, reduceMotion, topFade]);
  const tall = sheet.anchor === 'full';
  const locateBottom = Animated.add(sheet.buttonsBase, spacing.md);
  const sheetNowPx = sheet.anchor === 'peek' ? sheet.heights.peek : sheet.heights.medium;

  // Encuadra negocios en lo que se ve (entre lo de arriba y el panel). Con uno solo se centra sin cambiar el acercamiento.
  const fitInView = (coords: Coords[], sheetPx: number) => {
    if (coords.length === 0 || mapSize.height === 0) return;
    if (coords.length === 1) {
      const c = coords[0];
      const latitude = focusCenterLat(c.latitude, region.latitudeDelta, mapSize.height, topH, sheetPx);
      mapRef.current?.animateToRegion({ latitude, longitude: c.longitude, latitudeDelta: region.latitudeDelta, longitudeDelta: region.longitudeDelta }, reduceMotion ? 0 : 400);
      return;
    }
    mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: topH + 24, right: 48, bottom: sheetPx + 24, left: 48 }, animated: !reduceMotion });
  };

  // Al subir el panel a intermedio, el mapa acompaña: si algún destacado quedaría tapado, se encuadran (una vez).
  const prevAnchor = useRef(sheet.anchor);
  useEffect(() => {
    const was = prevAnchor.current;
    prevAnchor.current = sheet.anchor;
    if (sheet.anchor !== 'medium' || was !== 'peek' || searching || selectedEntity || mapSize.height === 0) return;
    const pts = items.slice(0, ZONE_FICHA_MAX).filter(hasLocation).map((e) => ({ latitude: e.latitude, longitude: e.longitude }));
    if (pts.length > 0 && anyHiddenBelow(region, mapSize, pts, sheet.heights.medium)) fitInView(pts, sheet.heights.medium);
    // Solo al cambiar de anclaje: lo demás se lee en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.anchor]);

  // Nada a la vista: los más cercanos al centro de lo que se ve, para traerlos al mapa.
  const nearest = useMemo(
    () => (searching || items.length > 0 ? [] : nearestTo(known.filter(hasLocation), boxCenter(listBox), 5)),
    [searching, items.length, known, listBox],
  );
  const showNearest = () => {
    if (sheet.anchor === 'full') sheet.snapTo('medium');
    fitInView(nearest.map((e) => ({ latitude: e.latitude, longitude: e.longitude })), sheet.anchor === 'peek' ? sheet.heights.peek : sheet.heights.medium);
  };
  // Encabezado de lo que se ve: «En Centro Histórico», «Cerca de ti».
  const place = zoneName ? (zoneName.onUser ? 'Cerca de ti' : zoneName.title.startsWith('Cerca de') ? zoneName.title : `En ${zoneName.title}`) : 'A la vista';

  // Referencias del mapa (3.23, `referencias_mapa.html`): la zona marcada, «Tú» y la leyenda.
  const areaZone = !searching && !bubbleMode && !selectedEntity && zoneName?.zone ? zoneName.zone : null;
  // «Tú» (3.25, opción B de `tu_ligero.html`): solo explorando otra zona (a más de 1 km, como la franja) y solo si tu
  // punto azul no se ve. Es un punto en el borde derecho, encima del botón de ubicación, con la flecha hacia ti.
  const youKm = userCoords ? distanceKm(userCoords, { latitude: region.latitude, longitude: region.longitude }) : null;
  const exploring = youKm !== null && youKm * 1000 >= NEAR_ME_M;
  const youDotBottom = Animated.add(locateBottom, 56);
  const youDot =
    userCoords && mapSize.height > 0 && topH > 0 && !tall && !selectedEntity && !placeItems && !mapMoving &&
    showYouDot(exploring, region, mapSize, userCoords, { top: topH, bottom: mapSize.height - sheetNowPx, left: 0, right: mapSize.width })
      ? {
          angle: pointerAngle(
            { x: mapSize.width - spacing.md - 2 - YOU_DOT / 2, y: mapSize.height - sheetNowPx - spacing.md - 56 - YOU_DOT / 2 },
            toScreen(region, mapSize, userCoords),
          ),
        }
      : null;
  const youDistance = youKm !== null ? formatDistance(youKm) : null;
  const [legendOpen, setLegendOpen] = useState(false);

  // Guía de la primera vez (3 pasos). Sale sola una vez; desde Perfil se puede volver a ver (?guide=1).
  const params = useLocalSearchParams<{ guide?: string }>();
  const [guideSeen, setGuideSeen] = useState<boolean | null>(null);
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const [stripRect, setStripRect] = useState<GuideRect | null>(null);
  useEffect(() => {
    let alive = true;
    void loadGuideSeen().then((seen) => {
      if (alive) setGuideSeen(seen);
    });
    return () => {
      alive = false;
    };
  }, []);
  const guideBusy = searching || selectedEntity !== null || placeItems !== null || !mapReady || topH === 0;
  useEffect(() => {
    if (!shouldAutoStart(guideSeen, guideBusy) || guideStep !== null) return;
    const t = setTimeout(() => setGuideStep(0), 800);
    return () => clearTimeout(t);
  }, [guideSeen, guideBusy, guideStep]);
  useEffect(() => {
    if (params.guide !== '1') return;
    const t = setTimeout(() => {
      setLegendOpen(false);
      setGuideStep(0);
    }, 300);
    router.setParams({ guide: undefined });
    return () => clearTimeout(t);
  }, [params.guide, router]);
  const onGuideStep = (next: number | null) => {
    if (next !== null) {
      setGuideStep(next);
      return;
    }
    setGuideStep(null);
    setGuideSeen(true);
    void saveGuideSeen();
  };
  const usefulRect: GuideRect = { x: spacing.md, y: topH + 8, width: mapSize.width - spacing.md * 2, height: Math.max(60, mapSize.height - sheet.heights.peek - topH - 16) };
  const areaRect = ((): GuideRect => {
    if (!areaZone || mapSize.height === 0) return usefulRect;
    const c = toScreen(region, mapSize, areaZone);
    const r = (areaZone.radius_m / 111_320 / region.latitudeDelta) * mapSize.height;
    const top = Math.max(usefulRect.y, c.y - r);
    const bottom = Math.min(usefulRect.y + usefulRect.height, c.y + r);
    if (bottom - top < 60) return usefulRect;
    return { x: Math.max(spacing.sm, c.x - r), y: top, width: Math.min(mapSize.width - spacing.sm * 2, r * 2), height: bottom - top };
  })();
  const legendRect: GuideRect = { x: spacing.md, y: mapSize.height - sheetNowPx - spacing.md - 44, width: 44, height: 44 };

  return (
    <View style={styles.screen}>
      <View style={styles.content} onLayout={(e) => setMapSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        <View style={styles.mapWrap}>
          {startupRegion === null ? (
            // Resolviendo si ya había permiso/posición para arrancar centrados de una.
            <View style={[styles.map, styles.mapStartupLoading]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={startupRegion}
              showsUserLocation
              showsMyLocationButton={false}
              // Oculta las etiquetas de lugares del mapa base de Google (cementerios,
              // parques, centros comerciales, etc.) que no tienen nada que ver con
              // los negocios de Empre y solo generan ruido visual (hallazgo de UI:
              // "el mapa conserva etiquetas ajenas al filtro").
              showsPointsOfInterests={false}
              customMapStyle={MAP_STYLE}
              onMapReady={() => setMapReady(true)}
              onPanDrag={onMapDrag}
              onRegionChangeComplete={onMapSettled}
              onPress={() => {
                setSelectedId(null);
                setPlaceItems(null);
              }}
            >
              {radiusKm && reference ? (
                <Circle
                  center={reference}
                  radius={radiusKm * 1000}
                  strokeWidth={1.5}
                  strokeColor={colors.primary}
                  fillColor="rgba(36,104,198, 0.12)"
                />
              ) : null}
              {areaZone ? (
                <Circle
                  center={{ latitude: areaZone.latitude, longitude: areaZone.longitude }}
                  radius={areaZone.radius_m}
                  strokeWidth={2}
                  strokeColor={colors.primary}
                  fillColor="rgba(36,104,198,0.06)"
                  lineDashPattern={[12, 10]}
                />
              ) : null}
              {areaZone ? (
                <MapLabelMarker
                  key={`zone-${areaZone.id}`}
                  latitude={areaZone.latitude + areaZone.radius_m / 111_320}
                  longitude={areaZone.longitude}
                  text={areaZone.name}
                />
              ) : null}
              {markers.map((m) =>
                m.kind === 'bubble' ? (
                  <BubbleMarker
                    key={m.key}
                    latitude={m.latitude}
                    longitude={m.longitude}
                    count={m.count}
                    hasOffer={m.hasOffer}
                    color={categoryColor(categories.data?.find((c) => c.id === m.categoryId)?.color).fg}
                    label={m.label}
                    onPress={() => onBubblePress(m.latitude, m.longitude)}
                  />
                ) : m.kind === 'business' ? (
                  <PinMarker
                    key={m.key}
                    entity={m.entity}
                    tier={tier}
                    selected={m.selected}
                    mine={m.mine}
                    emphasis={m.emphasis}
                    distanceLabel={m.distanceLabel}
                    dimmed={selectedId !== null && !m.selected}
                    onPress={() => selectBusiness(m.entity.id, m.coordinate)}
                  />
                ) : (
                  <StackMarker key={m.key} cluster={m.cluster} tier={tier} onPress={() => onStackPress(m.cluster)} />
                ),
              )}
            </MapView>
          )}

          {/* Botón de ubicación pegado al borde del panel (no con el panel expandido ni con un negocio abierto). */}
          {!selectedEntity && !placeItems && !tall ? (
            <Animated.View style={[styles.locateButtonWrap, { bottom: locateBottom }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Centrar en mi ubicación"
                onPress={() => {
                  if (userCoords) {
                    mapRef.current?.animateToRegion({ ...userCoords, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
                  } else {
                    void requestLocation();
                  }
                }}
                style={styles.locateButton}
              >
                {locating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="navigate" size={21} color={colors.primary} />}
              </Pressable>
            </Animated.View>
          ) : null}

          {youDot ? <YouDot bottom={youDotBottom} angle={youDot.angle} distance={youDistance} onPress={() => void goToMe()} /> : null}
          {!selectedEntity && !placeItems && !tall ? (
            <MapLegend bottom={locateBottom} withZone={areaZone !== null} open={legendOpen && guideStep === null} onToggle={() => setLegendOpen((v) => !v)} />
          ) : null}

          {!selectedEntity && !placeItems ? (
            <ExploreSheet
              sheet={sheet}
              bottomInset={0}
              tucked={mapMoving}
              header={header}
              avatars={avatars}
              searching={searching}
              query={debouncedSearch}
              view={view}
              onView={(v) => {
                setView(v);
                if (v === 'discover') setSectionFilter(null);
              }}
              selectedId={selectedId}
              onSelect={onSelectCard}
              sections={{
                status: sectionsQuery.isError ? 'error' : sectionsQuery.isLoading ? 'loading' : 'ok',
                data: sections,
                models: discoverModel,
                onRetry: () => void sectionsQuery.refetch(),
              }}
              sectionFilter={
                sectionFilter
                  ? {
                      id: sectionFilter,
                      title: sectionTitle,
                      status: sectionMoreQuery.isError ? 'error' : sectionMoreQuery.isLoading ? 'loading' : 'ok',
                      items: (sectionMoreQuery.data?.[0]?.items ?? []).map((it) => discoverModel(it, sectionFilter)),
                    }
                  : null
              }
              onSeeSection={(id) => {
                setSectionFilter(id);
                setView('results');
                sheet.snapTo('full');
              }}
              onClearSection={() => setSectionFilter(null)}
              zone={{
                status: entities.isError ? 'error' : entities.isLoading ? 'loading' : 'ok',
                items: zoneModels,
                extras: extraModels,
                filterActive: activeFilterCount > 0,
                onRetry: () => void entities.refetch(),
                place,
                nearest: nearest.length > 0 ? { count: nearest.length, onShow: showNearest } : undefined,
              }}
              onPhoto={openPhoto}
              onOpenProfile={openBusiness}
              onClearFilters={clearAllFilters}
              onWiden={widenMap}
              results={{
                status: resultsStatus,
                items: searching
                  ? items.map((e) => ({
                      ...toModel(e),
                      nearChip: closestIds.has(e.id) ? formatDistance(e.distanceKm) : null,
                      far: isFarResult(e.distanceKm === null ? null : e.distanceKm * 1000, hasNearResults),
                    }))
                  : [],
                related: related.map((e) => toModel({ ...e, distanceKm: e.distance_meters > 0 ? e.distance_meters / 1000 : null })),
                relatedLabel: topCategory ? `Misma categoría: ${items[0]?.category_name ?? ''}` : '',
                scope: searchScope,
                onRetry: () => void entities.refetch(),
                onClear: clearSearch,
                onSearchCity: () => setSearchArea(null),
              }}
            />
          ) : null}

          {selectedEntity ? (
            <BusinessSheet
              entity={selectedEntity}
              isMine={myEntityIds.has(selectedEntity.id)}
              qrOfferId={qrByEntity.get(selectedEntity.id) ?? null}
              onClose={() => setSelectedId(null)}
              onDirections={() => {
                track('directions_tapped', selectedEntity.id, { origin: 'map' });
                directionsTo(selectedEntity.latitude, selectedEntity.longitude);
              }}
              onProfile={(offerId) =>
                router.push({ pathname: '/business/[id]', params: offerId ? { id: selectedEntity.id, offer: offerId } : { id: selectedEntity.id } })
              }
              onScan={() => router.push('/business/scan')}
              onPublishOffer={() => router.push({ pathname: '/business/offers', params: { entityId: selectedEntity.id } })}
              review={selectedReview}
              onHeight={onSheetHeight}
            />
          ) : null}

          {placeItems ? (
            <PlaceSheet
              items={placeItems}
              bottomInset={insets.bottom}
              onSelect={(entity) => selectBusiness(entity.id, { latitude: entity.latitude, longitude: entity.longitude })}
              onClose={() => setPlaceItems(null)}
            />
          ) : null}
        </View>

        {/* Arriba, dónde estás (o qué zona mira el mapa); debajo, el buscador con el filtro y las categorías. Flotan sobre el
            mapa: mientras el dedo lo mueve, la franja se atenúa y el resto se desvanece. */}
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none"
          onLayout={(e) => {
            if (!selectedEntity && !tall) setTopH(Math.round(e.nativeEvent.layout.height));
          }}
        >
          {selectedEntity ? null : (
            <View onLayout={(e) => setStripRect(e.nativeEvent.layout)}>
              <LocationStrip text={strip} moving={mapMoving} onAction={() => void goToMe()} />
            </View>
          )}
          <Animated.View style={[styles.topRows, { opacity: topFade }]} pointerEvents={mapMoving ? 'none' : 'box-none'}>
          <SearchBar value={search} onChangeText={setSearch} onOpenFilters={openFilters} filterCount={activeFilterCount} />

          {tall || selectedEntity ? null : searching ? (
            <ContextRow
              chips={contextRow}
              zoneName={null}
              onRemoveScope={removeScope}
              onRemoveFilter={removeFilter}
              onClear={clearContext}
              onSearchArea={() => {
                setSearchArea({ ...listBox, kind: 'zone' });
                setAreaDirty(false);
                AccessibilityInfo.announceForAccessibility('Buscando en esta zona');
              }}
            />
          ) : (
            <GroupRow
              groups={groups}
              groupId={groupId}
              categoryId={categoryId}
              onGroup={chooseGroup}
              onCategory={(id) => {
                setCategoryId(id);
                setSubcategoryId(undefined);
              }}
              onSeeAll={() => setAllCatsOpen(true)}
              trailing={
                selectedSubcategory || radiusLabel || openNow ? (
                  <View style={styles.activeChips}>
                    {selectedSubcategory ? <ActiveChip icon="pricetag-outline" label={selectedSubcategory.name} onRemove={() => setSubcategoryId(undefined)} /> : null}
                    {radiusLabel ? <ActiveChip icon="navigate" label={radiusLabel} onRemove={() => setRadiusKm(null)} /> : null}
                    {openNow ? <ActiveChip icon="time-outline" label="Abiertos ahora" onRemove={() => setOpenNow(false)} /> : null}
                    {activeFilterCount >= 2 ? (
                      <Pressable accessibilityRole="button" accessibilityLabel="Limpiar todos los filtros" onPress={clearAllFilters} hitSlop={8} style={styles.clearChip}>
                        <Text style={styles.clearChipText}>Limpiar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null
              }
            />
          )}
          {mapLoading && !tall && !selectedEntity ? <LoadingChip /> : null}
          </Animated.View>
        </View>

      </View>

      {guideStep !== null ? <ExploreGuide step={guideStep} rects={[stripRect, areaRect, legendRect]} size={mapSize} onStep={onGuideStep} /> : null}

      <PhotoViewer
        target={viewer}
        onClose={() => setViewer(null)}
        onProfile={(id) => {
          setViewer(null);
          openBusiness(id);
        }}
        onAllPhotos={(id) => {
          setViewer(null);
          router.push({ pathname: '/business/photos/[id]', params: { id } });
        }}
      />

      <AllCategoriesModal
        visible={allCatsOpen}
        groups={groups}
        selectedId={categoryId}
        onSelect={chooseCategory}
        onClose={() => setAllCatsOpen(false)}
      />

      <FiltersModal
        visible={filtersOpen}
        categories={categories.data ?? []}
        categoryId={categoryId}
        onSelectCategory={chooseCategory}
        subcategoryId={subcategoryId}
        onSelectSubcategory={setSubcategoryId}
        radiusValue={radiusKm}
        hasReference={Boolean(reference)}
        denied={locationDenied}
        error={locationError}
        locating={locating}
        onSelectRadius={(km) => {
          setRadiusKm(km);
          if (km && reference) {
            focusRadius(reference, km);
          }
        }}
        onRetryLocation={requestLocation}
        openNow={openNow}
        onToggleOpenNow={setOpenNow}
        onClear={clearAllFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </View>
  );
}

function ActiveChip({
  icon,
  label,
  onRemove,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onRemove: () => void;
}) {
  return (
    <View style={styles.activeChip}>
      <Ionicons name={icon} size={13} color={colors.primary} />
      <Text style={styles.activeChipText} numberOfLines={1}>
        {label}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Quitar filtro ${label}`} onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}>
        <Ionicons name="close" size={14} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function FiltersModal({
  visible,
  categories,
  categoryId,
  onSelectCategory,
  subcategoryId,
  onSelectSubcategory,
  radiusValue,
  hasReference,
  denied,
  error,
  locating,
  onSelectRadius,
  onRetryLocation,
  openNow,
  onToggleOpenNow,
  onClear,
  onClose,
}: {
  visible: boolean;
  categories: Category[];
  categoryId: string | undefined;
  onSelectCategory: (id: string | undefined) => void;
  subcategoryId: string | undefined;
  onSelectSubcategory: (id: string | undefined) => void;
  radiusValue: number | null;
  hasReference: boolean;
  denied: boolean;
  error: string | null;
  locating: boolean;
  onSelectRadius: (km: number | null) => void;
  onRetryLocation: () => void;
  openNow: boolean;
  onToggleOpenNow: (value: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const hasFilters = Boolean(categoryId) || Boolean(subcategoryId) || radiusValue !== null || openNow;
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const subcategories = selectedCategory?.subcategories ?? [];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filtros</Text>
            {hasFilters ? (
              <Pressable accessibilityRole="button" onPress={onClear} hitSlop={8}>
                <Text style={styles.modalClear}>Limpiar</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
            <Text style={styles.modalSectionLabel}>Categoría</Text>
            <View style={styles.categoryGrid}>
              <CategoryGridItem
                label="Todas"
                icon="apps-outline"
                active={!categoryId}
                onPress={() => {
                  onSelectCategory(undefined);
                  onSelectSubcategory(undefined);
                }}
              />
              {categories.map((category) => (
                <CategoryGridItem
                  key={category.id}
                  label={category.name}
                  icon={(category.icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap}
                  active={categoryId === category.id}
                  onPress={() => {
                    onSelectCategory(categoryId === category.id ? undefined : category.id);
                    onSelectSubcategory(undefined);
                  }}
                />
              ))}
            </View>

            {subcategories.length > 0 ? (
              <>
                <Text style={[styles.modalSectionLabel, { marginTop: spacing.md }]}>Subcategoría</Text>
                <View style={styles.radiusOptions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onSelectSubcategory(undefined)}
                    style={[styles.radiusOption, !subcategoryId && styles.radiusOptionActive]}
                  >
                    <Text style={[styles.radiusOptionText, !subcategoryId && styles.radiusOptionTextActive]}>Todas</Text>
                  </Pressable>
                  {subcategories.map((sub) => {
                    const active = subcategoryId === sub.id;
                    return (
                      <Pressable
                        key={sub.id}
                        accessibilityRole="button"
                        onPress={() => onSelectSubcategory(sub.id)}
                        style={[styles.radiusOption, active && styles.radiusOptionActive]}
                      >
                        <Text style={[styles.radiusOptionText, active && styles.radiusOptionTextActive]}>{sub.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={[styles.modalSectionLabel, { marginTop: spacing.md }]}>Distancia desde ti</Text>

            {!hasReference ? (
              <View style={styles.modalNotice}>
                {locating ? (
                  // Si ya diste permiso antes, esto pasa solo (al abrir la app y al abrir
                  // Filtros) sin volver a preguntarte nada: mientras tanto mostramos que
                  // estamos buscando tu ubicación, no un aviso de "danos permiso".
                  <View style={styles.modalNoticeLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.modalNoticeText}>Obteniendo tu ubicación…</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.modalNoticeText}>
                      {denied
                        ? 'No tenemos permiso para usar tu ubicación. Actívalo en los ajustes del celular.'
                        : (error ?? 'No pudimos obtener tu ubicación todavía.')}
                    </Text>
                    {!denied ? (
                      <Button
                        title="Reintentar"
                        variant="secondary"
                        onPress={onRetryLocation}
                        style={styles.modalNoticeButton}
                      />
                    ) : null}
                  </>
                )}
              </View>
            ) : null}

            <View style={styles.radiusOptions}>
              {RADIUS_OPTIONS.map((option) => {
                const active = radiusValue === option.km;
                const disabled = option.km !== null && !hasReference;
                return (
                  <Pressable
                    key={option.label}
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={() => onSelectRadius(option.km)}
                    style={[styles.radiusOption, active && styles.radiusOptionActive, disabled && styles.modalOptionDisabled]}
                  >
                    <Text style={[styles.radiusOptionText, active && styles.radiusOptionTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.modalSectionLabel, { marginTop: spacing.md }]}>Disponibilidad</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: openNow }}
              onPress={() => onToggleOpenNow(!openNow)}
              style={[
                styles.radiusOption,
                openNow && styles.radiusOptionActive,
                { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' },
              ]}
            >
              <Ionicons name="time-outline" size={14} color={openNow ? '#fff' : colors.ink} style={{ marginRight: 4 }} />
              <Text style={[styles.radiusOptionText, openNow && styles.radiusOptionTextActive]}>Abiertos ahora</Text>
            </Pressable>
          </ScrollView>

          <Button title="Ver resultados" onPress={onClose} style={styles.modalApply} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CategoryGridItem({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.categoryItem}
    >
      <View style={[styles.categoryIconCircle, active && styles.categoryIconCircleActive]}>
        <Ionicons name={icon} size={22} color={active ? '#fff' : colors.ink} />
      </View>
      <Text style={[styles.categoryItemLabel, active && styles.categoryItemLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Buscador y chips flotan sobre el mapa: el mapa ocupa toda la pantalla.
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, gap: spacing.sm, paddingHorizontal: spacing.md },
  topRows: { gap: spacing.sm },
  content: { flex: 1, position: 'relative' },
  mapWrap: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#E8EEF6' },
  map: { flex: 1 },
  mapStartupLoading: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterScrollRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.ui.semibold, color: colors.ink },
  chipTextActive: { color: '#fff' },
  activeChips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  clearChip: { paddingHorizontal: spacing.xs, paddingVertical: 6 },
  clearChipText: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.primary },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.primary,
    maxWidth: 140,
  },
  activeChipText: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.ink, flexShrink: 1 },
  toggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  pinWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pinWrapSelected: { transform: [{ scale: 1.15 }] },
  pinOwnerLabel: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginBottom: 3,
  },
  pinOwnerLabelText: { fontSize: 10, fontFamily: fonts.ui.bold, color: '#fff' },
  offerBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    marginBottom: -2,
  },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinVerified: { backgroundColor: colors.verified },
  pinOwner: { borderColor: colors.accent, borderWidth: 3 },
  pinFar: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  pinFarSelected: { borderColor: colors.primary, borderWidth: 3 },
  pinMid: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  pinMidThumb: { width: 28, height: 28, borderRadius: 14 },
  pinMidFallback: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pinNearImg: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  pinNearThumb: { width: 40, height: 40, borderRadius: 20 },
  pinNearFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statusDot: { position: 'absolute', right: 1, bottom: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  list: { padding: spacing.md, paddingBottom: spacing.xxl + 64 },
  listRow: {},
  separator: { height: spacing.md },
  listHeader: { marginBottom: spacing.md, gap: 2 },
  listTitle: { fontSize: 24, fontFamily: fonts.display.bold, color: colors.ink },
  listHint: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  empty: { textAlign: 'center', fontFamily: fonts.ui.medium, color: colors.muted, marginTop: spacing.xxl },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  locateButtonWrap: {
    position: 'absolute',
    right: spacing.md,
  },
  locateButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  preview: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.xs,
    gap: spacing.xs,
    ...shadow,
  },
  previewButton: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  modalTitle: { fontSize: 19, fontFamily: fonts.display.semibold, color: colors.ink },
  modalClear: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.primary },
  modalScroll: { maxHeight: 420 },
  modalSectionLabel: {
    fontSize: 13,
    fontFamily: fonts.ui.semibold,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  categoryItem: { width: '25%', alignItems: 'center', marginBottom: spacing.md },
  categoryIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconCircleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryItemLabel: {
    fontSize: 11,
    fontFamily: fonts.ui.medium,
    color: colors.ink,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 72,
  },
  categoryItemLabelActive: { fontFamily: fonts.ui.bold, color: colors.primary },
  modalNotice: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalNoticeText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  modalNoticeLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalNoticeButton: { minHeight: 40 },
  radiusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  radiusOption: {
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
  },
  radiusOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modalOptionDisabled: { opacity: 0.4 },
  radiusOptionText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.ink },
  radiusOptionTextActive: { fontFamily: fonts.ui.bold, color: '#fff' },
  modalApply: { marginTop: spacing.md },
});
