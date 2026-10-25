import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useClaimOffer } from '@/claims/useClaimOffer';
import { savingPesos } from '@/lib/offerBarrio';
import { pesos, type MarketItem } from '@/lib/offerMarket';
import type { SavedRoute } from '@/lib/routeStore';
import { alpha, colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';
import { BandWash } from './Wash';

// «Llegaste a…» (3.50): con una ruta guardada, al abrir Ofertas cerca de una parada pendiente (dentro del radio de su
// oferta) aparece este aviso, dentro de la app y sin notificaciones push. Debajo, el avance de la ruta.

export function ArrivalBanner({
  saved,
  stop,
  signedIn,
  onClaimed,
  onLater,
  onSignIn,
  onOpen,
}: {
  saved: SavedRoute;
  stop: MarketItem;
  signedIn: boolean;
  onClaimed: (offerId: string) => void;
  onLater: (offerId: string) => void;
  onSignIn: () => void;
  onOpen: () => void;
}) {
  const claimer = useClaimOffer();
  const save = savingPesos(stop);
  const offers = saved.route.stops.filter((s) => s.kind !== 'service');
  const done = offers.filter((s) => saved.claimed.includes(s.id)).length;

  const claim = async () => {
    if (!signedIn) return onSignIn();
    const res = await claimer.claim(stop.id);
    if (res) onClaimed(stop.id);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <BandWash />
        <View style={styles.row}>
          <View style={styles.pin}>
            <Ionicons name="location" size={18} color={colors.white} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>Llegaste a {stop.entity_name}</Text>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.sub}>
              Ya puedes reclamar «{stop.title}»{save ? ` · −${pesos(save)}` : ''}
            </Text>
          </View>
        </View>
        {claimer.message ? <Text style={styles.error}>{claimer.message}</Text> : null}
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => onLater(stop.id)} style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.laterText}>
              Ahora no
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={claimer.busy} onPress={() => void claim()} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
            {claimer.busy ? (
              <ActivityIndicator color={colors.primaryDark} />
            ) : (
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.goText}>
                Reclamar ahora
              </Text>
            )}
          </Pressable>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Tu ruta ${saved.title}: ${done} de ${offers.length} reclamadas. Ver la ruta`} onPress={onOpen} style={({ pressed }) => [styles.progress, pressed && styles.pressed]}>
        <Text style={styles.progTitle} numberOfLines={1}>
          Tu ruta: {saved.title}
        </Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${offers.length ? Math.round((done / offers.length) * 100) : 0}%` }]} />
        </View>
        <View style={styles.steps}>
          {saved.route.stops.map((s) => (
            <Text key={s.id} maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.step, saved.claimed.includes(s.id) && styles.stepDone]} numberOfLines={1}>
              {saved.claimed.includes(s.id) ? '✓ ' : ''}
              {s.entity_name}
            </Text>
          ))}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.98 }] },
  wrap: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  banner: { borderRadius: radius.lg, overflow: 'hidden', padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: alpha(colors.white, 0.18), alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 19, fontFamily: fonts.display.bold, color: colors.white },
  sub: { fontSize: 12, fontFamily: fonts.ui.semibold, color: alpha(colors.white, 0.9) },
  error: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.accentLight },
  later: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: alpha(colors.white, 0.16), justifyContent: 'center' },
  laterText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.white },
  go: { flex: 1, minHeight: 44, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  goText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  progress: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  progTitle: { fontSize: 14.5, fontFamily: fonts.display.bold, color: colors.ink },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.successSolid },
  steps: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  step: { flexShrink: 1, fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  stepDone: { color: colors.successInk },
});
