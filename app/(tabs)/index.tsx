import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi, entitiesApi } from '@/api/endpoints';
import { claimsApi, discoverApi, discoveryApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import type { Category, DiscoverItem, DiscoverSectionId } from '@/api/types';
import { Button } from '@/components/Button';
import { BusinessSheet } from '@/components/explore/BusinessSheet';
import { type CardModel } from '@/components/explore/ExploreCards';
import { ExploreSheet } from '@/components/explore/ExploreSheet';
import { type WithDistance } from '@/components/explore/FeaturedCard';
import { PlaceSheet } from '@/components/explore/PlaceSheet';
import { StackMarker } from '@/components/explore/StackMarker';
import { SearchBar } from '@/components/explore/SearchBar';
import { useFeaturedSheet } from '@/components/explore/useFeaturedSheet';
import { DEFAULT_REGION } from '@/config';
import { categoryColor } from '@/lib/categoryColor';
import { effectiveClaimStatus } from '@/lib/claims';
import { boxAround, openLine, reasonPill, relatedFrom, SEARCH_NEAR_KM, sheetHeader } from '@/lib/discover';
import { formatDistance } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { allWithinMeters, clusterByScreenDistance, type Cluster } from '@/lib/cluster';
import { hasLocation, type Coords } from '@/lib/geo';
import { resolveImageUrl } from '@/lib/image';
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


type ZoomTier = 'far' | 'mid' | 'near';

/** Nivel de zoom según el delta de latitud de la región visible del mapa.
 * La imagen del negocio solo aparece de cerca; al alejarte se reduce a un
 * punto de color que no estorba (con muchos negocios, las imágenes grandes
 * serían un estorbo). */
function zoomTier(region: Region): ZoomTier {
  if (region.latitudeDelta < 0.012) return 'near';
  if (region.latitudeDelta < 0.05) return 'mid';
  return 'far';
}

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>();
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  // Región con la que se monta el mapa la PRIMERA vez: null mientras no
  // sabemos todavía si conviene arrancar ya centrados en el usuario (si ya
  // había dado permiso antes) o mostrar la vista general de todo el país
  // (si no, o si no hay una posición reciente a mano). Evita el "salto" de
  // ver primero Colombia completa y luego animar hacia la ubicación real.
  const [startupRegion, setStartupRegion] = useState<Region | null>(null);
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
  const previousFiltersRef = useRef({ categoryId, subcategoryId });
  useEffect(() => {
    const previous = previousFiltersRef.current;
    const changed = previous.categoryId !== categoryId || previous.subcategoryId !== subcategoryId;
    previousFiltersRef.current = { categoryId, subcategoryId };
    // Con búsqueda el mapa se encuadra en los resultados (más abajo), no en el usuario.
    if (!changed || !userCoords || debouncedSearch) return;
    mapRef.current?.animateToRegion({ ...userCoords, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
  }, [categoryId, subcategoryId, debouncedSearch, userCoords]);

  // Una búsqueda nueva empieza en la zona de la persona (o, sin ubicación, donde mira el mapa), en la
  // vista de resultados; borrarla vuelve a Descubre.
  const [lastSearch, setLastSearch] = useState('');
  if (lastSearch !== debouncedSearch) {
    setLastSearch(debouncedSearch);
    const center = userCoords ?? { latitude: region.latitude, longitude: region.longitude };
    setSearchArea(debouncedSearch ? { ...boxAround(center, SEARCH_NEAR_KM), kind: 'near' } : null);
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
  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });
  const searching = debouncedSearch.length > 0;
  // Sin búsqueda: la zona visible. Con búsqueda: toda la ciudad, o la zona que el usuario pidió.
  const scope = searching
    ? searchArea && { min_lat: searchArea.min_lat, max_lat: searchArea.max_lat, min_lng: searchArea.min_lng, max_lng: searchArea.max_lng }
    : bbox;
  const searchScope = searchArea ? searchArea.kind : 'all';
  const refKey = reference ? `${reference.latitude.toFixed(3)},${reference.longitude.toFixed(3)}` : 'no-ref';
  const entities = useQuery({
    queryKey: [
      'discovery',
      categoryId ?? 'all',
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
        category: categoryId,
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

  // Descubre: lo arma el servidor para la zona visible (también se ve durante una búsqueda).
  const sectionsQuery = useQuery({
    queryKey: ['discover-sections', categoryId ?? 'all', subcategoryId ?? 'all', bbox.min_lat, bbox.min_lng, bbox.max_lat, bbox.max_lng, refKey],
    queryFn: () => discoverApi.sections({ ...bbox, lat: reference?.latitude, long: reference?.longitude, category: categoryId, subcategory: subcategoryId }),
    enabled: startupRegion !== null,
    placeholderData: keepPreviousData,
  });
  // «Ver más» de una sección: la misma regla, con más negocios.
  const sectionMoreQuery = useQuery({
    queryKey: ['discover-section', sectionFilter, categoryId ?? 'all', subcategoryId ?? 'all', bbox.min_lat, bbox.min_lng, bbox.max_lat, bbox.max_lng, refKey],
    queryFn: () => discoverApi.sections({ ...bbox, lat: reference?.latitude, long: reference?.longitude, category: categoryId, subcategory: subcategoryId, section: sectionFilter ?? undefined, limit: 50 }),
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

  const items = useMemo<WithDistance[]>(() => {
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

  const mapped = useMemo(() => items.filter(hasLocation), [items]);
  const tier = zoomTier(region);
  // Lejos los pines son puntos de 18 pt; de cerca, portales de ~44 pt: el umbral
  // de agrupación acompaña. Al acercar el zoom los negocios se alejan en pantalla
  // y la pila se abre sola.
  const clusterPx = tier === 'far' ? 22 : 44;
  const clusters = useMemo(
    () => clusterByScreenDistance(mapped, region, mapSize, clusterPx),
    [mapped, region, mapSize, clusterPx],
  );
  const total = entities.data?.total ?? 0;

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
    const key = `${debouncedSearch}|${categoryId}|${searchScope}`;
    if (fittedRef.current === key) return;
    fittedRef.current = key;
    if (sheet.getAnchor() === 'peek') sheet.snapTo('medium');
    const coords = items.filter(hasLocation).slice(0, 20).map((e) => ({ latitude: e.latitude, longitude: e.longitude }));
    // Se encuadra lo encontrado cerca o más lejos; si la persona eligió la zona, el mapa no se mueve.
    if (coords.length > 0 && searchScope !== 'zone') {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 150, right: 48, bottom: sheet.heights.medium + 40, left: 48 },
        animated: true,
      });
    }
  }, [searching, resultsStatus, debouncedSearch, categoryId, searchScope, items, sheet]);

  const openBusiness = (id: string) => router.push({ pathname: '/business/[id]', params: { id } });

  const selectedEntity = useMemo(
    () => (selectedId ? items.find((e) => e.id === selectedId) ?? null : null),
    [items, selectedId],
  );

  // Toca un pin: selecciona y centra dejando espacio abajo para que el banner
  // no tape el pin (el centro queda un poco al sur del negocio).
  const selectBusiness = (id: string, coords: { latitude: number; longitude: number }) => {
    setSelectedId(id);
    setPlaceItems(null);
    mapRef.current?.animateToRegion(
      { latitude: coords.latitude - 0.0016, longitude: coords.longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 },
      400,
    );
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

  const directionsTo = (latitude: number, longitude: number) => {
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`);
  };

  const clearAllFilters = () => {
    setCategoryId(undefined);
    setSubcategoryId(undefined);
    setRadiusKm(null);
    setOpenNow(false);
  };

  const openFilters = () => {
    if (!reference && !locating) void requestLocation();
    setFiltersOpen(true);
  };

  const activeFilterCount = (categoryId ? 1 : 0) + (subcategoryId ? 1 : 0) + (radiusKm !== null ? 1 : 0) + (openNow ? 1 : 0);
  const selectedCategory = (categories.data ?? []).find((c) => c.id === categoryId) ?? null;
  const selectedSubcategory = (selectedCategory?.subcategories ?? []).find((s) => s.id === subcategoryId) ?? null;
  const radiusLabel = radiusKm ? `< ${radiusKm} km` : null;
  // El chip de la categoría elegida va primero, para que siempre se vea y se pueda quitar.
  const orderedCategories = [...(categories.data ?? [])].sort(
    (a, b) => Number(b.id === categoryId) - Number(a.id === categoryId),
  );

  const toModel = (e: WithDistance, line?: string): CardModel => ({
    id: e.id,
    name: e.name,
    latitude: e.latitude,
    longitude: e.longitude,
    image: e.profile_url,
    color: categoryColor(e.category_color),
    icon: e.category_icon || 'storefront',
    open: e.has_hours ? e.is_open_now : null,
    distance: formatDistance(e.distanceKm),
    sub: e.subcategory || e.category_name,
    line,
    pill: e.has_active_offer && e.active_offer ? reasonPill({ kind: 'offer', ends_at: e.active_offer.ends_at }, now) : null,
    mine: qrByEntity.has(e.id),
  });
  const discoverModel = (it: DiscoverItem, sectionId: DiscoverSectionId): CardModel => ({
    id: it.entity_id,
    name: it.name,
    latitude: it.latitude,
    longitude: it.longitude,
    image: it.profile_url,
    cover: it.cover_url,
    color: categoryColor(it.category_color),
    icon: it.category_icon || 'storefront',
    open: it.is_open_now,
    distance: formatDistance(it.distance_meters > 0 ? it.distance_meters / 1000 : null),
    sub: it.subcategory || it.category_name,
    line: sectionId === 'open' ? openLine(it.closes_at) : it.tagline || undefined,
    pill: reasonPill(it.reason, now),
    mine: qrByEntity.has(it.entity_id),
  });
  const zoneModels = searching ? [] : items.map((e) => toModel(e));
  const header = sheetHeader({
    searching,
    query: debouncedSearch,
    status: resultsStatus,
    results: items.length,
    scope: searchScope,
    zoneCount: total,
    categoryName: selectedCategory?.name,
  });
  const sections = sectionsQuery.data ?? [];
  const avatars = (sections[0]?.items ?? []).slice(0, 3).map((it) => ({ key: it.entity_id, color: categoryColor(it.category_color).fg, letter: it.name.charAt(0) }));
  const sectionTitle = sections.find((sec) => sec.id === sectionFilter)?.title ?? '';
  const onSelectCard = (m: CardModel) => {
    // Si el negocio está entre los pines, se selecciona en el mapa; si no, se abre su perfil.
    if (items.some((e) => e.id === m.id)) selectBusiness(m.id, { latitude: m.latitude, longitude: m.longitude });
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
              {clusters.map((cluster) => {
                const [only] = cluster.items;
                const coordinate = { latitude: cluster.latitude, longitude: cluster.longitude };

                if (cluster.items.length === 1 && only) {
                  const isMine = myEntityIds.has(only.id);
                  const isSelected = only.id === selectedId;
                  const cat = categoryColor(only.category_color);
                  const open = only.has_hours ? only.is_open_now : true;
                  const icon = (only.category_icon || 'storefront') as keyof typeof Ionicons.glyphMap;
                  const thumb = only.profile_url ? resolveImageUrl(only.profile_url) : null;
                  // Borde: ámbar si hay ofertas, azul si está seleccionado, blanco si no.
                  const hasOffer = only.has_active_offer;
                  const showRayo = hasOffer && (only.active_offer?.type === 'HORAS' || only.active_offer?.type === 'DIA');
                  const borderColor = isSelected ? colors.primary : hasOffer ? colors.accent : '#ffffff';
                  const statusColor = open ? '#2E9E5B' : '#9AA7B5';
                  return (
                    <Marker
                      key={cluster.key}
                      coordinate={coordinate}
                      zIndex={isSelected ? 1000 : 1}
                      onPress={(event) => {
                        event.stopPropagation();
                        selectBusiness(only.id, coordinate);
                      }}
                    >
                      <View collapsable={false} style={[styles.pinWrap, isSelected && styles.pinWrapSelected]}>
                        {isMine ? (
                          <View style={styles.pinOwnerLabel}>
                            <Text style={styles.pinOwnerLabelText}>Tu negocio</Text>
                          </View>
                        ) : null}
                        {showRayo ? (
                          <View style={styles.offerBadge}>
                            <Ionicons name="flash" size={11} color={colors.ink} />
                          </View>
                        ) : null}
                        {tier === 'near' ? (
                          <View style={[styles.pinNearImg, { borderColor }]}>
                            {thumb ? (
                              <Image accessible={false} source={{ uri: thumb }} style={styles.pinNearThumb} contentFit="cover" transition={120} />
                            ) : (
                              <View style={[styles.pinNearFallback, { backgroundColor: cat.bg }]}>
                                <Ionicons name={icon} size={20} color={cat.fg} />
                              </View>
                            )}
                            {only.has_hours ? <View style={[styles.statusDot, { backgroundColor: statusColor }]} /> : null}
                          </View>
                        ) : tier === 'mid' ? (
                          <View style={[styles.pinMid, { borderColor }]}>
                            {thumb ? (
                              <Image accessible={false} source={{ uri: thumb }} style={styles.pinMidThumb} contentFit="cover" transition={120} />
                            ) : (
                              <View style={[styles.pinMidFallback, { backgroundColor: cat.bg }]}>
                                <Ionicons name={icon} size={16} color={cat.fg} />
                              </View>
                            )}
                            {only.has_hours ? <View style={[styles.statusDot, { backgroundColor: statusColor }]} /> : null}
                          </View>
                        ) : (
                          <View style={[styles.pinFar, { backgroundColor: cat.fg }, isSelected && styles.pinFarSelected]} />
                        )}
                      </View>
                    </Marker>
                  );
                }

                // Varios negocios muy juntos: pila de miniaturas, nunca un número. El
                // nivel de zoom va en la key para que el marcador se vuelva a dibujar.
                return (
                  <StackMarker key={`${cluster.key}-${tier}`} cluster={cluster} tier={tier} onPress={() => onStackPress(cluster)} />
                );
              })}
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
              zone={{ status: entities.isError ? 'error' : entities.isLoading ? 'loading' : 'ok', items: zoneModels }}
              results={{
                status: resultsStatus,
                items: searching ? items.map((e) => toModel(e)) : [],
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
              onDirections={() => directionsTo(selectedEntity.latitude, selectedEntity.longitude)}
              onProfile={(offerId) =>
                router.push({ pathname: '/business/[id]', params: offerId ? { id: selectedEntity.id, offer: offerId } : { id: selectedEntity.id } })
              }
              onScan={() => router.push('/business/scan')}
              onPublishOffer={() => router.push({ pathname: '/business/offers', params: { entityId: selectedEntity.id } })}
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

        {/* Buscador y chips flotan sobre el mapa (sin barra sólida). */}
        <Animated.View style={[styles.topBar, { paddingTop: insets.top + spacing.sm, opacity: topFade }]} pointerEvents={mapMoving ? 'none' : 'box-none'}>
          <SearchBar value={search} onChangeText={setSearch} onOpenFilters={openFilters} filterCount={activeFilterCount} />

          {tall || selectedEntity ? null : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.filterScrollRow}
              style={styles.filterScroll}
            >
              {selectedSubcategory || radiusLabel || openNow ? (
                <View style={styles.activeChips}>
                  {selectedSubcategory ? (
                    <ActiveChip icon="pricetag-outline" label={selectedSubcategory.name} onRemove={() => setSubcategoryId(undefined)} />
                  ) : null}
                  {radiusLabel ? <ActiveChip icon="navigate" label={radiusLabel} onRemove={() => setRadiusKm(null)} /> : null}
                  {openNow ? <ActiveChip icon="time-outline" label="Abiertos ahora" onRemove={() => setOpenNow(false)} /> : null}
                  {activeFilterCount >= 2 ? (
                    <Pressable accessibilityRole="button" accessibilityLabel="Limpiar todos los filtros" onPress={clearAllFilters} hitSlop={8} style={styles.clearChip}>
                      <Text style={styles.clearChipText}>Limpiar</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {orderedCategories.map((category) => {
                const active = categoryId === category.id;
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Categoría ${category.name}`}
                    accessibilityHint={active ? 'Toca para quitar el filtro' : undefined}
                    onPress={() => {
                      setCategoryId(active ? undefined : category.id);
                      setSubcategoryId(undefined);
                    }}
                    hitSlop={4}
                    style={[styles.categoryChip, active && styles.chipActive]}
                  >
                    <Ionicons name={(category.icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} size={16} color={active ? '#fff' : colors.primary} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
                    {active ? <Ionicons name="close" size={14} color="#fff" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {searching && areaDirty && resultsStatus !== 'loading' && !selectedEntity ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSearchArea({ ...bbox, kind: 'zone' });
                setAreaDirty(false);
              }}
              style={styles.areaButton}
            >
              <Ionicons name="refresh" size={14} color="#fff" />
              <Text style={styles.areaButtonText}>Buscar en esta zona</Text>
            </Pressable>
          ) : null}
        </Animated.View>

        {entities.isError && !entities.isLoading && !searching ? (
          <View style={[styles.errorBanner, { top: insets.top + 120 }]}>
            <Text style={styles.errorText}>No pudimos cargar los negocios. Revisa la conexión con el servidor.</Text>
            <Button title="Reintentar" variant="secondary" onPress={() => void entities.refetch()} style={styles.retry} />
          </View>
        ) : null}
      </View>

      <FiltersModal
        visible={filtersOpen}
        categories={categories.data ?? []}
        categoryId={categoryId}
        onSelectCategory={(id) => {
          setCategoryId(id);
          setSubcategoryId(undefined);
        }}
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
      <Pressable accessibilityRole="button" accessibilityLabel={`Quitar filtro ${label}`} onPress={onRemove} hitSlop={8}>
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
  areaButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.ink, ...shadow },
  areaButtonText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
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
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  empty: { textAlign: 'center', fontFamily: fonts.ui.medium, color: colors.muted, marginTop: spacing.xxl },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  errorBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow,
  },
  errorText: { color: colors.danger, fontSize: 14, fontFamily: fonts.ui.semibold },
  retry: { minHeight: 40 },
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
