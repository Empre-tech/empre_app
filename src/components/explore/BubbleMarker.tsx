import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { bubbleSize, bubbleText } from '@/lib/mapLevels';
import { bubbleLabel } from '@/lib/markerLabels';
import { colors, fonts, radius } from '@/theme';
import { useMarkerTracking } from './useMarkerTracking';

interface Props {
  latitude: number;
  longitude: number;
  count: number;
  /** Algún negocio de la burbuja tiene oferta vigente: anillo ámbar y rayo, sin cantidad. */
  hasOffer: boolean;
  /** Color de la categoría que más se repite. */
  color: string;
  /** Nombre de la zona (nivel 1), si el centro cae en una. */
  label?: string | null;
  onPress: () => void;
}

/**
 * Burbuja de negocios agrupados (niveles 1 y 2). Cuenta negocios, nunca ofertas. Como todo marcador
 * del mapa se dibuja una vez y se congela (`useMarkerTracking`); quien la usa pone en la `key` lo que
 * cambia su aspecto (conteo, oferta, nombre).
 */
function BubbleMarkerView({ latitude, longitude, count, hasOffer, color, label, onPress }: Props) {
  const { tracking, onLayout, markerRef } = useMarkerTracking();
  const size = bubbleSize(count);
  return (
    <Marker
      ref={markerRef}
      coordinate={{ latitude, longitude }}
      // El centro de la burbuja queda sobre el centro de sus negocios.
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={count}
      tracksViewChanges={tracking}
      accessibilityRole="button"
      accessibilityLabel={bubbleLabel(count, label ?? null, hasOffer)}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      <View collapsable={false} onLayout={onLayout} style={styles.wrap}>
        <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderColor: hasOffer ? colors.accent : colors.white }]}>
          <Text style={styles.count}>{bubbleText(count)}</Text>
          {hasOffer ? (
            <View style={styles.bolt}>
              <Ionicons name="flash" size={11} color={colors.ink} />
            </View>
          ) : null}
        </View>
        {label ? (
          <View style={styles.label}>
            <Text style={styles.labelText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}

export const BubbleMarker = memo(
  BubbleMarkerView,
  (a, b) =>
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.count === b.count &&
    a.hasOffer === b.hasOffer &&
    a.color === b.color &&
    a.label === b.label,
);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  bubble: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.white },
  bolt: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { marginTop: 4, maxWidth: 150, height: 22, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: colors.ink, justifyContent: 'center' },
  labelText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.white },
});
