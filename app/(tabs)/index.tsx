import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi, entitiesApi } from '@/api/endpoints';
import type { Category, EntityMap } from '@/api/types';
import { BusinessRow } from '@/components/BusinessRow';
import { Button } from '@/components/Button';
import { DEFAULT_REGION } from '@/config';
import { categoryColor } from '@/lib/categoryColor';
import { clusterItems } from '@/lib/cluster';
import { distanceKm, hasLocation, type Coords } from '@/lib/geo';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts, radius, spacing } from '@/theme';

type WithDistance = EntityMap & { distanceKm: number | null };

/** Opciones del filtro "cerca de mí". `null` = sin límite de distancia. */
const RADIUS_OPTIONS: { label: string; km: number | null }[] = [
  { label: 'Cualquier distancia', km: null },
  { label: 'Menos de 1 km', km: 1 },
  { label: 'Menos de 3 km', km: 3 },
  { label: 'Menos de 5 km', km: 5 },
  { label: 'Menos de 10 km', km: 10 },
  { label: 'Menos de 20 km', km: 20 },
];

/** "Buenos días/tardes/noches" según la hora del celular. */
function greetingNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// Cuántos negocios mostrar en el carrusel de Destacados.
const FEATURED_COUNT = 8;
// Alto aproximado de la tarjeta de Destacados flotando sobre el mapa —
// se usa para no tapar el botón de "mi ubicación" ni el pin seleccionado.
const FEATURED_CARD_HEIGHT = 190;

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>();
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  // Nombre del barrio/zona donde estás, solo para el saludo ("Negocios cerca
  // de Bocagrande"): mejor esfuerzo vía reverse geocoding, nunca bloquea nada
  // si falla — el saludo cae de vuelta a "cerca de ti".
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [selected, setSelected] = useState<EntityMap | null>(null);

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

  // Pide la ubicación del usuario (permite centrar el mapa y ordenar/filtrar por distancia).
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

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });
  const entities = useQuery({
    queryKey: [
      'entities',
      categoryId ?? 'all',
      subcategoryId ?? 'all',
      debouncedSearch,
      radiusKm ?? 'any',
      radiusKm && reference ? `${reference.latitude.toFixed(3)},${reference.longitude.toFixed(3)}` : 'no-ref',
      openNow,
    ],
    queryFn: () =>
      entitiesApi.list({
        category: categoryId,
        subcategory: subcategoryId,
        q: debouncedSearch || undefined,
        // El backend filtra por caja (aproximado); el radio exacto lo afinamos abajo con Haversine.
        ...(radiusKm && reference
          ? { lat: reference.latitude, long: reference.longitude, radius: radiusKm * 1000 }
          : {}),
        openNow,
      }),
  });

  const items = useMemo<WithDistance[]>(() => {
    const withDistance = (entities.data ?? []).map((entity) => ({
      ...entity,
      distanceKm: reference && hasLocation(entity) ? distanceKm(reference, entity) : null,
    }));
    const filtered =
      radiusKm && reference
        ? withDistance.filter((entity) => entity.distanceKm !== null && entity.distanceKm <= radiusKm)
        : withDistance;
    return filtered.sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [entities.data, reference, radiusKm]);

  const mapped = useMemo(() => items.filter(hasLocation), [items]);
  const clusters = useMemo(() => clusterItems(mapped, region), [mapped, region]);

  // Destacados: los mejor calificados primero; si todavía nadie tiene
  // reseñas (una ciudad/categoría recién empezando), mostramos los más
  // cercanos en su lugar — `items` ya viene ordenado por distancia.
  const featured = useMemo(() => {
    if (items.length === 0) return [];
    const rated = items
      .filter((entity) => entity.review_count > 0)
      .sort((a, b) => b.avg_rating - a.avg_rating || b.review_count - a.review_count);
    return (rated.length > 0 ? rated : items).slice(0, FEATURED_COUNT);
  }, [items]);

  const openBusiness = (id: string) => router.push({ pathname: '/business/[id]', params: { id } });

  const openFilters = () => {
    if (!reference && !locating) void requestLocation();
    setFiltersOpen(true);
  };

  const activeFilterCount = (categoryId ? 1 : 0) + (subcategoryId ? 1 : 0) + (radiusKm !== null ? 1 : 0) + (openNow ? 1 : 0);
  const selectedCategory = (categories.data ?? []).find((c) => c.id === categoryId) ?? null;
  const selectedSubcategory = (selectedCategory?.subcategories ?? []).find((s) => s.id === subcategoryId) ?? null;
  const radiusLabel = radiusKm ? `< ${radiusKm} km` : null;

  return (
    <View style={styles.screen}>
      {/* Barra superior: siempre sólida y en el flujo normal (nunca "flota"
          transparente sobre el mapa) — así el status bar y el saludo nunca
          dependen de qué haya pintado el mapa debajo, y el mapa queda como
          protagonista con esquinas redondeadas arriba, tal como el mockup. */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.greetingRow}>
          <Text style={styles.greetingKicker}>{greetingNow()}</Text>
          <Text style={styles.greetingTitle}>Negocios cerca de {neighborhood ?? 'ti'}</Text>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Busca un negocio, categoría o barrio"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
            {search ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mode === 'map' ? 'Ver como lista' : 'Ver en el mapa'}
            onPress={() => {
              setSelected(null);
              setMode(mode === 'map' ? 'list' : 'map');
            }}
            style={styles.toggle}
          >
            <Ionicons name={mode === 'map' ? 'list' : 'map'} size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir filtros"
            onPress={openFilters}
            style={[styles.filtersButton, activeFilterCount > 0 && styles.chipActive]}
          >
            <Ionicons name="options-outline" size={16} color={activeFilterCount > 0 ? '#fff' : colors.ink} />
            <Text style={[styles.chipText, activeFilterCount > 0 && styles.chipTextActive]}>Filtros</Text>
            {activeFilterCount > 0 ? (
              <View style={styles.filtersBadge}>
                <Text style={styles.filtersBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.filterScrollRow}
            style={styles.filterScroll}
          >
          {selectedCategory || selectedSubcategory || radiusLabel || openNow ? (
            <View style={styles.activeChips}>
              {selectedCategory ? (
                <ActiveChip
                  icon={(selectedCategory.icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap}
                  label={selectedCategory.name}
                  onRemove={() => {
                    setCategoryId(undefined);
                    setSubcategoryId(undefined);
                  }}
                />
              ) : null}
              {selectedSubcategory ? (
                <ActiveChip
                  icon="pricetag-outline"
                  label={selectedSubcategory.name}
                  onRemove={() => setSubcategoryId(undefined)}
                />
              ) : null}
              {radiusLabel ? <ActiveChip icon="navigate" label={radiusLabel} onRemove={() => setRadiusKm(null)} /> : null}
              {openNow ? <ActiveChip icon="time-outline" label="Abiertos ahora" onRemove={() => setOpenNow(false)} /> : null}
            </View>
          ) : null}

          {/* Atajos de categoría: explorar con un toque, sin abrir Filtros.
              También están dentro de Filtros (con subcategorías), pero acá
              quedan a la vista para no tener que abrir el modal siempre. */}
          {(categories.data ?? []).map((category) => {
            const active = categoryId === category.id;
            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Categoría ${category.name}`}
                onPress={() => {
                  setCategoryId(active ? undefined : category.id);
                  setSubcategoryId(undefined);
                }}
                style={[styles.categoryChip, active && styles.chipActive]}
              >
                <Ionicons
                  name={(category.icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={active ? '#fff' : colors.primary}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
              </Pressable>
            );
          })}
          </ScrollView>
        </View>
      </View>

      {/* Zona de contenido: mapa (con esquinas redondeadas arriba, como el
          mockup) o lista, con el loading/error flotando sobre lo que sea
          que esté activo. */}
      <View style={styles.content}>
        {mode === 'map' ? (
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={DEFAULT_REGION}
              showsUserLocation
              showsMyLocationButton={false}
              onMapReady={() => setMapReady(true)}
              onRegionChangeComplete={setRegion}
              onPress={() => setSelected(null)}
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
                  return (
                    <Marker
                      key={cluster.key}
                      coordinate={coordinate}
                      onPress={(event) => {
                        event.stopPropagation();
                        setSelected(only);
                      }}
                    >
                      <View
                        style={[
                          styles.pin,
                          { backgroundColor: categoryColor(only.category_id).fg },
                          only.is_verified && styles.pinVerified,
                        ]}
                      >
                        <Ionicons
                          name={(only.category_icon || 'storefront') as keyof typeof Ionicons.glyphMap}
                          size={16}
                          color="#fff"
                        />
                      </View>
                    </Marker>
                  );
                }

                return (
                  <Marker
                    key={cluster.key}
                    coordinate={coordinate}
                    onPress={(event) => {
                      event.stopPropagation();
                      mapRef.current?.animateToRegion(
                        {
                          ...coordinate,
                          latitudeDelta: region.latitudeDelta / 2.5,
                          longitudeDelta: region.longitudeDelta / 2.5,
                        },
                        300,
                      );
                    }}
                  >
                    <View style={styles.cluster}>
                      <Text style={styles.clusterText}>{cluster.items.length}</Text>
                    </View>
                  </Marker>
                );
              })}
            </MapView>

            {/* Botón de "mi ubicación" y tarjeta de Destacados: solo cuando no
                hay un negocio seleccionado (esa vista previa ya ocupa la
                misma zona inferior). */}
            {!selected ? (
              <>
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
                  style={[styles.locateButton, { bottom: (featured.length > 0 ? FEATURED_CARD_HEIGHT : spacing.lg) + insets.bottom }]}
                >
                  {locating ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="navigate" size={21} color={colors.primary} />
                  )}
                </Pressable>

                {featured.length > 0 ? (
                  <View style={[styles.featuredCard, { paddingBottom: insets.bottom + spacing.sm }]}>
                    <View style={styles.featuredHandle} />
                    <View style={styles.featuredHeader}>
                      <Text style={styles.featuredTitle}>Destacados cerca de ti</Text>
                      <Pressable accessibilityRole="button" onPress={() => setMode('list')} hitSlop={8}>
                        <Text style={styles.featuredSeeAll}>Ver todos</Text>
                      </Pressable>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredList}>
                      {featured.map((entity) => (
                        <FeaturedCard key={entity.id} entity={entity} onPress={() => openBusiness(entity.id)} />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </>
            ) : null}

            {/* Vista previa del negocio seleccionado (solo mapa) */}
            {selected ? (
              <View style={styles.preview}>
                <BusinessRow
                  entity={selected}
                  distanceKm={reference && hasLocation(selected) ? distanceKm(reference, selected) : null}
                  onPress={() => openBusiness(selected.id)}
                />
                <Button title="Ver perfil" onPress={() => openBusiness(selected.id)} style={styles.previewButton} />
              </View>
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

        {entities.isLoading ? (
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
        onClear={() => {
          setCategoryId(undefined);
          setSubcategoryId(undefined);
          setRadiusKm(null);
          setOpenNow(false);
        }}
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

/** Una tarjeta del carrusel de Destacados: miniatura cuadrada + nombre, distancia y rating. */
function FeaturedCard({ entity, onPress }: { entity: WithDistance; onPress: () => void }) {
  const src = resolveImageUrl(entity.profile_url);
  const distance = formatFeaturedDistance(entity.distanceKm);
  const hasRating = entity.review_count > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil de ${entity.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.featuredItem, pressed && { opacity: 0.85 }]}
    >
      {src ? (
        <Image source={{ uri: src }} style={styles.featuredImage} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.featuredImage, styles.featuredImageFallback]}>
          <Ionicons
            name={(entity.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap}
            size={26}
            color={colors.primary}
          />
        </View>
      )}
      <View style={styles.featuredInfo}>
        <Text style={styles.featuredName} numberOfLines={1}>
          {entity.name}
        </Text>
        <View style={styles.featuredMetaRow}>
          <Text style={styles.featuredDistance}>{distance ?? entity.category_name}</Text>
          {hasRating ? (
            <View style={styles.featuredRating}>
              <Ionicons name="star" size={11} color={colors.accent} />
              <Text style={styles.featuredRatingText}>{entity.avg_rating.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function formatFeaturedDistance(km: number | null): string | null {
  if (km === null) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
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

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Barra superior: siempre en el flujo normal (nunca "flota" transparente
  // sobre el mapa), como en el mockup — el mapa queda como protagonista,
  // con esquinas redondeadas arriba, debajo de este bloque sólido.
  topBar: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, backgroundColor: colors.bg },
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
  greetingRow: { gap: 1, marginBottom: 2 },
  greetingKicker: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  greetingTitle: { fontSize: 19, fontFamily: fonts.display.bold, color: colors.ink },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink, height: '100%' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterScroll: { flex: 1 },
  filterScrollRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md },
  filtersButton: {
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
  filtersBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filtersBadgeText: { fontSize: 10, fontFamily: fonts.ui.bold, color: colors.primary },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.ui.semibold, color: colors.ink },
  chipTextActive: { color: '#fff' },
  activeChips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    height: 30,
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
  cluster: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 6,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterText: { color: '#fff', fontWeight: '700', fontFamily: fonts.ui.bold, fontSize: 14 },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
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
  locateButton: {
    position: 'absolute',
    right: spacing.md,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  featuredCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadow,
  },
  featuredHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center' },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  featuredTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  featuredSeeAll: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.primary },
  featuredList: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.md },
  featuredItem: { width: 144, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  featuredImage: { width: '100%', height: 88, backgroundColor: colors.primarySoft },
  featuredImageFallback: { alignItems: 'center', justifyContent: 'center' },
  featuredInfo: { padding: spacing.sm, gap: 4 },
  featuredName: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  featuredMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featuredDistance: { fontSize: 11, fontFamily: fonts.ui.medium, color: colors.muted, flexShrink: 1 },
  featuredRating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  featuredRatingText: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.ink },
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
