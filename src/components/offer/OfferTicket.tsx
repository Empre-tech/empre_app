import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import type { Offer } from '@/api/types';
import { Button } from '@/components/Button';
import {
  formatSlotsFree,
  offerPriceParts,
  offerTypeLabel,
  offerUrgency,
  timeLeftLabel,
  timeLeftMs,
  timeLeftShort,
} from '@/lib/offer';
import { useNow } from '@/lib/useNow';
import { alpha, colors, fonts, radius, shadow, spacing } from '@/theme';

interface Props {
  offer: Offer;
  /** Acción principal del pie. Sin ella, el boleto no lleva botón. */
  cta?: { title: string; onPress: () => void };
  /** Precio y ahorro. La ficha del perfil los oculta: todavía no se trabaja con valores. */
  showPrice?: boolean;
  /** Color de lo que hay detrás del boleto: las muescas de la línea perforada lo usan. */
  notchColor?: string;
}

const RING = 62;
const RING_STROKE = 6;
const RING_R = (RING - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_R;

/**
 * La oferta como un boleto: arriba qué te llevas y cuánto queda (un anillo que se
 * consume), abajo cuántos cupos hay y la acción. El color cambia con la
 * urgencia —calma, aviso, última llamada— y el tiempo siempre va también en
 * texto, así que el color no es la única señal.
 */
export function OfferTicket({ offer, cta, notchColor = colors.bg, showPrice = true }: Props) {
  const now = useNow(1000);
  const msLeft = timeLeftMs(offer.ends_at, now);
  const urgency = offerUrgency(msLeft);
  const ended = urgency === 'ended';
  const hot = urgency === 'hot';
  const warn = urgency === 'warn';
  const soldOut = offer.slots_left <= 0;
  const off = ended || soldOut;

  const total = Math.max(1, new Date(offer.ends_at).getTime() - new Date(offer.starts_at).getTime());
  const fraction = Math.min(1, Math.max(0, msLeft / total));
  const short = timeLeftShort(msLeft);

  // Un solo formato de precio: el especial (o el escrito, en ofertas de antes) y, si viene del catálogo, el habitual tachado y el ahorro.
  const parts = offerPriceParts(offer);
  const price = parts.now;
  const normal = parts.was;
  const savings = parts.savingPct > 0 ? `Ahorras ${parts.savingPct} %` : '';

  // Cupos como segmentos (hasta 10), no como un número suelto.
  const segments = Math.min(10, Math.max(1, offer.total_slots));
  const filled = offer.slots_left <= 0 ? 0 : Math.max(1, Math.round((offer.slots_left / Math.max(1, offer.total_slots)) * segments));
  const slotsText =
    formatSlotsFree(offer.slots_left, offer.total_slots);

  const topBg = off ? styles.topOff : hot ? styles.topHot : warn ? styles.topWarn : styles.topCalm;
  const ringColor = off ? colors.mutedLight : hot ? colors.ink : warn ? colors.accentDark : colors.primary;
  const ringTrack = hot ? alpha(colors.ink, 0.2) : colors.line;
  const kind = hot ? 'Última llamada' : offerTypeLabel(offer.type);

  return (
    <View style={styles.shadowWrap}>
      <View style={styles.clip}>
        <View style={[styles.top, topBg]}>
          <View style={styles.main}>
            <View style={styles.kindRow}>
              <Ionicons name="flash" size={12} color={off ? colors.mutedLight : hot ? colors.ink : colors.accent} />
              <Text style={[styles.kind, hot && styles.kindHot, off && styles.kindOff]}>{kind}</Text>
            </View>
            <Text style={[styles.title, off && styles.titleOff]} numberOfLines={2}>
              {offer.title}
            </Text>
            {showPrice ? <View style={styles.priceRow}>
              {price ? <Text style={[styles.price, off && styles.titleOff]}>{price}</Text> : null}
              {normal ? <Text style={[styles.normal, hot && styles.normalHot]}>{normal}</Text> : null}
              {savings && !off ? <Text style={[styles.savings, hot && styles.savingsHot]}>{savings}</Text> : null}
            </View> : null}
          </View>

          <View style={styles.clock}>
            <View accessible accessibilityLabel={timeLeftLabel(msLeft)} style={styles.ring}>
              <Svg width={RING} height={RING}>
                <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={ringTrack} strokeWidth={RING_STROKE} fill="none" />
                {!ended ? (
                  <Circle
                    cx={RING / 2}
                    cy={RING / 2}
                    r={RING_R}
                    stroke={ringColor}
                    strokeWidth={RING_STROKE}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={RING_LENGTH}
                    strokeDashoffset={RING_LENGTH * (1 - fraction)}
                    rotation={-90}
                    origin={`${RING / 2}, ${RING / 2}`}
                  />
                ) : null}
              </Svg>
              <View style={styles.ringCenter}>
                <Text style={[styles.ringValue, off && styles.titleOff]}>{short.value}</Text>
                {short.unit ? <Text style={[styles.ringUnit, hot && styles.kindHot]}>{short.unit}</Text> : null}
              </View>
            </View>
            <Text style={[styles.when, hot && styles.whenHot]} numberOfLines={2}>
              {soldOut && !ended ? 'Agotada' : timeLeftLabel(msLeft)}
            </Text>
          </View>
        </View>

        {/* Línea perforada con muescas en los bordes. */}
        <View style={styles.perforation}>
          <Svg height={2} width="100%">
            <Line x1="0" y1="1" x2="100%" y2="1" stroke={colors.line} strokeWidth={2} strokeDasharray="6 6" />
          </Svg>
          <View style={[styles.notch, styles.notchLeft, { backgroundColor: notchColor }]} />
          <View style={[styles.notch, styles.notchRight, { backgroundColor: notchColor }]} />
        </View>

        <View style={styles.foot}>
          <View style={styles.slots}>
            <View style={styles.segments}>
              {Array.from({ length: segments }, (_, i) => (
                <View key={i} style={[styles.segment, i < filled ? styles.segmentOn : styles.segmentOff]} />
              ))}
            </View>
            <Text style={[styles.slotsText, soldOut && styles.titleOff]}>{slotsText}</Text>
          </View>
          {cta ? (
            off ? (
              <Button title={ended ? 'Terminó' : 'Agotada'} variant="secondary" onPress={cta.onPress} disabled style={styles.cta} />
            ) : (
              <Button title={cta.title} onPress={cta.onPress} style={styles.cta} />
            )
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // La sombra va afuera y el recorte adentro: con overflow hidden la sombra no se dibuja en iOS.
  shadowWrap: { borderRadius: radius.lg + 2, backgroundColor: colors.surface, ...shadow },
  clip: { borderRadius: radius.lg + 2, overflow: 'hidden', backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  topCalm: { backgroundColor: colors.surface },
  topWarn: { backgroundColor: colors.accentSoft },
  // Última llamada: ámbar sólido con texto en tinta (6,1:1).
  topHot: { backgroundColor: colors.accent },
  topOff: { backgroundColor: colors.surfaceAlt },
  main: { flex: 1, gap: 4 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kind: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.accentInk },
  kindHot: { color: colors.ink },
  kindOff: { color: colors.mutedDark },
  title: { fontSize: 19, lineHeight: 22, fontFamily: fonts.display.bold, color: colors.ink },
  titleOff: { color: colors.mutedDark },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, rowGap: 2 },
  price: { fontSize: 21, fontFamily: fonts.display.bold, color: colors.ink },
  normal: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted, textDecorationLine: 'line-through' },
  normalHot: { color: colors.accentDeep },
  savings: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  savingsHot: { color: colors.ink },
  clock: { width: 78, alignItems: 'center', gap: 4 },
  ring: { width: RING, height: RING },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  ringUnit: { fontSize: 9, fontFamily: fonts.ui.bold, letterSpacing: 0.4, color: colors.muted },
  when: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textAlign: 'center' },
  whenHot: { color: colors.white, backgroundColor: colors.ink, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  perforation: { marginHorizontal: spacing.lg, height: 2 },
  notch: { position: 'absolute', top: -9, width: 20, height: 20, borderRadius: 10 },
  notchLeft: { left: -(spacing.lg + 10) },
  notchRight: { right: -(spacing.lg + 10) },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, paddingTop: spacing.md },
  slots: { flex: 1, gap: 5 },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, maxWidth: 16, height: 7, borderRadius: 4 },
  segmentOn: { backgroundColor: colors.ink },
  segmentOff: { backgroundColor: colors.line },
  slotsText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  cta: { paddingHorizontal: spacing.lg, minHeight: 46 },
});
