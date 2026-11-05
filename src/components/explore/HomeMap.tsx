import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { DiscoveryItem } from '@/api/types';
import { useMarkerTracking } from '@/components/explore/useMarkerTracking';
import { coverTheme } from '@/lib/coverTheme';
import { MAP_STYLE } from '@/lib/mapStyle';
import { displayIcon } from '@/lib/mapView';
import { colors } from '@/theme';

function HomePin({ item, selected, onPress }: { item: DiscoveryItem; selected: boolean; onPress: () => void }) {
  const look = `${item.id}|${selected ? 'on' : 'off'}|${item.has_active_offer ? 'o' : ''}`;
  const { tracking, onLayout, markerRef } = useMarkerTracking(look);
  return (
    <Marker ref={markerRef} coordinate={{ latitude: item.latitude, longitude: item.longitude }} accessibilityLabel={`${item.name}${item.has_active_offer ? ', tiene oferta' : ''}`} onPress={onPress} tracksViewChanges={tracking} zIndex={selected ? 10 : 1} anchor={{ x: 0.5, y: 0.5 }}>
      <View onLayout={onLayout} collapsable={false} style={styles.hit}>
        <View style={[styles.pin, item.has_active_offer && styles.pinOffer, selected && { backgroundColor: coverTheme(item.subcategory || item.category_name, item.category_icon).color }]}>
          <Ionicons name={displayIcon(item.category_icon) as keyof typeof Ionicons.glyphMap} size={16} color={selected ? '#fff' : colors.ink} />
        </View>
      </View>
    </Marker>
  );
}

/** El mapa de la pieza principal del inicio: tu zona y lo abierto; no se arrastra, para no pelear con la pantalla. */
export const HomeMap = memo(function HomeMap({ center, items, selectedId, onPick, showUser }: { center: { latitude: number; longitude: number }; items: DiscoveryItem[]; selectedId: string | null; onPick: (id: string) => void; showUser: boolean }) {
  return (
    <MapView
      key={`${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}`}
      style={StyleSheet.absoluteFill}
      initialRegion={{ latitude: center.latitude, longitude: center.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
      showsUserLocation={showUser}
      showsMyLocationButton={false}
      showsPointsOfInterests={false}
      customMapStyle={MAP_STYLE}
      toolbarEnabled={false}
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {items.map((b) => (
        <HomePin key={b.id} item={b} selected={selectedId === b.id} onPress={() => onPick(b.id)} />
      ))}
    </MapView>
  );
});

const styles = StyleSheet.create({
  hit: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  pin: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.line },
  pinOffer: { borderColor: colors.accent, borderWidth: 2.5 },
});
