import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { colors, fonts, radius } from '@/theme';
import type { WithDistance } from './FeaturedCard';

interface Props {
  entity: WithDistance;
  tier: 'far' | 'mid' | 'near';
  selected: boolean;
  mine: boolean;
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
export function PinMarker({ entity, tier, selected, mine, onPress }: Props) {
  const [tracking, setTracking] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useCallback((delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTracking(false), delay);
  }, []);
  useEffect(() => {
    settle(800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [settle]);
  const onImageLoad = useCallback(() => {
    setTracking(true);
    settle(200);
  }, [settle]);

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

  return (
    <Marker
      coordinate={coordinate}
      zIndex={selected ? 1000 : 1}
      tracksViewChanges={tracking}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      <View collapsable={false} style={[styles.pinWrap, selected && styles.pinWrapSelected]}>
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
              <Image accessible={false} source={{ uri: thumb }} style={tier === 'near' ? styles.thumbNear : styles.thumbMid} contentFit="cover" onLoad={onImageLoad} />
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
  thumbNear: { width: 40, height: 40, borderRadius: 20 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  statusDot: { position: 'absolute', right: 1, bottom: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
});
