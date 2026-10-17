import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import type { EmphasisTier } from '@/lib/proximity';
import { colors, fonts, radius } from '@/theme';
import type { WithDistance } from './FeaturedCard';
import { useMarkerTracking } from './useMarkerTracking';

/** Opacidad de los pines que no son el elegido (35 %, como en la maqueta). */
const DIM_OPACITY = 0.35;

interface Props {
  entity: WithDistance;
  tier: 'far' | 'mid' | 'near';
  selected: boolean;
  mine: boolean;
  /** Solo en búsqueda (F11): destaca según la cercanía y sustituye a los niveles por zoom. */
  emphasis?: EmphasisTier;
  /** Distancia escrita en el pin grande. */
  distanceLabel?: string | null;
  /** Hay otro negocio elegido: este baja de opacidad para que el elegido resalte (no desaparece). */
  dimmed?: boolean;
  onPress: () => void;
}

/**
 * Pin de un negocio. El mapa dibuja cada marcador como una imagen: si se
 * rastrean sus cambios todo el tiempo, cada vez que la pantalla se vuelve a
 * pintar el marcador se redibuja y la foto vuelve a entrar desde transparente
 * (el pin parpadea o desaparece un momento). Por eso se rastrea solo mientras
 * carga la miniatura y después se congela, igual que la pila. Quien lo usa pone
 * en la `key` lo que cambia su aspecto (zoom, selección, oferta), así un cambio
 * real lo vuelve a dibujar.
 */
function PinMarkerView({ entity, tier, selected, mine, emphasis, distanceLabel, dimmed, onPress }: Props) {
  const { tracking, onLayout, onImageSettled, markerRef } = useMarkerTracking();

  const cat = categoryColor(entity.category_color);
  const open = entity.has_hours ? entity.is_open_now : true;
  const icon = (entity.category_icon || 'storefront') as keyof typeof Ionicons.glyphMap;
  const thumb = entity.profile_url ? resolveImageUrl(entity.profile_url) : null;
  // Borde: azul si está seleccionado, ámbar si hay oferta, blanco si no.
  const hasOffer = entity.has_active_offer;
  const showRayo = hasOffer && (entity.active_offer?.type === 'HORAS' || entity.active_offer?.type === 'DIA');
  const borderColor = selected ? colors.primary : hasOffer ? colors.accent : '#ffffff';
  const statusColor = open ? '#2E9E5B' : '#9AA7B5';
  const coordinate = { latitude: entity.latitude, longitude: entity.longitude };

  if (emphasis) {
    const closed = entity.has_hours && !entity.is_open_now;
    const ring = selected ? colors.primary : closed ? '#9AA7B5' : hasOffer ? colors.accent : emphasis === 'big' ? colors.primary : '#ffffff';
    const faded = closed ? styles.closedFade : null;
    return (
      <Marker
        ref={markerRef}
        coordinate={coordinate}
        // El centro del pin queda sobre el negocio aunque el grande lleve etiqueta.
        anchor={{ x: 0.5, y: 0.5 }}
        opacity={dimmed ? DIM_OPACITY : 1}
        zIndex={selected ? 1000 : emphasis === 'big' ? 30 : emphasis === 'mid' ? 20 : emphasis === 'dot' ? 10 : 1}
        tracksViewChanges={tracking}
        onPress={(event) => {
          event.stopPropagation();
          onPress();
        }}
      >
        <View collapsable={false} onLayout={onLayout} style={styles.emphWrap}>
          {emphasis === 'big' ? <View style={styles.labelSpacer} /> : null}
          {emphasis === 'far' ? (
            <View style={[styles.pinFarOff, { backgroundColor: cat.fg }]} />
          ) : emphasis === 'dot' ? (
            <View style={[styles.pinDot, { backgroundColor: cat.fg }, faded]} />
          ) : (
            <View style={faded}>
              {showRayo ? (
                <View style={[styles.offerBadge, styles.offerBadgeCorner]}>
                  <Ionicons name="flash" size={11} color={colors.ink} />
                </View>
              ) : null}
              <View style={[emphasis === 'big' ? styles.pinBig : styles.pinMid, { borderColor: ring }]}>
                {thumb ? (
                  <Image accessible={false} source={{ uri: thumb }} style={emphasis === 'big' ? styles.thumbBig : styles.thumbMid} contentFit="cover" onLoad={onImageSettled} onError={onImageSettled} />
                ) : (
                  <View style={[emphasis === 'big' ? styles.thumbBig : styles.thumbMid, styles.fallback, { backgroundColor: cat.bg }]}>
                    <Ionicons name={icon} size={emphasis === 'big' ? 22 : 16} color={cat.fg} />
                  </View>
                )}
              </View>
            </View>
          )}
          {emphasis === 'big' ? (
            <View style={styles.label}>
              <Text style={styles.labelText} numberOfLines={1}>
                {entity.name}
                {distanceLabel ? <Text style={styles.labelDistance}>{`  ${distanceLabel}`}</Text> : null}
              </Text>
            </View>
          ) : null}
        </View>
      </Marker>
    );
  }

  return (
    <Marker
      ref={markerRef}
      coordinate={coordinate}
      opacity={dimmed ? DIM_OPACITY : 1}
      zIndex={selected ? 1000 : 1}
      tracksViewChanges={tracking}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      <View collapsable={false} onLayout={onLayout} style={[styles.pinWrap, selected && styles.pinWrapSelected]}>
        {mine ? (
          <View style={styles.pinOwnerLabel}>
            <Text style={styles.pinOwnerLabelText}>Tu negocio</Text>
          </View>
        ) : null}
        {showRayo ? (
          <View style={styles.offerBadge}>
            <Ionicons name="flash" size={11} color={colors.ink} />
          </View>
        ) : null}
        {tier === 'far' ? (
          <View style={[styles.pinFar, { backgroundColor: cat.fg }, selected && styles.pinFarSelected]} />
        ) : (
          <View style={[tier === 'near' ? styles.pinNear : styles.pinMid, { borderColor }]}>
            {thumb ? (
              // Sin transición: dentro de un marcador, el fundido se vería como un parpadeo.
              <Image accessible={false} source={{ uri: thumb }} style={tier === 'near' ? styles.thumbNear : styles.thumbMid} contentFit="cover" onLoad={onImageSettled} onError={onImageSettled} />
            ) : (
              <View style={[tier === 'near' ? styles.thumbNear : styles.thumbMid, styles.fallback, { backgroundColor: cat.bg }]}>
                <Ionicons name={icon} size={tier === 'near' ? 20 : 16} color={cat.fg} />
              </View>
            )}
            {entity.has_hours ? <View style={[styles.statusDot, { backgroundColor: statusColor }]} /> : null}
          </View>
        )}
      </View>
    </Marker>
  );
}

