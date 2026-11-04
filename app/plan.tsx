import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { formatPesos } from '@/lib/ledger';
import { offerPriceParts } from '@/lib/offer';
import { arrivalTimes, lateStops, loadSavedPlans, planKey, planLevel, planTitle, routeUrl, writeSavedPlans, type MarketRoute } from '@/lib/plans';
import { colors, fonts, radius, spacing } from '@/theme';

const clock = (ms: number) => new Date(ms).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

/** El plan: el recorrido en el mapa, sus paradas con hora y oferta, y qué hacer si una oferta termina antes de llegar. */
export default function PlanScreen() {
  const { plan, city } = useLocalSearchParams<{ plan?: string; city?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const route = useMemo<MarketRoute | null>(() => {
    try {
      return plan ? (JSON.parse(plan) as MarketRoute) : null;
    } catch {
      return null;
    }
  }, [plan]);
  const [order, setOrder] = useState<string[] | null>(null);
  const saved = useQuery({ queryKey: ['saved-plans'], queryFn: loadSavedPlans });
  const [toast, setToast] = useState('');

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
  const lats = located.map((s) => s.latitude!);
  const lngs = located.map((s) => s.longitude!);

  const toggleSave = async () => {
    const list = saved.data ?? [];
    const next = isSaved ? list.filter((r) => planKey(r) !== planKey(route)) : [{ ...route, stops, times: times.map((t) => new Date(t).toISOString()) }, ...list].slice(0, 20);
    await writeSavedPlans(next);
    qc.setQueryData(['saved-plans'], next);
    setToast(isSaved ? 'Quitado de Mis salidas' : 'Guardado en Mis salidas');
  };
  const share = () => {
    const lines = stops.map((s, i) => `${i + 1}. ${clock(times[i])} · ${s.entity_name}: ${s.title}`);
    void Share.share({ message: `${title}\n${lines.join('\n')}${route.saving > 0 ? `\nAhorras ${formatPesos(route.saving)}` : ''}\n\nLo armé en Empre.` });
  };

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Plan" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        {located.length ? (
          <View style={styles.map} accessible accessibilityLabel={`Mapa con ${located.length} paradas`}>
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
                longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
                latitudeDelta: Math.max(0.006, (Math.max(...lats) - Math.min(...lats)) * 1.8),
                longitudeDelta: Math.max(0.006, (Math.max(...lngs) - Math.min(...lngs)) * 1.8),
              }}
              toolbarEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Polyline coordinates={located.map((s) => ({ latitude: s.latitude!, longitude: s.longitude! }))} strokeColor={colors.ink} strokeWidth={3} lineDashPattern={[6, 6]} />
              {located.map((s) => (
                <Marker key={s.id} coordinate={{ latitude: s.latitude!, longitude: s.longitude! }} tracksViewChanges={false} accessibilityLabel={s.entity_name}>
                  <View style={styles.pin}>
                    <Text style={styles.pinText}>{stops.indexOf(s) + 1}</Text>
                  </View>
                </Marker>
              ))}
            </MapView>
          </View>
        ) : null}

        <View style={styles.body}>
          <Text style={styles.eyebrow}>{['PLAN', route.zone?.toUpperCase()].filter(Boolean).join(' · ')}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.meta}>
            {planLevel(route.level)} · {stops.length} paradas · de {clock(times[0])} a {clock(times[times.length - 1])}
          </Text>
          {route.saving > 0 ? <Text style={styles.saving}>Ahorras {formatPesos(route.saving)} en total</Text> : null}

          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {stops.map((s, i) => {
              const parts = offerPriceParts(s);
              const service = s.kind === 'service';
              return (
                <View key={s.id} style={styles.stop}>
                  <View style={styles.stopHead}>
                    <View style={styles.num}>
                      <Text style={styles.numText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.time}>{clock(times[i])}</Text>
                  </View>
                  <Text style={styles.biz}>{s.entity_name}</Text>
                  <Text style={styles.cat}>{s.category_name}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${s.title}. Ver ${service ? 'el negocio' : 'la oferta'}`}
                    onPress={() => (service ? router.push({ pathname: '/business/[id]', params: { id: s.entity_id } }) : router.push({ pathname: '/offer/[id]', params: { id: s.id, entityId: s.entity_id } }))}
                    style={styles.offerRow}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.offerTitle}>{s.title}</Text>
                      {parts.now ? (
                        <Text style={styles.meta}>
                          {parts.now}
                          {parts.was ? <Text style={styles.was}> {parts.was}</Text> : null}
                          {parts.savingPct > 0 ? ` · -${parts.savingPct} %` : ''}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                  {late[i] ? (
                    <View style={styles.warn} accessibilityLiveRegion="polite">
                      <Text style={styles.warnText}>
                        Su oferta termina a las {clock(Date.parse(s.ends_at))} y llegarías a las {clock(times[i])}
                      </Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Ir primero a ${s.entity_name}`} onPress={() => setOrder([s.id, ...stops.filter((x) => x.id !== s.id).map((x) => x.id)])} style={styles.warnBtn}>
                        <Text style={styles.warnBtnText}>Ir primero</Text>
                      </Pressable>
                    </View>
                  ) : !service ? (
                    <Text style={styles.ok}>Llegas antes de que termine ({clock(Date.parse(s.ends_at))})</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Text style={styles.note}>Ningún negocio paga por estar en un plan. Empre los junta por cercanía, horario y ofertas de hoy.</Text>
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.sm }]}>
        {toast ? (
          <Text style={styles.toast} accessibilityLiveRegion="polite">
            {toast}
          </Text>
        ) : null}
        <View style={styles.barRow}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: isSaved }} accessibilityLabel={isSaved ? 'Quitar de Mis salidas' : 'Guardar en Mis salidas'} onPress={() => void toggleSave()} style={styles.iconBtn}>
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={22} color={colors.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Compartir el plan" onPress={share} style={styles.iconBtn}>
            <Ionicons name="share-outline" size={22} color={colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Button title="Ver la ruta" disabled={located.length === 0} onPress={() => void Linking.openURL(routeUrl(stops))} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  map: { height: 240, backgroundColor: colors.selectedSoft },
  pin: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, borderWidth: 2, borderColor: '#fff' },
  pinText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: '#fff' },
  body: { padding: spacing.lg, gap: 4 },
  eyebrow: { fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.ui.extrabold, color: colors.muted },
  title: { fontSize: 26, lineHeight: 31, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.semibold, color: colors.muted },
  saving: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  stop: { gap: 2, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  stopHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  numText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  time: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  biz: { fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.ink },
  cat: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  offerRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  offerTitle: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  was: { textDecorationLine: 'line-through' },
  warn: { gap: 4, marginTop: 4, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  warnText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  warnBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  warnBtnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  ok: { marginTop: 4, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.verified },
  note: { marginTop: spacing.md, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line },
  toast: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink, textAlign: 'center' },
});
