import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { colors, fonts, radius, shadow } from '@/theme';
import { useMarkerTracking } from './useMarkerTracking';

interface Props {
  latitude: number;
  longitude: number;
  text: string;
}

/**
 * Etiqueta de texto fija en el mapa (3.23): el nombre del área marcada encima de su círculo.
 * No se toca (no tapa los pines): es solo una referencia. Se dibuja una vez y se congela (`useMarkerTracking`); quien
 * la usa pone el texto en la `key` para que cambie.
 */
function MapLabelMarkerView({ latitude, longitude, text }: Props) {
  const { tracking, onLayout, markerRef } = useMarkerTracking();
  return (
    <Marker
      ref={markerRef}
      coordinate={{ latitude, longitude }}
      // El centro de la etiqueta sobre el borde de arriba del círculo.
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      tappable={false}
      zIndex={1}
      accessibilityLabel={`Zona marcada: ${text}`}
    >
      <View collapsable={false} onLayout={onLayout} style={styles.label}>
        <Text style={styles.text} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </Marker>
  );
}

export const MapLabelMarker = memo(MapLabelMarkerView);

const styles = StyleSheet.create({
  label: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.primary, ...shadow },
  text: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