/**
 * Cada consulta trae objetos nuevos aunque el negocio sea el mismo; sin esto,
 * todos los pines se redibujan (y en Android desaparecen un instante). Solo se
 * redibuja si cambia algo que se ve. `onPress` no cuenta: hace lo mismo para el
 * mismo negocio.
 */
export const PinMarker = memo(PinMarkerView, (a, b) =>
  a.tier === b.tier &&
  a.emphasis === b.emphasis &&
  a.distanceLabel === b.distanceLabel &&
  a.selected === b.selected &&
  a.mine === b.mine &&
  a.entity.id === b.entity.id &&
  a.entity.latitude === b.entity.latitude &&
  a.entity.longitude === b.entity.longitude &&
  a.entity.profile_url === b.entity.profile_url &&
  a.entity.category_color === b.entity.category_color &&
  a.entity.category_icon === b.entity.category_icon &&
  a.entity.has_hours === b.entity.has_hours &&
  a.entity.is_open_now === b.entity.is_open_now &&
  a.entity.has_active_offer === b.entity.has_active_offer &&
  a.entity.active_offer?.type === b.entity.active_offer?.type,
);

const styles = StyleSheet.create({
  pinWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, paddingHorizontal: 10, paddingVertical: 6 },
  pinWrapSelected: { transform: [{ scale: 1.15 }] },
  pinOwnerLabel: { backgroundColor: colors.primaryDark, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, marginBottom: 3 },
  pinOwnerLabelText: { fontSize: 10, fontFamily: fonts.ui.bold, color: '#fff' },
  offerBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff', marginBottom: -2 },
  pinFar: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  pinFarSelected: { borderColor: colors.primary, borderWidth: 3 },
  pinMid: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  pinNear: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  thumbMid: { width: 28, height: 28, borderRadius: 14 },
  emphWrap: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  labelSpacer: { height: 26 },
  label: { marginTop: 4, maxWidth: 170, height: 22, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: colors.ink, justifyContent: 'center' },
  labelText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  labelDistance: { color: '#FFD2A6', fontFamily: fonts.ui.extrabold },
  pinBig: { width: 56, height: 56, borderRadius: 28, borderWidth: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  thumbBig: { width: 48, height: 48, borderRadius: 24 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff', opacity: 0.8 },
  pinFarOff: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: '#fff', opacity: 0.4 },
  closedFade: { opacity: 0.6 },
  offerBadgeCorner: { position: 'absolute', top: -4, right: -4, zIndex: 2, marginBottom: 0 },
  thumbNear: { width: 40, height: 40, borderRadius: 20 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  statusDot: { position: 'absolute', right: 1, bottom: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
});
