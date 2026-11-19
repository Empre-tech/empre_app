import { Ionicons } from '@/components/Icon';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { pinLabel } from '@/lib/markerLabels';
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
  /** Número del resultado (1-9), como en Yelp: el mismo que en la lista. */
  rank?: number;
  onPress: () => void;
}

function closesSoon(closesAt?: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(closesAt ?? '');
  if (!m) return false;
  const now = new Date();
  const left = Number(m[1]) * 60 + Number(m[2]) - (now.getHours() * 60 + now.getMinutes());
  return left > 0 && left <= 60;
}

function PinMarkerView({ entity, tier, selected, mine, emphasis, distanceLabel, dimmed, rank, onPress }: Props) {
  const look = [rank ?? '', tier, emphasis ?? '', selected ? 's' : '', mine ? 'm' : '', entity.has_active_offer ? 'o' : '', entity.is_open_now ? 'a' : 'c', closesSoon(entity.closes_at) ? 'p' : '', distanceLabel ?? ''].join('|');
  const { tracking, onLayout, markerRef } = useMarkerTracking(look);

  // Un solo pin en todo el mapa (2026-11-14), como Google Maps: blanco, el ícono en tinta y el punto rojo si está abierto.
  const cat = { fg: entity.is_open_now ? colors.glow : '#5B606B', bg: colors.selectedSoft };
  const open = entity.has_hours ? entity.is_open_now : true;
  const icon = (entity.category_icon || 'storefront') as keyof typeof Ionicons.glyphMap;
  const hasOffer = entity.has_active_offer;
  const showRayo = hasOffer && (entity.active_offer?.type === 'HORAS' || entity.active_offer?.type === 'DIA');
  const coordinate = { latitude: entity.latitude, longitude: entity.longitude };

  if (emphasis) {
    const closed = entity.has_hours && !entity.is_open_now;
    const faded = closed ? styles.closedFade : null;
    return (
      <Marker
        ref={markerRef}
        coordinate={coordinate}
        anchor={{ x: 0.5, y: 0.5 }}
        opacity={dimmed ? DIM_OPACITY : 1}
        zIndex={selected ? 1000 : emphasis === 'big' ? 30 : emphasis === 'mid' ? 20 : emphasis === 'dot' ? 10 : 1}
        tracksViewChanges={tracking}
        accessibilityRole="button"
        accessibilityLabel={pinLabel(entity, selected)}
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
              <View style={[styles.gPin, selected && styles.gPinSelected]}>
                <Ionicons name={icon} size={18} color={colors.ink} />
              </View>
              {rank ? (
                <View style={styles.rank}>
                  <Text style={styles.rankText}>{rank}</Text>
                </View>
              ) : null}
              {showRayo ? (
                <View style={[styles.offerBadge, styles.offerBadgeLow]}>
                  <Ionicons name="flash" size={11} color={colors.ink} />
                </View>
              ) : entity.has_hours && entity.is_open_now ? (
                <View style={styles.gOpen} />
              ) : null}
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
      accessibilityRole="button"
      accessibilityLabel={pinLabel(entity, selected)}
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
        {tier === 'far' ? (
          <View style={[styles.pinFar, { backgroundColor: open ? colors.brandRef : '#8E929A' }, selected && styles.pinFarSelected]} />
        ) : (
          <View style={!open && entity.has_hours ? styles.closedFade : null}>
            <View style={[styles.gPin, tier === 'mid' && styles.gPinSmall, selected && styles.gPinSelected]}>
              <Ionicons name={icon} size={tier === 'near' ? 18 : 15} color={colors.ink} />
            </View>
            {showRayo ? (
              <View style={[styles.offerBadge, styles.offerBadgeLow]}>
                <Ionicons name="flash" size={11} color={colors.ink} />
              </View>
            ) : entity.has_hours && entity.is_open_now ? (
              <View style={styles.gOpen} />
            ) : null}
          </View>
        )}
      </View>
    </Marker>
  );
}

export const PinMarker = memo(PinMarkerView, (a, b) =>
  a.tier === b.tier &&
  a.rank === b.rank &&
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
  rank: { position: 'absolute', zIndex: 2, top: -7, right: -7, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderWidth: 2, borderColor: '#FFFFFF' },
  rankText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#FFFFFF' },
  pinWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, paddingHorizontal: 10, paddingVertical: 6 },
  pinWrapSelected: { transform: [{ scale: 1.15 }] },
  pinOwnerLabel: { backgroundColor: colors.sand, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginBottom: 3 },
  pinOwnerLabelText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  offerBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff', marginBottom: -2 },
  pinFar: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  pinFarSelected: { borderColor: colors.primary, borderWidth: 3 },
  pinMid: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  pinNear: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.well },
  thumbMid: { width: 28, height: 28, borderRadius: 14 },
  emphWrap: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  labelSpacer: { height: 26 },
  label: { marginTop: 4, maxWidth: 178, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.sand, justifyContent: 'center' },
  labelText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  labelDistance: { color: colors.nightText, fontFamily: fonts.ui.extrabold },
  pinBig: { width: 56, height: 56, borderRadius: 28, borderWidth: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.well },
  thumbBig: { width: 48, height: 48, borderRadius: 24 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff', opacity: 0.8 },
  pinFarOff: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: '#fff', opacity: 0.4 },
  closedFade: { opacity: 0.6 },
  offerBadgeCorner: { position: 'absolute', top: -4, right: -4, zIndex: 2, marginBottom: 0 },
  // Pin de resultado como Google Maps (2026-11-14): blanco con el ícono en tinta y una sombra suave.
  gPin: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, shadowColor: '#2B2622', shadowOpacity: 0.22, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  gPinSelected: { borderColor: colors.ink, borderWidth: 2.5 },
  gPinSmall: { width: 30, height: 30, borderRadius: 15 },
  gOpen: { position: 'absolute', left: -2, bottom: -2, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.brandRef, borderWidth: 2, borderColor: '#FFFFFF' },
  offerBadgeLow: { position: 'absolute', left: -5, bottom: -5, zIndex: 2, marginBottom: 0 },
  thumbNear: { width: 40, height: 40, borderRadius: 20 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  statusDot: { position: 'absolute', right: 1, bottom: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
});
