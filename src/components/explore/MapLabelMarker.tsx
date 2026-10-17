import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { colors, fonts, radius, shadow } from '@/theme';
import { useMarkerTracking } from './useMarkerTracking';

interface Props {
  latitude: number;
  longitude: number;
  text: string;
  /** «zone»: etiqueta azul del área marcada; «you»: la etiqueta «Tú» bajo tu punto azul. */
  tone: 'zone' | 'you';
}

/**
 * Etiqueta de texto fija en el mapa (3.23): el nombre del área marcada encima de su círculo, o «Tú» bajo tu punto.
 * No se toca (no tapa los pines): es solo una referencia. Se dibuja una vez y se congela (`useMarkerTracking`); quien
 * la usa pone el texto en la `key` para que cambie.
 */
function MapLabelMarkerView({ latitude, longitude, text, tone }: Props) {
  const { tracking, onLayout, markerRef } = useMarkerTracking();
  return (
    <Marker
      ref={markerRef}
      coordinate={{ latitude, longitude }}
      // La zona: el centro de la etiqueta sobre el borde de arriba del círculo. «Tú»: la etiqueta justo debajo del punto.
      anchor={tone === 'zone' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: -0.6 }}
      tracksViewChanges={tracking}
      tappable={false}
      zIndex={tone === 'you' ? 900 : 1}
      accessibilityLabel={tone === 'you' ? 'Tú estás aquí' : `Zona marcada: ${text}`}
    >
      <View collapsable={false} onLayout={onLayout} style={[styles.label, tone === 'zone' ? styles.zone : styles.you]}>
        <Text style={[styles.text, tone === 'you' && styles.youText]} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </Marker>
  );
}

export const MapLabelMarker = memo(MapLabelMarkerView);

const styles = StyleSheet.create({
  label: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, ...shadow },
  zone: { backgroundColor: colors.primary },
  you: { backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  youText: { fontSize: 11, color: '#1E4FA0' },
});
