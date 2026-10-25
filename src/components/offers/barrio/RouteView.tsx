import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { agendaApi } from '@/api/agenda';
import { useClaimOffer } from '@/claims/useClaimOffer';
import { categoryColor } from '@/lib/categoryColor';
import {
  bestSlot,
  bogotaDay,
  claimability,
  claimCta,
  clockLabel,
  fromYouLabel,
  legLabel,
  levelLabel,
  metersBetween,
  radiusLabel,
  reflowTimes,
  routeTitle,
  savingPesos,
  servicePriceLabel,
  type MarketRoute,
} from '@/lib/offerBarrio';
import { pesos, type MarketItem } from '@/lib/offerMarket';
import { saveRoute } from '@/lib/routeStore';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { alpha, colors, DENSE_TEXT_SCALE, fonts, radius, spacing } from '@/theme';

// «Ver la ruta» (3.49, 3.50): el mapa con las paradas numeradas en orden y la línea de tiempo. Cada parada dice si ya se
// puede reclamar desde donde estás o si se reclama al llegar (el radio de la oferta es la política del negocio). Un
// servicio va con su precio de siempre y, si el negocio usa la agenda, con «Si quieres, agenda tu hora»: la persona
// elige entre las horas libres de verdad y la ruta se reacomoda sola. El botón solo reclama lo que se puede desde aquí,
// y la ruta se puede guardar para el aviso «Llegaste a…».

type Pt = { latitude: number; longitude: number };

function regionOf(points: Pt[]) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: Math.max(0.004, (maxLat - minLat) * 1.6), longitudeDelta: Math.max(0.004, (maxLng - minLng) * 1.6) };
}

