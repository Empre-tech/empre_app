import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
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
import { discoveryApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import type { Category } from '@/api/types';
import { BusinessRow } from '@/components/BusinessRow';
import { BusinessBanner } from '@/components/BusinessBanner';
import { Button } from '@/components/Button';
import { FeaturedSheet } from '@/components/explore/FeaturedSheet';
import { type WithDistance } from '@/components/explore/FeaturedCard';
import { ModeFab } from '@/components/explore/ModeFab';
import { PlaceSheet } from '@/components/explore/PlaceSheet';
import { StackMarker } from '@/components/explore/StackMarker';
import { SearchBar } from '@/components/explore/SearchBar';
import { useFeaturedSheet } from '@/components/explore/useFeaturedSheet';
import { ZoneLabel } from '@/components/explore/ZoneLabel';
import { DEFAULT_REGION } from '@/config';
import { categoryColor } from '@/lib/categoryColor';
import { allWithinMeters, clusterByScreenDistance, type Cluster } from '@/lib/cluster';
import { distanceKm, hasLocation, type Coords } from '@/lib/geo';
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


// Cuántos negocios mostrar en el carrusel de Destacados.
const FEATURED_COUNT = 8;
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

  const [mode, setMode] = useState<'map' | 'list'>('map');
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
  // Nombre del barrio/zona donde estás, solo para la etiqueta sobre el mapa
  // ("12 negocios cerca de Bocagrande"): mejor esfuerzo vía reverse geocoding,
  // nunca bloquea nada si falla — la etiqueta cae de vuelta a "cerca de ti".
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  // Negocio seleccionado (tocar un pin abre su banner; el banner reemplaza a
  // Destacados y es la única vía al perfil).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mientras el usuario arrastra el mapa se oculta la etiqueta de zona.
  const [mapMoving, setMapMoving] = useState(false);
  // Negocios de una pila que comparten un mismo punto: se abren en «En este lugar».
  const [placeItems, setPlaceItems] = useState<WithDistance[] | null>(null);
  // Respaldo: si el arrastre termina sin que cambie la región, onRegionChangeComplete
  // no se dispara y la etiqueta se quedaría oculta; este temporizador la devuelve.
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (moveTimer.current) clearTimeout(moveTimer.current);
    },
    [],
  );
  const onMapDrag = () => {
    if (riseTimer.current) clearTimeout(riseTimer.current);
    if (sheet.getAnchor() !== 'hidden') sheet.snapTo('hidden');
    setMapMoving(true);
    if (moveTimer.current) clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => setMapMoving(false), 1500);
  };
  // Si todo queda quieto ~1 s, Destacados sube solo de la píldora a «peek».
  const scheduleRise = () => {
    if (riseTimer.current) clearTimeout(riseTimer.current);
    riseTimer.current = setTimeout(() => {
      if (canRise.current && sheet.getAnchor() === 'hidden') sheet.snapTo('peek');
    }, 1000);
  };
  // El mapa terminó de moverse: se actualiza la región y vuelve la etiqueta de zona.
  const onMapSettled = (next: Region) => {
    setRegion(next);
    if (moveTimer.current) clearTimeout(moveTimer.current);
    setMapMoving(false);
    scheduleRise();
  };
  // Destacados: hoja con cuatro anclajes (oculto, peek, medio, completo). El
  // anclaje completo ocupa ~60 % del contenido, que se mide con onLayout.
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const sheet = useFeaturedSheet(mapSize.height * 0.6);
  // Cuando el mapa queda quieto ~1 s, Destacados vuelve solo a «peek» (si no se
  // está buscando ni hay un negocio seleccionado).
  const riseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canRise = useRef(false);
  useEffect(
    () => () => {
      if (riseTimer.current) clearTimeout(riseTimer.current);
    },
    [],
  );

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

  useEffect(() => {
    if (!userCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await Location.reverseGeocodeAsync(userCoords);
        const place = results[0];
        const name = place?.district || place?.subregion || place?.city;
        if (!cancelled && name) setNeighborhood(name);
      } catch {
        // Sin conexión o sin resultados: el saludo se queda en "cerca de ti".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userCoords]);

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
  const previousFiltersRef = useRef({ categoryId, subcategoryId, debouncedSearch });
  useEffect(() => {
    const previous = previousFiltersRef.current;
    const changed =
      previous.categoryId !== categoryId ||
      previous.subcategoryId !== subcategoryId ||
      previous.debouncedSearch !== debouncedSearch;
    previousFiltersRef.current = { categoryId, subcategoryId, debouncedSearch };
    if (!changed || !userCoords) return;
    setMode('map');
    mapRef.current?.animateToRegion({ ...userCoords, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
  }, [categoryId, subcategoryId, debouncedSearch, userCoords]);

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
  const centeredOnUser = useMemo(() => {
    if (!reference) return false;
    return distanceKm(reference, { latitude: region.latitude, longitude: region.longitude }) < 1;
  }, [reference, region]);

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });
  const entities = useQuery({
    queryKey: [
      'discovery',
      categoryId ?? 'all',
      subcategoryId ?? 'all',
      debouncedSearch,
      bbox.min_lat,
      bbox.min_lng,
      bbox.max_lat,
      bbox.max_lng,
      reference ? `${reference.latitude.toFixed(3)},${reference.longitude.toFixed(3)}` : 'no-ref',
    ],
    queryFn: () =>
      discoveryApi.discover({
        ...bbox,
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

  // Destacados salen de la misma respuesta que los pines (área visible): los
  // primeros resultados, sin el negocio propio.
  const featured = useMemo(
    () => items.filter((entity) => !myEntityIds.has(entity.id)).slice(0, FEATURED_COUNT),
    [items, myEntityIds],
  );
  // Hay negocios, pero todos son el propio: mensaje "solo está tu negocio".
  const onlyMine = items.length > 0 && featured.length === 0;
  useEffect(() => {
    canRise.current = !search && !selectedId && (featured.length > 0 || onlyMine);
  });

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

  const claimOffer = (offerId: string, title: string) => {
    router.push({ pathname: '/offer/claim', params: { offerId, title } });
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

  // Etiqueta flotante sobre el mapa: reemplaza al saludo, al título y al contador.
  const zoneText = !entities.data
    ? null
    : total === 0
      ? 'Sin negocios en esta zona'
      : `${total} ${total === 1 ? 'negocio' : 'negocios'} ${
          centeredOnUser ? `cerca de ${neighborhood ?? 'ti'}` : 'en esta zona'
        }${total > items.length ? ` · los mejores ${items.length}` : ''}`;

  // Los botones flotantes se apilan sobre el panel de Destacados: el de ubicación
  // va pegado a él y «Lista» queda justo encima, sin taparse entre sí.
  const locateBottom =
    featured.length > 0 || onlyMine
      ? Animated.add(sheet.buttonsBase, insets.bottom + spacing.md)
      : spacing.lg + insets.bottom;
  const modeFabBottom = typeof locateBottom === 'number' ? locateBottom + 56 : Animated.add(locateBottom, 56);

  return (
    <View style={styles.screen}>
      {/* Barra superior: siempre sólida y en el flujo normal (nunca "flota"
          transparente sobre el mapa). Dos filas: buscador (con Filtros dentro)
          y chips de categoría. El contexto y el cambio mapa/lista flotan sobre
          el mapa. */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <SearchBar
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            if (text && sheet.getAnchor() !== 'hidden') sheet.snapTo('hidden');
            if (!text) scheduleRise();
          }}
          onOpenFilters={openFilters}
          filterCount={activeFilterCount}
        />

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
                <ActiveChip
                  icon="pricetag-outline"
                  label={selectedSubcategory.name}
                  onRemove={() => setSubcategoryId(undefined)}
                />
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

          {/* Atajos de categoría: explorar con un toque, sin abrir Filtros.
              También están dentro de Filtros (con subcategorías), pero acá
              quedan a la vista para no tener que abrir el modal siempre. */}
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
                <Ionicons
                  name={(category.icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={active ? '#fff' : colors.primary}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
                {active ? <Ionicons name="close" size={14} color="#fff" /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Zona de contenido: mapa (con esquinas redondeadas arriba, como el
          mockup) o lista, con el loading/error flotando sobre lo que sea
          que esté activo. */}
      <View style={styles.content} onLayout={(e) => setMapSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {mode === 'map' ? (
          <View style={styles.mapWrap}>
            {startupRegion === null ? (
              // Resolviendo si ya había permiso/posición para arrancar
              // centrados de una (ver el useEffect de arriba): normalmente
              // dura muy poco, así que esto casi nunca se alcanza a ver.
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

            {/* Botón de "mi ubicación" y tarjeta de Destacados (ocultos
                mientras hay un negocio seleccionado: el banner los reemplaza). */}
            {!selectedEntity && !placeItems ? (
              <>
                <Animated.View
                  style={[
                    styles.locateButtonWrap,
                    { bottom: locateBottom },
                  ]}
                >
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
                    {locating ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="navigate" size={21} color={colors.primary} />
                    )}
                  </Pressable>
                </Animated.View>

                <FeaturedSheet
                  sheet={sheet}
                  featured={featured}
                  onlyMine={onlyMine}
                  title={selectedCategory ? `Destacados en ${selectedCategory.name}` : 'Destacados cerca de ti'}
                  bottomInset={insets.bottom}
                  onOpenBusiness={openBusiness}
                  onSeeList={() => setMode('list')}
                />
              </>
            ) : null}

            {selectedEntity ? (
              <BusinessBanner
                entity={selectedEntity}
                isMine={myEntityIds.has(selectedEntity.id)}
                onClose={() => setSelectedId(null)}
                onDirections={() => directionsTo(selectedEntity.latitude, selectedEntity.longitude)}
                onProfile={() => openBusiness(selectedEntity.id)}
                onClaimOffer={claimOffer}
                onScan={() => router.push('/business/scan')}
                onPublishOffer={() =>
                  router.push({ pathname: '/business/offers', params: { entityId: selectedEntity.id } })
                }
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
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <BusinessRow entity={item} distanceKm={item.distanceKm} onPress={() => openBusiness(item.id)} style={styles.listRow} />
            )}
            refreshing={entities.isRefetching}
            onRefresh={() => {
              void entities.refetch();
            }}
            ListHeaderComponent={
              items.length > 0 ? (
                <View style={styles.listHeader}>
                  <Text style={styles.listTitle}>{reference ? 'Cerca de ti' : 'Negocios'}</Text>
                  <Text style={styles.listHint}>
                    {items.length} {items.length === 1 ? 'negocio' : 'negocios'}
                    {reference ? ' · los más cercanos primero' : ''}
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              entities.isLoading ? null : (
                <Text style={styles.empty}>
                  {entities.isError
                    ? 'No pudimos cargar los negocios.'
                    : debouncedSearch || radiusKm
                      ? 'No encontramos negocios con esos filtros.'
                      : 'Todavía no hay negocios en esta categoría.'}
                </Text>
              )
            }
          />
        )}

        {mode === 'map' && startupRegion !== null ? <ZoneLabel text={zoneText} visible={!mapMoving} /> : null}

        {mode === 'list' || (!selectedEntity && !placeItems) ? (
          <ModeFab
            mode={mode}
            onPress={() => setMode(mode === 'map' ? 'list' : 'map')}
            bottom={mode === 'map' ? modeFabBottom : spacing.lg + insets.bottom}
          />
        ) : null}

        {entities.isLoading && !entities.data ? (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {entities.isError && !entities.isLoading ? (
          <View style={styles.errorBanner}>
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
            setMode('map');
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
  // Barra superior: siempre en el flujo normal (nunca "flota" transparente
  // sobre el mapa), como en el mockup — el mapa queda como protagonista,
  // con esquinas redondeadas arriba, debajo de este bloque sólido.
  topBar: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.xs, backgroundColor: colors.bg },
  content: { flex: 1, position: 'relative' },
  mapWrap: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    backgroundColor: '#E8EEF6',
  },
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
