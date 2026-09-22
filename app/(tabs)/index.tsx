import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
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
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi, entitiesApi } from '@/api/endpoints';
import type { EntityMap } from '@/api/types';
import { BusinessRow } from '@/components/BusinessRow';
import { Button } from '@/components/Button';
import { CARTAGENA_CENTER, DEFAULT_REGION, NEARBY_CITY_RADIUS_KM } from '@/config';
import { clusterItems } from '@/lib/cluster';
import { distanceKm, hasLocation, type Coords } from '@/lib/geo';
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

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [selected, setSelected] = useState<EntityMap | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [radiusPickerOpen, setRadiusPickerOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);

  // No golpeamos el backend en cada tecla: esperamos una pausa corta.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  const requestLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationDenied(true);
        return null;
      }
      setLocationDenied(false);
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setUserCoords(coords);
      return coords;
    } catch {
      return null;
    } finally {
      setLocating(false);
    }
  };

  // Ubicación del usuario (opcional): centra el mapa y permite ordenar/filtrar por distancia.
  useEffect(() => {
    let active = true;
    (async () => {
      const coords = await requestLocation();
      if (!active || !coords) return;
      if (distanceKm(coords, CARTAGENA_CENTER) < NEARBY_CITY_RADIUS_KM) {
        mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Solo ordenamos/filtramos por distancia si el usuario está realmente cerca de la ciudad.
  const reference = useMemo(
    () => (userCoords && distanceKm(userCoords, CARTAGENA_CENTER) < NEARBY_CITY_RADIUS_KM ? userCoords : null),
    [userCoords],
  );

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });
  const entities = useQuery({
    queryKey: [
      'entities',
      categoryId ?? 'all',
      debouncedSearch,
      radiusKm ?? 'any',
      radiusKm && reference ? `${reference.latitude.toFixed(3)},${reference.longitude.toFixed(3)}` : 'no-ref',
    ],
    queryFn: () =>
      entitiesApi.list({
        category: categoryId,
        q: debouncedSearch || undefined,
        // El backend filtra por caja (aproximado); el radio exacto lo afinamos abajo con Haversine.
        ...(radiusKm && reference
          ? { lat: reference.latitude, long: reference.longitude, radius: radiusKm * 1000 }
          : {}),
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

  const openBusiness = (id: string) => router.push({ pathname: '/business/[id]', params: { id } });

  const openRadiusPicker = () => {
    if (!reference && !locating) void requestLocation();
    setRadiusPickerOpen(true);
  };

  const radiusLabel = radiusKm ? `< ${radiusKm} km` : 'Distancia';

  return (
    <View style={styles.screen}>
      {mode === 'map' ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={DEFAULT_REGION}
          showsUserLocation
          showsMyLocationButton={false}
          onRegionChangeComplete={setRegion}
          onPress={() => setSelected(null)}
        >
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
                  <View style={[styles.pin, only.is_verified && styles.pinVerified]}>
                    <Ionicons name="storefront" size={16} color="#fff" />
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
      ) : null}

      {/* Barra superior: buscador, filtro de distancia, categorías y cambio mapa/lista */}
      <View
        style={[
          styles.topBar,
          mode === 'map' ? styles.topBarFloating : styles.topBarSolid,
          { paddingTop: insets.top + spacing.sm },
        ]}
      >
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
            onPress={openRadiusPicker}
            style={[styles.radiusChip, radiusKm !== null && styles.chipActive]}
          >
            {locating ? (
              <ActivityIndicator size="small" color={radiusKm ? '#fff' : colors.primary} />
            ) : (
              <Ionicons name="navigate" size={14} color={radiusKm ? '#fff' : colors.ink} />
            )}
            <Text style={[styles.chipText, radiusKm !== null && styles.chipTextActive]}>{radiusLabel}</Text>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroll}>
            <Chip label="Todos" active={!categoryId} onPress={() => setCategoryId(undefined)} />
            {(categories.data ?? []).map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                active={categoryId === category.id}
                onPress={() => setCategoryId(category.id)}
              />
            ))}
          </ScrollView>
        </View>
      </View>

      <RadiusPickerModal
        visible={radiusPickerOpen}
        value={radiusKm}
        hasReference={Boolean(reference)}
        denied={locationDenied}
        onSelect={(km) => {
          setRadiusKm(km);
          setRadiusPickerOpen(false);
        }}
        onRetryLocation={requestLocation}
        onClose={() => setRadiusPickerOpen(false)}
      />

      {mode === 'list' ? (
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
            reference ? <Text style={styles.listHint}>Ordenados por cercanía a ti</Text> : null
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
      ) : null}

      {entities.isLoading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {entities.isError && !entities.isLoading ? (
        <View style={[styles.errorBanner, mode === 'map' && { top: insets.top + 120 }]}>
          <Text style={styles.errorText}>No pudimos cargar los negocios. Revisa la conexión con el servidor.</Text>
          <Button title="Reintentar" variant="secondary" onPress={() => void entities.refetch()} style={styles.retry} />
        </View>
      ) : null}

      {/* Vista previa del negocio seleccionado (solo mapa) */}
      {mode === 'map' && selected ? (
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
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function RadiusPickerModal({
  visible,
  value,
  hasReference,
  denied,
  onSelect,
  onRetryLocation,
  onClose,
}: {
  visible: boolean;
  value: number | null;
  hasReference: boolean;
  denied: boolean;
  onSelect: (km: number | null) => void;
  onRetryLocation: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>Distancia desde ti</Text>

          {!hasReference ? (
            <View style={styles.modalNotice}>
              <Text style={styles.modalNoticeText}>
                {denied
                  ? 'No tenemos permiso para usar tu ubicación. Actívalo en los ajustes del celular.'
                  : 'Necesitamos tu ubicación para filtrar por distancia.'}
              </Text>
              {!denied ? (
                <Button title="Usar mi ubicación" variant="secondary" onPress={onRetryLocation} style={styles.modalNoticeButton} />
              ) : null}
            </View>
          ) : null}

          {RADIUS_OPTIONS.map((option) => {
            const active = value === option.km;
            const disabled = option.km !== null && !hasReference;
            return (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onSelect(option.km)}
                style={[styles.modalOption, active && styles.modalOptionActive, disabled && styles.modalOptionDisabled]}
              >
                <Text style={[styles.modalOptionText, active && styles.modalOptionTextActive]}>{option.label}</Text>
                {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
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
  screen: { flex: 1, backgroundColor: colors.surface },
  topBar: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  topBarFloating: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarSolid: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink, height: '100%' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  radiusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipScroll: { flex: 1 },
  chips: { gap: spacing.sm, paddingRight: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.ui.semibold, color: colors.ink },
  chipTextActive: { color: '#fff' },
  toggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
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
  listRow: { borderWidth: 1, borderColor: colors.line },
  separator: { height: spacing.sm },
  listHint: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted, marginBottom: spacing.sm },
  empty: { textAlign: 'center', fontFamily: fonts.ui.medium, color: colors.muted, marginTop: spacing.xxl },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  errorBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: 120,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow,
  },
  errorText: { color: colors.danger, fontSize: 14, fontFamily: fonts.ui.semibold },
  retry: { minHeight: 40 },
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
  modalTitle: { fontSize: 19, fontFamily: fonts.display.semibold, color: colors.ink, marginBottom: spacing.sm },
  modalNotice: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalNoticeText: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  modalNoticeButton: { minHeight: 40 },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalOptionActive: {},
  modalOptionDisabled: { opacity: 0.4 },
  modalOptionText: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.ink },
  modalOptionTextActive: { fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.primary },
});
