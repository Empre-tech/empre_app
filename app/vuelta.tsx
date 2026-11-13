import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { askApi, type AskBusiness } from '@/api/ask';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { useCoords } from '@/lib/useCoords';
import { useNow } from '@/lib/useNow';
import { buildRoute, clockOf, deadlineOf, leaveIn, parseErrands, routeSummary, type Errand, type Leg } from '@/lib/vuelta';
import { colors, fonts, radius, spacing } from '@/theme';

type Spot = AskBusiness & { hasOffer: boolean };
type Stage = 'write' | 'route' | 'going';

const minutesNow = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Una vuelta por el barrio (tablero «Mis salidas y Plan», teléfonos 2 a 4): escribes lo que tienes que hacer, Empre
 * busca cada cosa abierta y cerca, ordena las paradas a pie con su hora y, en camino, dice cuándo salir. Los negocios
 * son los reales de Empre; si alguna cosa no está cerca y abierta, se dice y se puede quitar.
 */
export default function VueltaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coords = useCoords();
  const now = useNow(30_000);
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage>('write');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legs, setLegs] = useState<Leg<Spot>[]>([]);
  const [missing, setMissing] = useState<Errand[]>([]);
  const [offersFirst, setOffersFirst] = useState(true);
  const [step, setStep] = useState(0);
  const [late, setLate] = useState(0);

  const errands = useMemo(() => parseErrands(text), [text]);
  const deadline = useMemo(() => deadlineOf(text), [text]);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const found = await Promise.all(
        errands.map(async (e) => {
          const r = await askApi.ask({ q: e.q, open: true, ...(coords ? { lat: coords.latitude, long: coords.longitude } : {}) });
          const open = r.businesses.filter((b) => b.is_open_now && b.latitude && b.longitude);
          const sorted = offersFirst ? [...open].sort((a, b) => Number(b.has_active_offer) - Number(a.has_active_offer) || a.distance_km - b.distance_km) : open;
          const pick = sorted.find((b) => b.distance_km <= 2) ?? sorted[0];
          return { errand: e, place: pick ? ({ ...pick, hasOffer: pick.has_active_offer } as Spot) : null };
        }),
      );
      const picks = found.filter((f): f is { errand: Errand; place: Spot } => f.place !== null);
      setMissing(found.filter((f) => !f.place).map((f) => f.errand));
      const start = Math.ceil((minutesNow(Date.now()) + 5) / 5) * 5;
      const from = coords ?? (picks[0]?.place ? { latitude: picks[0].place.latitude, longitude: picks[0].place.longitude } : { latitude: 0, longitude: 0 });
      setLegs(buildRoute(from, picks, start));
      setStep(0);
      setLate(0);
      setStage('route');
    } catch {
      setError('No pudimos armar la vuelta. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const shifted = legs.map((l) => ({ ...l, arrive: l.arrive + late, leave: l.leave + late }));
  const end = shifted.length ? shifted[shifted.length - 1].leave : 0;
  const tooLate = deadline !== null && end > deadline;
  const cur = shifted[step];
  const leaveMin = cur ? leaveIn(cur, minutesNow(now)) : 0;
  const goMaps = (l: Leg<Spot>) =>
    void Linking.openURL(
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${l.place.latitude},${l.place.longitude}&dirflg=w`
        : `https://www.google.com/maps/dir/?api=1&destination=${l.place.latitude},${l.place.longitude}&travelmode=walking`,
    );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubScreenHeader title="Una vuelta por el barrio" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        {stage === 'write' ? (
          <>
            <Text style={styles.label}>¿Qué tienes que hacer hoy?</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              autoFocus
              placeholder="almorzar, cortarme el pelo y comprar unos tenis, antes de las 6"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Lo que tienes que hacer hoy"
              style={styles.input}
            />
            {errands.length ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  Entendí {errands.length} {errands.length === 1 ? 'parada' : 'paradas'}
                  {deadline !== null ? ` · antes de las ${clockOf(deadline)}` : ''}
                </Text>
                {errands.map((e, i) => (
                  <View key={e.q} style={styles.errand}>
                    <Text style={styles.errandN}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.errandT}>{e.label}</Text>
                      <Text style={styles.errandD}>
                        Busco «{e.q}» · unos {e.stay} min allá
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.label}>Cómo prefieres</Text>
            <View style={styles.prefs}>
              <View style={[styles.pref, styles.prefOn]}>
                <Text style={[styles.prefText, styles.prefTextOn]}>A pie</Text>
              </View>
              <View style={[styles.pref, styles.prefOn]}>
                <Text style={[styles.prefText, styles.prefTextOn]}>Solo abiertos</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: offersFirst }} onPress={() => setOffersFirst((v) => !v)} style={[styles.pref, offersFirst && styles.prefOn]}>
                <Text style={[styles.prefText, offersFirst && styles.prefTextOn]}>Con oferta primero</Text>
              </Pressable>
            </View>
            <Text style={styles.note}>Solo elige negocios abiertos ahora. Si alguno tiene oferta, la suma a la ruta.</Text>
            {error ? <Text style={styles.err}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={!errands.length || busy} onPress={() => void build()} style={[styles.main, (!errands.length || busy) && { opacity: 0.45 }]}>
              {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.mainText}>Armar la vuelta</Text>}
            </Pressable>
          </>
        ) : stage === 'route' ? (
          <>
            <Text style={styles.summary}>{shifted.length ? routeSummary(shifted) : 'No encontré nada abierto cerca'}</Text>
            {tooLate ? <Text style={styles.warn}>No alcanza antes de las {clockOf(deadline!)}: quita una parada o empieza antes.</Text> : null}
            {shifted.map((l, i) => (
              <View key={l.place.id + i} style={styles.leg}>
                <View style={styles.legLine}>
                  <View style={styles.legDot}>
                    <Text style={styles.legDotText}>{i + 1}</Text>
                  </View>
                  {i < shifted.length - 1 ? <View style={styles.legBar} /> : null}
                </View>
                <View style={styles.legBody}>
                  <Text style={styles.legHour}>{clockOf(l.arrive)}</Text>
                  <Text style={styles.legName}>{l.place.name}</Text>
                  <Text style={styles.legSub}>
                    {l.errand.label} · {l.walk} min a pie
                  </Text>
                  {l.place.hasOffer ? <Text style={styles.offer}>Tiene oferta</Text> : null}
                </View>
                <Pressable accessibilityRole="link" accessibilityLabel={`Ver ${l.place.name}`} onPress={() => router.push({ pathname: '/business/[id]', params: { id: l.place.id } })} style={styles.legSee}>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ))}
            {missing.length ? <Text style={styles.note}>Sin nada abierto cerca para: {missing.map((m) => m.label).join(', ')}.</Text> : null}
            {shifted.length ? (
              <Pressable accessibilityRole="button" onPress={() => setStage('going')} style={styles.main}>
                <Text style={styles.mainText}>Empezar · {clockOf(shifted[0].arrive)}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setStage('write')} style={styles.secondary}>
              <Text style={styles.secondaryText}>Cambiar lo que tengo que hacer</Text>
            </Pressable>
          </>
        ) : cur ? (
          <>
            <View style={styles.going} accessibilityLiveRegion="polite">
              <Text style={styles.goingHead}>
                {leaveMin > 0 ? `Sal en ${leaveMin} min` : leaveMin === 0 ? 'Sal ahora' : `Vas ${-leaveMin} min tarde`}
              </Text>
              <Text style={styles.goingSub}>
                {cur.errand.label} es a las {clockOf(cur.arrive)} y quedan {cur.walk} min a pie.
              </Text>
            </View>
            <Text style={styles.label}>
              Parada {step + 1} de {shifted.length}
              {step > 0 ? ` · ya pasaste por ${shifted[step - 1].place.name}` : ''}
            </Text>
            <View style={styles.card}>
              <Text style={styles.legName}>{cur.place.name}</Text>
              <Text style={styles.legSub}>
                {cur.errand.label} · {clockOf(cur.arrive)} · {cur.walk} min a pie
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => goMaps(cur)} style={styles.main}>
              <Text style={styles.mainText}>Ir ahora</Text>
            </Pressable>
            <View style={styles.prefs}>
              <Pressable accessibilityRole="button" onPress={() => setLate((v) => v + 15)} style={[styles.pref, { flex: 1 }]}>
                <Text style={styles.prefText}>Llego tarde (+15 min)</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => (step + 1 < shifted.length ? setStep(step + 1) : router.back())} style={[styles.pref, { flex: 1 }]}>
                <Text style={styles.prefText}>{step + 1 < shifted.length ? 'Ya pasé, siguiente' : 'Terminé la vuelta'}</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md },
  label: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  input: { minHeight: 96, padding: 14, borderRadius: radius.md, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.surface, fontSize: 16, lineHeight: 22, fontFamily: fonts.ui.medium, color: colors.ink, textAlignVertical: 'top' },
  card: { padding: 14, gap: 10, borderRadius: radius.lg, backgroundColor: colors.surface },
  cardTitle: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  errand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errandN: { width: 26, height: 26, borderRadius: 13, textAlign: 'center', textAlignVertical: 'center', lineHeight: 26, overflow: 'hidden', backgroundColor: colors.primarySoft, color: colors.primaryDark, fontSize: 13, fontFamily: fonts.ui.bold },
  errandT: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  errandD: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  prefs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pref: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  prefOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  prefText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.ink },
  prefTextOn: { color: colors.surface },
  note: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  err: { fontSize: 13.5, fontFamily: fonts.ui.medium, color: colors.ink },
  warn: { padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.ink },
  main: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  mainText: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.surface },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  summary: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink },
  leg: { flexDirection: 'row', gap: 12 },
  legLine: { alignItems: 'center', width: 28 },
  legDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryDark },
  legDotText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.surface },
  legBar: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 4 },
  legBody: { flex: 1, paddingBottom: 18, gap: 2 },
  legHour: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.primaryDark },
  legName: { fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink },
  legSub: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  offer: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.accent, color: colors.ink, fontSize: 12, fontFamily: fonts.ui.semibold },
  legSee: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  going: { padding: 16, gap: 4, borderRadius: radius.lg, backgroundColor: colors.ink },
  goingHead: { fontSize: 24, fontFamily: fonts.display.bold, color: colors.surface },
  goingSub: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.nightText },
});
