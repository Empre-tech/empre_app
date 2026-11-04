import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EntityDetail as Entity, OfferClaim } from '@/api/types';
import { displayIcon } from '@/lib/mapView';
import { offerPriceParts } from '@/lib/offer';
import { colors, fonts } from '@/theme';

/**
 * El ticket del reclamo (tablero «Reclamo con sello Empre»): el negocio en su franja, la oferta con su ahorro, lo de
 * adentro (el QR) y el talón separado por las muescas.
 */
export function ClaimTicket({ claim, entity, dim, children, stub }: { claim: OfferClaim; entity?: Entity | null; dim?: boolean; children: ReactNode; stub?: ReactNode }) {
  const offer = claim.offer;
  const parts = offer ? offerPriceParts(offer) : null;
  return (
    <View style={styles.shadow}>
      <View style={[styles.top, !stub && styles.topAlone]}>
        <View style={styles.band}>
          <View style={[styles.ring, dim && { borderColor: colors.line }]}>
            <View style={styles.icon}>
              <Ionicons name={displayIcon(entity?.category?.icon) as keyof typeof Ionicons.glyphMap} size={20} color={colors.ink} />
            </View>
          </View>
          <View style={styles.bandText}>
            <View style={styles.bizLine}>
              <Text style={styles.biz} numberOfLines={1}>
                {claim.entity_name ?? entity?.name ?? 'Negocio'}
              </Text>
              {entity?.is_verified ? <Ionicons name="checkmark-circle" size={15} color={colors.verified} accessibilityLabel="Verificado" /> : null}
            </View>
            {entity?.category?.name ? <Text style={styles.cat}>{entity.category.name}</Text> : null}
          </View>
        </View>
        <View style={styles.offer}>
          <Text style={[styles.title, dim && styles.dim]}>{offer?.title ?? 'Tu oferta'}</Text>
          {parts?.now ? (
            <View style={styles.priceRow}>
              <Text style={[styles.price, dim && styles.dim]}>{parts.now}</Text>
              {parts.was ? <Text style={styles.was}>{parts.was}</Text> : null}
              {parts.savingPct > 0 ? (
                <View style={[styles.pct, dim && styles.pctDim]}>
                  <Text style={styles.pctText}>Ahorras {parts.savingPct} %</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.inside}>{children}</View>
      </View>
      {stub ? (
        <>
          <View style={styles.notches} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.notch, styles.notchL]} />
            <View style={[styles.notch, styles.notchR]} />
          </View>
          <View style={styles.stub}>{stub}</View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 5, borderRadius: 20, backgroundColor: colors.surface },
  top: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', backgroundColor: colors.surface },
  topAlone: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  band: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 18, backgroundColor: colors.selectedSoft },
  ring: { width: 50, height: 50, borderRadius: 25, borderWidth: 3, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  bandText: { flex: 1, minWidth: 0, gap: 2 },
  bizLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  biz: { flexShrink: 1, fontSize: 17, lineHeight: 21, fontFamily: fonts.display.semibold, color: colors.ink },
  cat: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  offer: { paddingTop: 14, paddingBottom: 2, paddingHorizontal: 18, gap: 6 },
  title: { fontSize: 21, lineHeight: 25, fontFamily: fonts.display.bold, color: colors.ink },
  dim: { opacity: 0.55 },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  price: { fontSize: 23, fontFamily: fonts.ui.extrabold, color: colors.ink },
  was: { fontSize: 15, fontFamily: fonts.ui.medium, color: colors.faint, textDecorationLine: 'line-through' },
  pct: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.accent },
  pctDim: { backgroundColor: colors.selectedSoft },
  pctText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  inside: { paddingTop: 12, paddingHorizontal: 18, paddingBottom: 16, alignItems: 'center', gap: 10 },
  notches: { height: 0, zIndex: 3 },
  notch: { position: 'absolute', top: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bg },
  notchL: { left: -11 },
  notchR: { right: -11 },
  stub: { borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: colors.line, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, backgroundColor: colors.surface },
});
