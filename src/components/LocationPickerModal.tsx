import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_REGION } from '@/config';
import type { Coords } from '@/lib/geo';
import { colors, fonts, radius, spacing } from '@/theme';
import { Button } from './Button';

interface Props {
  visible: boolean;
  /** Ubicación actual del negocio (si ya tiene una). */
  initial: Coords | null;
  onCancel: () => void;
  onConfirm: (coords: Coords) => void;
}

/** Arma un texto corto y legible a partir de un resultado de reverseGeocodeAsync. */
function formatAddress(place: Location.LocationGeocodedAddress): string {
  const parts = [
    [place.street, place.streetNumber].filter(Boolean).join(' '),
    place.district || place.subregion,
    place.city,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length > 0 ? parts.join(', ') : 'Ubicación seleccionada';
}

/** Pantalla completa para elegir dónde queda el negocio: busca una dirección, toca el mapa o arrastra el pin. */
export function LocationPickerModal({ visible, initial, onCancel, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [point, setPoint] = useState<Coords | null>(initial);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [address, setAddress] = useState<string | null>(null);

  // Cada vez que se abre, partimos de la ubicación actual del negocio.
  useEffect(() => {
    if (visible) {
      setPoint(initial);
      setMessage(null);
      setQuery('');
      setAddress(null);
    }
  }, [visible, initial]);

  // Traduce el punto elegido a una dirección legible (best-effort: si falla, no bloquea nada).
  useEffect(() => {
    if (!point) {
      setAddress(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const results = await Location.reverseGeocodeAsync(point);
        if (!cancelled && results[0]) setAddress(formatAddress(results[0]));
      } catch {
        // Sin conexión o sin resultados: dejamos solo las coordenadas.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [point]);

  const movePoint = (next: Coords, animate = true) => {
    setPoint(next);
    if (animate) mapRef.current?.animateToRegion({ ...next, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  };

  const useMyLocation = async () => {
    setLocating(true);
    setMessage(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setMessage('No tenemos permiso para usar tu ubicación.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      movePoint({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      setMessage('No pudimos obtener tu ubicación.');
    } finally {
      setLocating(false);
    }
  };

  const searchAddress = async () => {
    const text = query.trim();
    if (!text) return;
    setSearching(true);
    setMessage(null);
    try {
      const results = await Location.geocodeAsync(`${text}, Cartagena, Colombia`);
      if (results[0]) {
        movePoint({ latitude: results[0].latitude, longitude: results[0].longitude });
      } else {
        setMessage('No encontramos esa dirección. Prueba con otra referencia o toca el mapa.');
      }
    } catch {
      setMessage('No pudimos buscar esa dirección. Prueba tocando el mapa.');
    } finally {
      setSearching(false);
    }
  };

  const initialRegion = initial
    ? { ...initial, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_REGION;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          onPress={(event) => movePoint(event.nativeEvent.coordinate, false)}
        >
          {point ? (
            <Marker coordinate={point} draggable onDragEnd={(event) => movePoint(event.nativeEvent.coordinate, false)} />
          ) : null}
        </MapView>

        <View style={[styles.searchBar, { top: insets.top + spacing.sm }]}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Busca una dirección o barrio"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={() => void searchAddress()}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buscar dirección"
            onPress={() => void searchAddress()}
            style={styles.searchButton}
            disabled={searching}
          >
            {searching ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-forward" size={18} color="#fff" />}
          </Pressable>
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              {point ? address ?? 'Ubicación seleccionada' : 'Busca una dirección, toca el mapa o usa tu ubicación actual.'}
            </Text>
            {point ? <Text style={styles.hintSub}>Arrastra el pin para ajustarlo con precisión.</Text> : null}
          </View>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <Button title="Usar mi ubicación actual" variant="secondary" onPress={() => void useMyLocation()} loading={locating} />
          <View style={styles.row}>
            <Button title="Cancelar" variant="secondary" onPress={onCancel} style={styles.flex} />
            <Button title="Confirmar" onPress={() => point && onConfirm(point)} disabled={!point} style={styles.flex} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
  searchBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hintText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink, textAlign: 'center' },
  hintSub: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', marginTop: 2 },
  actions: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  error: { color: colors.danger, fontSize: 13, fontFamily: fonts.ui.semibold, textAlign: 'center' },
});
