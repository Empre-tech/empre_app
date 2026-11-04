import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/EmptyState';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { formatPesos } from '@/lib/ledger';
import { displayIcon } from '@/lib/mapView';
import { MAP_STYLE } from '@/lib/mapStyle';
import { offerPriceParts } from '@/lib/offer';
import { distanceLabel } from '@/lib/offerMarket';
import { arrivalTimes, lateStops, loadSavedPlans, metersBetween, planHour, planKey, planTag, planTitle, planWalk, routeUrl, writeSavedPlans, type MarketRoute } from '@/lib/plans';
import { useCoords } from '@/lib/useCoords';
import { colors, fonts } from '@/theme';

const stopRing = (on: boolean) => (on ? { borderColor: colors.brand, padding: 3 } : { borderColor: colors.accent, padding: 0 });

/** El plan (tablero «Plan con las cuatro mejoras»): el recorrido en el mapa, sus paradas con hora y oferta, y qué hacer si una oferta termina antes de llegar. */
export default function PlanScreen() {
  const { plan, city } = useLocalSearchParams<{ plan?: string; city?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const coords = useCoords();
  const route = useMemo<MarketRoute | null>(() => {
    try {
      return plan ? (JSON.parse(plan) as MarketRoute) : null;
    } catch {
      return null;
    }
  }, [plan]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState('');
  const saved = useQuery({ queryKey: ['saved-plans'], queryFn: loadSavedPlans });

  if (!route || route.stops.length === 0) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Plan" />
        <EmptyState icon="map-outline" title="Este plan ya no está" body="Mira los planes de hoy en Ofertas." action={{ title: 'Ver ofertas', onPress: () => router.replace('/(tabs)/offers') }} />
      </View>
    );
  }

  const stops = order ? order.map((id) => route.stops.find((s) => s.id === id)!).filter(Boolean) : route.stops;
  const firstAt = route.times[0] ? Date.parse(route.times[0]) : Date.now() + 60 * 60_000;
  const times = arrivalTimes(stops, firstAt);
  const late = lateStops(stops, times);
  const located = stops.filter((s) => s.latitude && s.longitude);
  const isSaved = (saved.data ?? []).some((r) => planKey(r) === planKey(route));
  const title = planTitle(route, city);
  const selected = sel ?? stops[0].id;
  const lats = located.map((s) => s.latitude!);
  const lngs = located.map((s) => s.longitude!);

  const walkFrom = (i: number): string => {
    const s = stops[i];
    if (i > 0) {
      const p = stops[i - 1];
      if (!p.latitude || !p.longitude || !s.latitude || !s.longitude) return `Después de ${p.entity_name}`;
      return `${Math.max(1, Math.ceil(metersBetween(p.latitude, p.longitude, s.latitude, s.longitude) / 80))} min a pie desde ${p.entity_name}`;
    }
    if (coords && s.latitude && s.longitude) return `a ${distanceLabel(metersBetween(coords.latitude, coords.longitude, s.latitude, s.longitude))} de ti`;
    const d = distanceLabel(s.distance_meters);
    return d ? `a ${d} de ti` : 'Primera parada';
  };

  const toggleSave = async () => {
    const list = saved.data ?? [];
    const next = isSaved ? list.filter((r) => planKey(r) !== planKey(route)) : [{ ...route, stops, times: times.map((t) => new Date(t).toISOString()) }, ...list].slice(0, 20);
    await writeSavedPlans(next);
    qc.setQueryData(['saved-plans'], next);
    setToast(isSaved ? 'Quitado de Mis salidas' : 'Guardado en Mis salidas');
  };
  const send = () => {
    const lines = stops.map((s, i) => `${i + 1}. ${planHour(times[i])} · ${s.entity_name}: ${s.title}`);
    setSharing(false);
    void Share.share({ message: `${title}\n${lines.join('\n')}${route.saving > 0 ? `\nAhorras ${formatPesos(route.saving)}` : ''}\n\nLo armé en Empre.` });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={[styles.map, { height: 300 + insets.top }]} accessible accessibilityLabel={`Mapa con ${located.length} paradas`}>
          {located.length ? (
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: (Math.min(...lats) + Math.max(...lats)) / 2 - (Math.max(...lats) - Math.min(...lats)) * 0.15,
                longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
                latitudeDelta: Math.max(0.006, (Math.max(...lats) - Math.min(...lats)) * 2.2),
                longitudeDelta: Math.max(0.006, (Math.max(...lngs) - Math.min(...lngs)) * 1.8),
              }}
              showsUserLocation={Boolean(coords)}
              showsPointsOfInterests={false}
              customMapStyle={MAP_STYLE}
              toolbarEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Polyline coordinates={located.map((s) => ({ latitude: s.latitude!, longitude: s.longitude! }))} strokeColor={colors.primaryDark} strokeWidth={4} />
              {located.map((s) => {
                const on = s.id === selected;
                return (
                  <Marker key={`${s.id}|${on}|${stops.indexOf(s)}`} coordinate={{ latitude: s.latitude!, longitude: s.longitude! }} tracksViewChanges={false} accessibilityLabel={`Parada ${stops.indexOf(s) + 1}: ${s.entity_name}${on ? ', elegida' : ''}`} onPress={() => setSel(s.id)}>
                    <View style={[styles.pinOut, on && styles.pinOutOn]}>
                      <View style={[styles.pin, on && styles.pinOn]}>
                        <Text style={styles.pinText}>{stops.indexOf(s) + 1}</Text>
                      </View>
                    </View>
                  </Marker>
                );
              })}
            </MapView>
          ) : null}
          {route.zone ? (
            <View style={styles.mapZone} pointerEvents="none">
              <Text style={styles.mapZoneText}>{route.zone}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.eyebrow}>PLAN · {planTag(route, city)}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.meta}>
              {planWalk(route).split(' · ')[0]} · {stops.length} paradas · {planHour(times[0])} a {planHour(times[times.length - 1])}
            </Text>
            {route.saving > 0 ? (
              <View style={styles.saving}>
                <Text style={styles.savingText}>Ahorras {formatPesos(route.saving)} en total</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.list}>
            <View style={styles.dash} />
            {stops.map((s, i) => {
              const parts = offerPriceParts(s);
              const service = s.kind === 'service';
              const on = s.id === selected;
              const open = () => (service ? router.push({ pathname: '/business/[id]', params: { id: s.entity_id } }) : router.push({ pathname: '/offer/[id]', params: { id: s.id, entityId: s.entity_id } }));
              return (
                <View key={s.id} style={styles.stop}>
                  <View style={[styles.numOut, on && styles.numOutOn]}>
                    <View style={[styles.num, on && styles.numOn]}>
                      <Text style={styles.numText}>{i + 1}</Text>
                    </View>
                  </View>
                  <View style={styles.stopBody}>
                    <Text style={styles.when} numberOfLines={1}>
                      {planHour(times[i])} · {walkFrom(i)}
                    </Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${s.entity_name}: ${s.title}. Ver ${service ? 'el negocio' : 'la oferta'}`} accessibilityState={{ selected: on }} onPress={() => (on ? open() : setSel(s.id))} style={[styles.card, on && styles.cardOn]}>
                      <View style={styles.bizRow}>
                        <View style={styles.bizIcon}>
                          <Ionicons name={displayIcon(s.category_icon) as keyof typeof Ionicons.glyphMap} size={20} color={colors.ink} />
                        </View>
                        <View style={styles.bizText}>
                          <Text style={styles.biz} numberOfLines={1}>
                            {s.entity_name}
                          </Text>
                          <Text style={styles.cat} numberOfLines={1}>
                            {s.category_name}
                            {s.open_now ? (
                              <>
                                {' · '}
                                <Text style={styles.open}>Abierto</Text>
                              </>
                            ) : null}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.offerRow}>
                        <View style={styles.offerText}>
                          <Text style={styles.offerTitle} numberOfLines={2}>
                            {s.title}
                          </Text>
                          {parts.now ? (
                            <View style={styles.priceRow}>
                              <Text style={styles.price}>{parts.now}</Text>
                              {parts.was ? <Text style={styles.was}>{parts.was}</Text> : null}
                              {parts.savingPct > 0 ? (
                                <View style={styles.pct}>
                                  <Text style={styles.pctText}>-{parts.savingPct} %</Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                        <Pressable accessibilityRole="link" hitSlop={8} onPress={open}>
                          <Text style={styles.see}>{service ? 'Ver negocio ›' : 'Ver oferta ›'}</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                    {late[i] ? (
                      <View style={styles.warn} accessibilityLiveRegion="polite">
                        <View style={styles.warnTop}>
                          <Ionicons name="time-outline" size={18} color={colors.accentInk} />
                          <Text style={styles.warnTitle}>
                            Su oferta termina a las {planHour(s.ends_at)}. Llegarías a las {planHour(times[i])}.
                          </Text>
                        </View>
                        <View style={styles.warnTop}>
                          <Text style={styles.warnText}>Si vas primero, puedes alcanzarla.</Text>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Ir primero a ${s.entity_name}`} onPress={() => setOrder([s.id, ...stops.filter((x) => x.id !== s.id).map((x) => x.id)])} hitSlop={6} style={styles.warnBtn}>
                            <Text style={styles.warnBtnText}>Ir primero</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : !service ? (
                      <View style={styles.inTime}>
                        <Ionicons name="checkmark" size={14} color={colors.verified} />
                        <Text style={styles.inTimeText}>Llegas antes de que termine ({planHour(s.ends_at)})</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.note}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.verified} />
            <Text style={styles.noteText}>Ningún negocio paga por estar en un plan. Empre los junta por cercanía, horario y ofertas de hoy.</Text>
          </View>
        </View>
      </ScrollView>

      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/offers'))} style={[styles.float, styles.floatLeft, { top: insets.top + 14 }]}>
        <Ionicons name="chevron-back" size={20} color={colors.ink} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Compartir el plan" onPress={() => setSharing(true)} style={[styles.float, styles.floatRight, { top: insets.top + 14 }]}>
        <Ionicons name="share-outline" size={19} color={colors.ink} />
      </Pressable>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 92 }]} accessibilityLiveRegion="polite">
          <Text style={styles.toastText}>{toast}</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/salidas')} style={styles.toastLink}>
            <Text style={styles.toastLinkText}>Ver</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.bar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: isSaved }} accessibilityLabel={isSaved ? 'Quitar de Mis salidas' : 'Guardar en Mis salidas'} onPress={() => void toggleSave()} style={[styles.saveBtn, isSaved && styles.saveBtnOn]}>
          <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={colors.ink} />
          <Text style={styles.saveText}>{isSaved ? 'Guardado' : 'Guardar'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={located.length === 0} onPress={() => void Linking.openURL(routeUrl(stops))} style={[styles.routeBtn, located.length === 0 && { opacity: 0.5 }]}>
          <Ionicons name="map-outline" size={18} color="#fff" />
          <Text style={styles.routeText}>Ver la ruta</Text>
        </Pressable>
      </View>

      <Modal visible={sharing} transparent animationType="slide" onRequestClose={() => setSharing(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setSharing(false)} />
        <View style={[styles.shareSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.grab} />
          <View style={styles.shareHead}>
            <Text style={styles.shareTitle} accessibilityRole="header">
              Compartir el plan
            </Text>
            <Text style={styles.shareSub}>Le llega como mensaje, con las paradas y las horas, aunque no tenga Empre.</Text>
          </View>
          <View style={styles.preview}>
            <Text style={styles.eyebrowSm}>ASÍ LO RECIBE</Text>
            <Text style={styles.previewTitle}>{title}</Text>
            {stops.map((s, i) => (
              <View key={s.id} style={styles.previewRow}>
                <View style={styles.previewNum}>
                  <Text style={styles.previewNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.previewText} numberOfLines={2}>
                  <Text style={styles.previewBiz}>{s.entity_name}</Text> · {s.title}
                </Text>
                <Text style={styles.previewTime}>{planHour(times[i])}</Text>
              </View>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={send} style={styles.sendBtn}>
            <Text style={styles.sendText}>Enviar el plan</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  map: { backgroundColor: colors.selectedSoft },
  mapZone: { position: 'absolute', right: 12, bottom: 36, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  mapZoneText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted },
  pinOut: { padding: 2, borderRadius: 999, borderWidth: 3, borderColor: colors.accent, backgroundColor: colors.surface },
  pinOutOn: { padding: 3, borderColor: colors.brand },
  pin: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  pinOn: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: colors.accent },
  pinText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  sheet: { marginTop: -26, paddingTop: 22, paddingHorizontal: 20, gap: 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.bg },
  head: { gap: 8 },
  eyebrow: { fontSize: 12, letterSpacing: 1.2, fontFamily: fonts.ui.extrabold, color: colors.faint },
  title: { fontSize: 28, lineHeight: 30, letterSpacing: -0.28, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  saving: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.accent },
  savingText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  list: { gap: 14 },
  dash: { position: 'absolute', left: 17, top: 30, bottom: 30, borderLeftWidth: 2, borderStyle: 'dashed', borderLeftColor: colors.line },
  stop: { flexDirection: 'row', gap: 12 },
  numOut: { width: 36, height: 36, marginTop: 14, borderRadius: 18, borderWidth: 2.5, borderColor: colors.accent, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  numOutOn: { borderColor: colors.brand },
  num: { flex: 1, alignSelf: 'stretch', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  numOn: { borderWidth: 2.5, borderColor: colors.accent },
  numText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  stopBody: { flex: 1, minWidth: 0, gap: 6 },
  when: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.faint },
  card: { padding: 14, gap: 10, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardOn: { borderWidth: 2.5, borderColor: colors.ink, margin: -2.5 },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bizIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  bizText: { flex: 1, minWidth: 0 },
  biz: { fontSize: 17, lineHeight: 21, fontFamily: fonts.display.bold, color: colors.ink },
  cat: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  open: { fontFamily: fonts.ui.extrabold, color: colors.verified },
  offerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  offerText: { flex: 1, minWidth: 0, gap: 4 },
  offerTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  price: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: colors.ink },
  was: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.faint, textDecorationLine: 'line-through' },
  pct: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colors.accent },
  pctText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  see: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  warn: { gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.accentSoft },
  warnTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  warnTitle: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.accentInk },
  warnBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface },
  warnBtnText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  inTime: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.verifiedSoft },
  inTimeText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  note: { flexDirection: 'row', gap: 10 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  float: { position: 'absolute', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  floatLeft: { left: 14 },
  floatRight: { right: 14 },
  toast: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 12, borderRadius: 14, backgroundColor: colors.ink },
  toastText: { flex: 1, paddingVertical: 10, fontSize: 13.5, fontFamily: fonts.ui.bold, color: '#fff' },
  toastLink: { minHeight: 44, justifyContent: 'center' },
  toastLinkText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.hairline },
  saveBtn: { minHeight: 54, minWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  saveBtnOn: { borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  saveText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  routeBtn: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: colors.primary },
  routeText: { fontSize: 16, fontFamily: fonts.ui.extrabold, color: '#fff' },
  veil: { flex: 1, backgroundColor: 'rgba(14,35,70,0.38)' },
  shareSheet: { gap: 12, paddingTop: 10, paddingHorizontal: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  shareHead: { gap: 4 },
  shareTitle: { fontSize: 21, fontFamily: fonts.display.bold, color: colors.ink },
  shareSub: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  preview: { padding: 14, gap: 10, borderRadius: 16, backgroundColor: colors.bg },
  eyebrowSm: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  previewTitle: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  previewNum: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  previewNumText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.ink },
  previewText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.ink },
  previewBiz: { fontFamily: fonts.ui.extrabold },
  previewTime: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.faint },
  sendBtn: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.primary },
  sendText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff' },
});
