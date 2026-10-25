import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useClaimOffer } from '@/claims/useClaimOffer';
import { categoryColor } from '@/lib/categoryColor';
import { clockLabel, legLabel, levelLabel, metersBetween, routeTitle, savingPesos, type MarketRoute } from '@/lib/offerBarrio';
import { pesos, type MarketItem } from '@/lib/offerMarket';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';

// «Ver la ruta» (3.49): el mapa con las paradas numeradas en orden, la línea de tiempo con la hora sugerida de cada
// una y el tramo entre ellas, y dos botones: reclamar todas (un QR por oferta, como siempre) y abrir el recorrido en
// la app de mapas. Cada parada abre su oferta.

type Pt = { latitude: number; longitude: number };

function regionOf(points: Pt[]) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Un poco de aire alrededor; nunca más cerca que una manzana.
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: Math.max(0.004, (maxLat - minLat) * 1.6), longitudeDelta: Math.max(0.004, (maxLng - minLng) * 1.6) };
}

export function RouteView({
  route,
  city,
  hereZone,
  signedIn,
  onClose,
  onOpenOffer,
  onTickets,
  onSignIn,
}: {
  route: MarketRoute;
  city: string;
  hereZone: string;
  signedIn: boolean;
  onClose: () => void;
  onOpenOffer: (o: MarketItem) => void;
  onTickets: () => void;
  onSignIn: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const claimer = useClaimOffer();
  const [claimed, setClaimed] = useState<string[]>([]); // ids de oferta ya reclamadas aquí
  const [claiming, setClaiming] = useState(false);
  const stops = route.stops;
  const points = stops.filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number').map((s) => ({ latitude: s.latitude as number, longitude: s.longitude as number }));
  const pending = stops.filter((s) => !claimed.includes(s.id));
  const pendingSave = pending.reduce((a, s) => a + savingPesos(s), 0);
  const name = routeTitle(route, city);
  // Sin ninguna hora sugerida (negocios sin horario), la columna de horas no ocupa lugar.
  const timed = route.times.some(Boolean);

  const claimAll = async () => {
    if (!signedIn) return onSignIn();
    setClaiming(true);
    for (const s of pending) {
      const res = await claimer.claim(s.id);
      if (res) setClaimed((list) => [...list, s.id]);
    }
    setClaiming(false);
  };

  const openMaps = () => {
    if (points.length < 2) return;
    const [first, ...rest] = points;
    const last = rest[rest.length - 1];
    const via = rest.slice(0, -1).map((p) => `${p.latitude},${p.longitude}`).join('|');
    const mode = route.level === 'walk' ? 'walking' : 'driving';
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&origin=${first.latitude},${first.longitude}&destination=${last.latitude},${last.longitude}${via ? `&waypoints=${encodeURIComponent(via)}` : ''}&travelmode=${mode}`,
    );
  };

  return (
    <Modal visible animationType={reduce ? 'none' : 'slide'} statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onClose} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
              {name}
            </Text>
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.sub} numberOfLines={1}>
              {levelLabel(route, hereZone)} · ahorras {pesos(route.saving)}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {points.length >= 2 ? (
            <View style={styles.map} accessible accessibilityLabel={`Mapa de la ruta con ${stops.length} paradas en orden`}>
              <MapView style={StyleSheet.absoluteFill} initialRegion={regionOf(points)} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}>
                <Polyline coordinates={points} strokeColor={colors.primary} strokeWidth={4} lineDashPattern={[2, 10]} />
                {stops.map((s, k) =>
                  typeof s.latitude === 'number' && typeof s.longitude === 'number' ? (
                    <Marker key={s.id} coordinate={{ latitude: s.latitude, longitude: s.longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} onPress={() => onOpenOffer(s)}>
                      <View style={[styles.pin, { backgroundColor: categoryColor(s.category_color).fg }]}>
                        <Text style={styles.pinText}>{k + 1}</Text>
                      </View>
                    </Marker>
                  ) : null,
                )}
              </MapView>
            </View>
          ) : null}

          <View style={styles.timeline}>
            {stops.map((s, k) => {
              const at = route.times[k];
              const leg = k < stops.length - 1 ? legLabel(metersBetween(s, stops[k + 1])) : null;
              const done = claimed.includes(s.id);
              return (
                <View key={s.id} style={styles.row}>
                  <View style={[styles.time, !timed && styles.timeOff]}>
                    {at ? (
                      <>
                        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.timeH}>
                          {clockLabel(at).split(' ')[0]}
                        </Text>
                        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.timeAmPm}>
                          {clockLabel(at).split(' ')[1]}
                        </Text>
                      </>
                    ) : null}
                  </View>
                  <View style={styles.rail}>
                    <View style={[styles.dot, { backgroundColor: categoryColor(s.category_color).fg }]}>
                      <Text style={styles.dotText}>{k + 1}</Text>
                    </View>
                    {k < stops.length - 1 ? <View style={styles.line} /> : null}
                  </View>
                  <View style={styles.cardCol}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Parada ${k + 1}${at ? `, a las ${clockLabel(at)}` : ''}: ${s.title} en ${s.entity_name}${done ? ', ya reclamada' : ''}`}
                      onPress={() => onOpenOffer(s)}
                      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                    >
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {s.title}
                      </Text>
                      <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.cardSub} numberOfLines={1}>
                        {[s.entity_name, s.attendant_name ? `${s.attendant_name} atiende` : null].filter(Boolean).join(' · ')}
                      </Text>
                      <View style={styles.priceRow}>
                        {typeof s.special_price === 'number' ? <Text style={styles.price}>{pesos(s.special_price)}</Text> : null}
                        {savingPesos(s) ? (
                          <View style={styles.save}>
                            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.saveText}>
                              −{pesos(savingPesos(s))}
                            </Text>
                          </View>
                        ) : null}
                        {done ? (
                          <View style={styles.doneTag}>
                            <Ionicons name="checkmark" size={12} color={colors.successInk} />
                            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.doneText}>
                              Reclamada
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                    {leg ? (
                      <View style={styles.leg}>
                        <Ionicons name={leg.includes('carro') ? 'car-outline' : 'walk-outline'} size={13} color={colors.muted} />
                        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.legText}>
                          {leg}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.foot, { paddingBottom: insets.bottom + spacing.sm }]}>
          {claimer.message ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {claimer.message}
            </Text>
          ) : null}
          {pending.length ? (
            <Pressable accessibilityRole="button" accessibilityState={{ busy: claiming, disabled: claiming }} disabled={claiming} onPress={() => void claimAll()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              {claiming ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="qr-code-outline" size={18} color={colors.white} />
                  <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.ctaText}>
                    {signedIn ? `Reclamar ${pending.length === stops.length ? `las ${pending.length}` : `las ${pending.length} que faltan`} · ahorras ${pesos(pendingSave)}` : 'Inicia sesión para reclamar'}
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={onTickets} style={({ pressed }) => [styles.cta, styles.ctaDone, pressed && styles.pressed]}>
              <Ionicons name="ticket-outline" size={18} color={colors.white} />
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.ctaText}>
                Listo: ver mis {stops.length} boletos
              </Text>
            </Pressable>
          )}
          {points.length >= 2 ? (
            <Pressable accessibilityRole="button" onPress={openMaps} style={({ pressed }) => [styles.alt, pressed && styles.pressed]}>
              <Ionicons name="navigate-outline" size={17} color={colors.ink} />
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.altText}>
                Abrir en mapas
              </Text>
            </Pressable>
          ) : null}
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.note}>
            Un QR por oferta, como siempre. Puedes reclamar solo una tocándola.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.98 }] },
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  body: { paddingBottom: spacing.lg },
  map: { height: 210, marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceAlt },
  pin: { width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  pinText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.white },
  timeline: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  time: { width: 46, alignItems: 'flex-end', paddingTop: spacing.md },
  timeOff: { width: 0 },
  timeH: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  timeAmPm: { fontSize: 10.5, fontFamily: fonts.ui.bold, color: colors.muted },
  rail: { width: 24, alignItems: 'center' },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  dotText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.white },
  line: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 4 },
  cardCol: { flex: 1, minWidth: 0, paddingBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, marginTop: spacing.xs, gap: 2 },
  cardTitle: { fontSize: 14, lineHeight: 18, fontFamily: fonts.display.bold, color: colors.ink },
  cardSub: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  price: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  save: { backgroundColor: colors.successSoft, borderRadius: 6, paddingHorizontal: 6 },
  saveText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  doneTag: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.successSoft, borderRadius: 6, paddingHorizontal: 6 },
  doneText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6, paddingLeft: 2 },
  legText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  foot: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  error: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.dangerInk, textAlign: 'center' },
  cta: { minHeight: 52, borderRadius: radius.lg, backgroundColor: colors.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  ctaDone: { backgroundColor: colors.successSolid },
  ctaText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.white },
  alt: { minHeight: 44, borderRadius: radius.lg, backgroundColor: colors.bg, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  altText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  note: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center' },
});