/** Las horas libres de un servicio para elegir (opcional): la que encaja con la ruta va marcada. */
function SlotsSheet({
  stop,
  suggested,
  onClose,
  preview,
  onBooked,
}: {
  stop: MarketItem;
  suggested: string | null;
  onClose: () => void;
  /** Lo que pasa con la ruta si se elige esa hora (o null si nada cambia). */
  preview: (slot: string) => string | null;
  onBooked: (slot: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const day = bogotaDay(suggested ?? new Date().toISOString());
  const slots = useQuery({ queryKey: ['availability', stop.entity_id, day, stop.service_id ?? null], queryFn: () => agendaApi.availability(stop.entity_id, day, stop.service_id), staleTime: 10_000 });
  const fit = bestSlot(slots.data ?? [], suggested);
  const [pick, setPick] = useState<string | null>(null);
  const chosen = pick ?? fit;
  const [busy, setBusy] = useState(false);
  const [session] = useState(() => Math.random().toString(36).slice(2, 8));

  const book = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      await agendaApi.book({ entity_id: stop.entity_id, service_id: stop.service_id, starts_at: chosen }, `${session}-${Date.parse(chosen).toString(36)}-${(stop.service_id ?? 'x').slice(0, 8)}`);
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onBooked(chosen);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (m === 'slot_taken') {
        setPick(null);
        void slots.refetch();
        Alert.alert('Esa hora se acaba de ocupar', 'Elige otra, ya actualizamos las disponibles.');
      } else if (m === 'too_many_pending') Alert.alert('Ya tienes 3 solicitudes pendientes', 'Espera a que te respondan antes de pedir otra.');
      else if (m === 'customer_busy') Alert.alert('Ya tienes una cita a esa hora', 'Elige otra hora.');
      else Alert.alert('No pudimos pedir la hora', 'Inténtalo de nuevo en un momento.');
    } finally {
      setBusy(false);
    }
  };

  const note = chosen ? preview(chosen) : null;
  return (
    <Modal visible transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar las horas" style={styles.veil} onPress={onClose} />
      <View style={[styles.slots, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
        <View style={styles.grab} />
        <Text style={styles.slotsTitle} accessibilityRole="header">
          Horas libres en {stop.entity_name}
        </Text>
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.slotsSub}>
          {[stop.title, stop.duration_min ? `${stop.duration_min} min` : null, stop.attendant_name ? `${stop.attendant_name} atiende` : null].filter(Boolean).join(' · ')}
        </Text>
        {slots.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.slotsSpin} />
        ) : (slots.data ?? []).length === 0 ? (
          <Text style={styles.slotsEmpty}>No quedan horas libres este día. Puedes seguir la ruta sin agendar.</Text>
        ) : (
          <View style={styles.slotGrid}>
            {(slots.data ?? []).slice(0, 12).map((s) => {
              const on = s === chosen;
              const fits = s === fit;
              return (
                <Pressable key={s} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${clockLabel(s)}${fits ? ', encaja con tu ruta' : ''}`} onPress={() => setPick(s)} style={[styles.slot, on && styles.slotOn]}>
                  <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.slotText, on && styles.slotTextOn]}>
                    {clockLabel(s)}
                  </Text>
                  {fits ? (
                    <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.slotFit, on && styles.slotFitOn]}>
                      Encaja con tu ruta
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
        {note ? (
          <Text style={[styles.slotNote, note.startsWith('⚠') && styles.slotNoteWarn]} accessibilityLiveRegion="polite">
            {note.replace(/^⚠ /, '')}
          </Text>
        ) : null}
        {chosen ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void book()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.ctaText}>
                Pedir las {clockLabel(chosen)}
              </Text>
            )}
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.alt, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.altText}>
            Seguir sin agendar
          </Text>
        </Pressable>
        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.note}>
          El negocio te confirma la cita. Puedes cancelarla cuando quieras.
        </Text>
      </View>
    </Modal>
  );
}

export function RouteView({
  route,
  city,
  hereZone,
  you,
  signedIn,
  onClose,
  onOpenOffer,
  onOpenBusiness,
  onTickets,
  onSignIn,
  onSaved,
}: {
  route: MarketRoute;
  city: string;
  hereZone: string;
  you: Pt | null;
  signedIn: boolean;
  onClose: () => void;
  onOpenOffer: (o: MarketItem) => void;
  onOpenBusiness: (o: MarketItem) => void;
  onTickets: () => void;
  onSignIn: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const claimer = useClaimOffer();
  const [claimed, setClaimed] = useState<string[]>([]); // ids de oferta ya reclamadas aquí
  const [claiming, setClaiming] = useState(false);
  const [times, setTimes] = useState<(string | null)[]>(route.times);
  const [booked, setBooked] = useState<Record<string, string>>({}); // id de parada → hora pedida
  const [slotsFor, setSlotsFor] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const stops = route.stops;
  const points = stops.filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number').map((s) => ({ latitude: s.latitude as number, longitude: s.longitude as number }));
  const timed = times.some(Boolean);
  const name = routeTitle(route, city);
  const fromYou = fromYouLabel(route.distance_from_you);

  // Qué se puede reclamar desde aquí y qué al llegar (el radio de cada oferta).
  const offers = stops.filter((s) => s.kind !== 'service');
  const pending = offers.filter((s) => !claimed.includes(s.id));
  const now = pending.filter((s) => claimability(s, you) !== 'arrive');
  const later = pending.filter((s) => claimability(s, you) === 'arrive');
  const nowSave = now.reduce((a, s) => a + savingPesos(s), 0);

  const claimNow = async () => {
    if (!signedIn) return onSignIn();
    setClaiming(true);
    for (const s of now) {
      const res = await claimer.claim(s.id);
      if (res) setClaimed((list) => [...list, s.id]);
    }
    setClaiming(false);
  };

  const save = async () => {
    await saveRoute({ ...route, times }, name, claimed);
    setSaved(true);
    onSaved();
  };

  const openMaps = () => {
    if (points.length < 2) return;
    const [first, ...rest] = points;
    const last = rest[rest.length - 1];
    const via = rest.slice(0, -1).map((p) => `${p.latitude},${p.longitude}`).join('|');
    const mode = route.level === 'walk' ? 'walking' : 'driving';
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${first.latitude},${first.longitude}&destination=${last.latitude},${last.longitude}${via ? `&waypoints=${encodeURIComponent(via)}` : ''}&travelmode=${mode}`);
  };

  const previewFor = (k: number) => (slot: string) => {
    if (k >= stops.length - 1) return null;
    const r = reflowTimes(stops, times, k, slot);
    if (r.closed !== null) return `⚠ Con esta hora, ${stops[r.closed].entity_name} quedaría a las ${clockLabel(r.times[r.closed] as string)} y ya estaría cerrado: la ruta te avisará para moverlo.`;
    const next = r.times[k + 1];
    return next ? `Con esta hora, ${stops[k + 1].entity_name} queda a las ${clockLabel(next)}.` : null;
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
            <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.sub} numberOfLines={2}>
              {[levelLabel(route, hereZone), fromYou?.toLowerCase(), route.saving ? `ahorras ${pesos(route.saving)}` : null].filter(Boolean).join(' · ')}
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
                    <Marker key={s.id} coordinate={{ latitude: s.latitude, longitude: s.longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} onPress={() => (s.kind === 'service' ? onOpenBusiness(s) : onOpenOffer(s))}>
                      <View style={[styles.pin, { backgroundColor: categoryColor(s.category_color).fg }, s.kind === 'service' && styles.pinSvc]}>
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
              const at = times[k];
              const leg = k < stops.length - 1 ? legLabel(metersBetween(s, stops[k + 1])) : null;
              const svc = s.kind === 'service';
              const done = claimed.includes(s.id);
              const where = claimability(s, you);
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
                    <View style={[styles.card, svc && styles.cardSvc]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Parada ${k + 1}${at ? `, a las ${clockLabel(at)}` : ''}: ${s.title} en ${s.entity_name}${svc ? `, ${servicePriceLabel(s)}` : done ? ', ya reclamada' : ''}`}
                        onPress={() => (svc ? onOpenBusiness(s) : onOpenOffer(s))}
                        style={({ pressed }) => [styles.cardTap, pressed && styles.pressed]}
                      >
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {s.title}
                        </Text>
                        <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.cardSub} numberOfLines={1}>
                          {[s.entity_name, s.attendant_name ? `${s.attendant_name} atiende` : null, s.duration_min ? `dura ${s.duration_min} min` : null].filter(Boolean).join(' · ')}
                        </Text>
                        <View style={styles.priceRow}>
                          {svc ? (
                            <>
                              {typeof s.service_price === 'number' ? <Text style={styles.price}>{s.price_from ? `desde ${pesos(s.service_price)}` : pesos(s.service_price)}</Text> : null}
                              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.svcTag}>
                                precio de siempre
                              </Text>
                            </>
                          ) : (
                            <>
                              {typeof s.special_price === 'number' ? <Text style={styles.price}>{pesos(s.special_price)}</Text> : null}
                              {savingPesos(s) ? (
                                <View style={styles.save}>
                                  <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.saveText}>
                                    −{pesos(savingPesos(s))}
                                  </Text>
                                </View>
                              ) : null}
                            </>
                          )}
                        </View>
                      </Pressable>
                      {svc ? (
                        <>
                          {s.rating ? (
                            <View style={[styles.badge, styles.badgeReviews]}>
                              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.badgeText, { color: colors.warningInk }]}>
                                ★ {s.rating.toFixed(1).replace('.', ',')} · lo recomiendan quienes fueron
                              </Text>
                            </View>
                          ) : null}
                          {booked[s.id] ? (
                            <View style={[styles.badge, styles.badgeAsked]}>
                              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.badgeText, { color: colors.primaryDark }]}>
                                Pedida para las {clockLabel(booked[s.id])} · {s.entity_name} te confirma
                              </Text>
                            </View>
                          ) : null}
                          {s.bookable ? (
                            <>
                              {!booked[s.id] ? (
                                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.optional}>
                                  Si quieres, agenda tu hora
                                </Text>
                              ) : null}
                              <Pressable accessibilityRole="button" onPress={() => (signedIn ? setSlotsFor(k) : onSignIn())} style={({ pressed }) => [styles.book, pressed && styles.pressed]}>
                                <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.bookText}>
                                  {booked[s.id] ? 'Cambiar la hora' : 'Ver horas disponibles'}
                                </Text>
                              </Pressable>
                            </>
                          ) : null}
                        </>
                      ) : done ? (
                        <View style={[styles.badge, styles.badgeOk]}>
                          <Ionicons name="checkmark" size={13} color={colors.successInk} />
                          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.badgeText, { color: colors.successInk }]}>
                            Reclamada · tu QR está en Mis boletos
                          </Text>
                        </View>
                      ) : where === 'arrive' ? (
                        <View style={[styles.badge, styles.badgeWait]}>
                          <Ionicons name="location-outline" size={13} color={colors.accentInk} />
                          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.badgeText, { color: colors.accentInk }]}>
                            Reclámala al llegar · {radiusLabel(s.radius_meters)}
                          </Text>
                        </View>
                      ) : where === 'here' ? (
                        <View style={[styles.badge, styles.badgeOk]}>
                          <Ionicons name="checkmark" size={13} color={colors.successInk} />
                          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={[styles.badgeText, { color: colors.successInk }]}>
                            Puedes reclamarla desde aquí
                          </Text>
                        </View>
                      ) : null}
                    </View>
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
          {now.length ? (
            <Pressable accessibilityRole="button" accessibilityState={{ busy: claiming, disabled: claiming }} disabled={claiming} onPress={() => void claimNow()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              {claiming ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="qr-code-outline" size={18} color={colors.white} />
                  <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.ctaText}>
                    {signedIn ? `${claimCta(now.length, later.length, claimed.length)}${later.length === 0 && nowSave ? ` · ahorras ${pesos(nowSave)}` : ''}` : 'Inicia sesión para reclamar'}
                  </Text>
                </>
              )}
            </Pressable>
          ) : claimed.length ? (
            <Pressable accessibilityRole="button" onPress={onTickets} style={({ pressed }) => [styles.cta, styles.ctaDone, pressed && styles.pressed]}>
              <Ionicons name="ticket-outline" size={18} color={colors.white} />
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.ctaText}>
                {later.length ? `${claimed.length} en Mis boletos · ${later.length} al llegar` : claimCta(0, 0, claimed.length)}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.altRow}>
            <Pressable accessibilityRole="button" disabled={saved} onPress={() => void save()} style={({ pressed }) => [styles.alt, styles.altHalf, pressed && styles.pressed]}>
              <Ionicons name={saved ? 'checkmark' : 'bookmark-outline'} size={17} color={colors.ink} />
              <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.altText}>
                {saved ? 'Ruta guardada' : 'Guardar la ruta'}
              </Text>
            </Pressable>
            {points.length >= 2 ? (
              <Pressable accessibilityRole="button" onPress={openMaps} style={({ pressed }) => [styles.alt, styles.altHalf, pressed && styles.pressed]}>
                <Ionicons name="navigate-outline" size={17} color={colors.ink} />
                <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.altText}>
                  Abrir en mapas
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text maxFontSizeMultiplier={DENSE_TEXT_SCALE} style={styles.note}>
            {later.length ? 'Guarda la ruta y te avisamos en Ofertas cuando estés cerca de lo que falta.' : 'Un QR por oferta, como siempre. Los servicios se pagan al precio de siempre.'}
          </Text>
        </View>
      </View>
      {slotsFor !== null ? (
        <SlotsSheet
          stop={stops[slotsFor]}
          suggested={times[slotsFor]}
          onClose={() => setSlotsFor(null)}
          preview={previewFor(slotsFor)}
          onBooked={(slot) => {
            const k = slotsFor;
            setBooked((b) => ({ ...b, [stops[k].id]: slot }));
            setTimes(reflowTimes(stops, times, k, slot).times);
            setSlotsFor(null);
          }}
        />
      ) : null}
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
  pinSvc: { borderStyle: 'dashed' },
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
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, marginTop: spacing.xs, gap: 4 },
  cardSvc: { borderStyle: 'dashed', borderColor: colors.mutedLight },
  cardTap: { gap: 2 },
  cardTitle: { fontSize: 14, lineHeight: 18, fontFamily: fonts.display.bold, color: colors.ink },
  cardSub: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  price: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  svcTag: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  save: { backgroundColor: colors.successSoft, borderRadius: 6, paddingHorizontal: 6 },
  saveText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '100%' },
  badgeText: { flexShrink: 1, fontSize: 11.5, fontFamily: fonts.ui.extrabold },
  badgeOk: { backgroundColor: colors.successSoft },
  badgeWait: { backgroundColor: colors.accentSoft },
  badgeReviews: { backgroundColor: colors.warningSoft },
  badgeAsked: { backgroundColor: colors.primarySoft },
  optional: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted, marginTop: 2 },
  book: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary },
  bookText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primary },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6, paddingLeft: 2 },
  legText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.muted },
  foot: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  error: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.dangerInk, textAlign: 'center' },
  cta: { minHeight: 52, borderRadius: radius.lg, backgroundColor: colors.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  ctaDone: { backgroundColor: colors.successSolid },
  ctaText: { flexShrink: 1, fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.white, textAlign: 'center' },
  altRow: { flexDirection: 'row', gap: spacing.sm },
  alt: { minHeight: 44, borderRadius: radius.lg, backgroundColor: colors.bg, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  altHalf: { flex: 1 },
  altText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  note: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'center' },
  veil: { flex: 1, backgroundColor: alpha(colors.black, 0.45) },
  slots: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  slotsTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  slotsSub: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: -6 },
  slotsSpin: { marginVertical: spacing.lg },
  slotsEmpty: { fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.muted, paddingVertical: spacing.md },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: { width: '31%', minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  slotOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  slotText: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  slotTextOn: { color: colors.white },
  slotFit: { fontSize: 9.5, fontFamily: fonts.ui.extrabold, color: colors.successInk },
  slotFitOn: { color: colors.successSoft },
  slotNote: { fontSize: 12, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted, backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.sm },
  slotNoteWarn: { backgroundColor: colors.accentSoft, color: colors.accentInk },
});
