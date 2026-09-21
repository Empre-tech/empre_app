import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_REGION } from '@/config';
import type { Coords } from '@/lib/geo';
import { colors, radius, spacing } from '@/theme';
import { Button } from './Button';

interface Props {
  visible: boolean;
  /** Ubicación actual del negocio (si ya tiene una). */
  initial: Coords | null;
  onCancel: () => void;
  onConfirm: (coords: Coords) => void;
}

/** Pantalla completa para elegir dónde queda el negocio: toca el mapa o arrastra el pin. */
export function LocationPickerModal({ visible, initial, onCancel, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [point, setPoint] = useState<Coords | null>(initial);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Cada vez que se abre, partimos de la ubicación actual del negocio.
  useEffect(() => {
    if (visible) {
      setPoint(initial);
      setMessage(null);
    }
  }, [visible, initial]);

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
      const here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setPoint(here);
      mapRef.current?.animateToRegion({ ...here, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
    } catch {
      setMessage('No pudimos obtener tu ubicación.');
    } finally {
      setLocating(false);
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
          onPress={(event) => setPoint(event.nativeEvent.coordinate)}
        >
          {point ? (
            <Marker coordinate={point} draggable onDragEnd={(event) => setPoint(event.nativeEvent.coordinate)} />
          ) : null}
        </MapView>

        <View style={[styles.hint, { top: insets.top + spacing.sm }]}>
          <Text style={styles.hintText}>
            {point ? 'Arrastra el pin o toca otro punto para moverlo.' : 'Toca el mapa para colocar tu negocio.'}
          </Text>
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          <Button title="Usar mi ubicación actual" variant="secondary" onPress={useMyLocation} loading={locating} />
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
  hint: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hintText: { fontSize: 14, color: colors.ink, textAlign: 'center' },
  actions: { padding: spacing.md, gap: spacing.sm, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
});
