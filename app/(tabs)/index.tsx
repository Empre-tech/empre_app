import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import { colors, radius, spacing } from '@/theme';

type WithDistance = EntityMap & { distanceKm: number | null };

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [selected, setSelected] = useState<EntityMap | null>(null);

  // Ubicación del usuario (opcional): centra el mapa y permite ordenar por distancia.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') return;
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setUserCoords(coords);
        if (distanceKm(coords, CARTAGENA_CENTER) < NEARBY_CITY_RADIUS_KM) {
          mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
        }
      } catch {
        // sin permiso o sin GPS: seguimos con la vista de Cartagena
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Solo ordenamos por distancia si el usuario está realmente cerca de la ciudad.
  const reference = useMemo(
    () => (userCoords && distanceKm(userCoords, CARTAGENA_CENTER) < NEARBY_CITY_RADIUS_KM ? userCoords : null),
    [userCoords],
  );

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });
  const entities = useQuery({
    queryKey: ['entities', categoryId ?? 'all'],
    queryFn: () => entitiesApi.list({ category: categoryId }),
  });

  const items = useMemo<WithDistance[]>(() => {
    const withDistance = (entities.data ?? []).map((entity) => ({
      ...entity,
      distanceKm: reference && hasLocation(entity) ? distanceKm(reference, entity) : null,
    }));
    return withDistance.sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [entities.data, reference]);

  const mapped = useMemo(() => items.filter(hasLocation), [items]);
  const clusters = useMemo(() => clusterItems(mapped, region), [mapped, region]);

  const openBusiness = (id: string) => router.push({ pathname: '/business/[id]', params: { id } });

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

      {/* Barra superior: categorías + cambio mapa/lista */}
      <View
        style={[
          styles.topBar,
          mode === 'map' ? styles.topBarFloating : styles.topBarSolid,
          { paddingTop: insets.top + spacing.sm },
        ]}
      >
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
                {entities.isError ? 'No pudimos cargar los negocios.' : 'Todavía no hay negocios en esta categoría.'}
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
        <View style={[styles.errorBanner, mode === 'map' && { top: insets.top + 64 }]}>
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

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  topBarFloating: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarSolid: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line },
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
  chipText: { fontSize: 14, fontWeight: '600', color: colors.ink },
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
  clusterText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { padding: spacing.md, paddingBottom: spacing.xxl },
  listRow: { borderWidth: 1, borderColor: colors.line },
  separator: { height: spacing.sm },
  listHint: { fontSize: 13, color: colors.muted, marginBottom: spacing.sm },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xxl },
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
  errorText: { color: colors.danger, fontSize: 14 },
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
});
