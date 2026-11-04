import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { askApi, type AskFilters, type AskResponse } from '@/api/ask';
import { categoriesApi } from '@/api/endpoints';
import { Avatar } from '@/components/Avatar';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { speechAvailable, startDictation } from '@/ledger/speech';
import { filterChips, howFar, QUICK_ASKS, suggestionAction } from '@/lib/askChips';
import { formatPesos } from '@/lib/catalog';
import { addRecent, loadRecents, saveRecents } from '@/lib/searchRecents';
import { useCoords } from '@/lib/useCoords';
import { colors, fonts, radius, spacing } from '@/theme';

const NO_FILTERS: AskFilters = { open_now: false, with_offer: false, delivery: false, cheapest: false };

const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * La búsqueda de Finder (tableros «Escribiendo» y «Resultados que entienden»). Arriba, el buscador. Sin escribir, lo
 * reciente; escribiendo, lo que coincide. Al buscar: lo entendido como condiciones que se quitan con un toque y los
 * negocios reales, con lo que coincide de lo que venden y su precio.
 */
export default function AskScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coords = useCoords();
  const params = useLocalSearchParams<{ q?: string; voice?: string }>();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(true);
  const [question, setQuestion] = useState('');
  const [filters, setFilters] = useState<AskFilters>(NO_FILTERS);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<AskResponse['businesses'][number] | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const seq = useRef(0);
  const started = useRef(false);

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 10 * 60_000 });

  const run = async (q: string, nextFilters: AskFilters) => {
    const clean = q.trim();
    if (!clean) return;
    const id = ++seq.current;
    setText(clean);
    setEditing(false);
    setQuestion(clean);
    setFilters(nextFilters);
    setLoading(true);
    setError(null);
    setRecents((list) => addRecent(list, clean));
    try {
      const res = await askApi.ask({
        q: clean,
        ...(coords ? { lat: coords.latitude, long: coords.longitude } : {}),
        open: nextFilters.open_now,
        offer: nextFilters.with_offer,
        delivery: nextFilters.delivery,
        cheap: nextFilters.cheapest,
      });
      if (id !== seq.current) return;
      setAnswer(res);
      setFilters(res.filters ?? nextFilters);
    } catch {
      if (id === seq.current) setError('No pudimos buscar ahora. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      if (id === seq.current) setLoading(false);
    }
  };

  const toggle = (key: keyof AskFilters) => void run(question, { ...filters, [key]: !filters[key] });

  const clear = () => {
    seq.current += 1;
    setText('');
    setQuestion('');
    setAnswer(null);
    setError(null);
    setLoading(false);
    setFilters(NO_FILTERS);
    setEditing(true);
  };

  const listen = async () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setListening(true);
    stopRef.current = await startDictation(
      {
        onText: (t, isFinal) => {
          setText(t);
          if (isFinal && t.trim()) {
            setListening(false);
            void run(t, NO_FILTERS);
          }
        },
        onEnd: () => setListening(false),
        onError: () => setListening(false),
      },
      [],
    );
    if (!stopRef.current) setListening(false);
  };

  useEffect(() => {
    void loadRecents().then((saved) => setRecents((now) => (now.length ? now : saved)));
    if (started.current) return;
    started.current = true;
    if (typeof params.q === 'string' && params.q.trim()) void run(params.q, NO_FILTERS);
    else if (params.voice === '1' && speechAvailable()) void listen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  const onSuggestion = (label: string, res: AskResponse) => {
    const a = suggestionAction(label);
    if (a.kind === 'filter') toggle(a.filter);
    else if (a.kind === 'map') router.push({ pathname: '/map', params: { q: res.terms } });
    else if (a.kind === 'categories') router.push('/categories');
    else void run(a.text, NO_FILTERS);
  };

  const typed = plain(text.trim());
  const showResults = !editing && (loading || Boolean(answer) || Boolean(error));
  const catHits = typed ? (categories.data ?? []).filter((c) => plain(c.name).includes(typed)).slice(0, 5) : [];
  const recentHits = typed ? recents.filter((r) => plain(r).includes(typed) && plain(r) !== typed).slice(0, 3) : recents;
  const chips = filterChips(filters);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.round}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setEditing(true);
            }}
            onFocus={() => setEditing(true)}
            placeholder={listening ? 'Te escucho…' : '¿Qué necesitas?'}
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => void run(text, NO_FILTERS)}
            maxLength={200}
            autoCorrect={false}
            accessibilityLabel="Buscar un negocio, un servicio o lo que necesites"
            autoFocus={params.voice !== '1' && !params.q}
          />
          {text ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" onPress={clear} hitSlop={8} style={styles.iconBtn}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Dejar de escuchar' : 'Buscar hablando'} onPress={() => void listen()} hitSlop={8} style={styles.iconBtn}>
              <Ionicons name={listening ? 'stop' : 'mic'} size={20} color={listening ? colors.primary : colors.ink} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        {!showResults ? (
          <>
            {typed ? (
              <Pressable accessibilityRole="button" onPress={() => void run(text, NO_FILTERS)} style={({ pressed }) => [styles.searchRow, pressed && styles.pressed]}>
                <Ionicons name="search" size={18} color={colors.ink} />
                <Text style={styles.searchRowText} numberOfLines={1}>
                  Buscar «{text.trim()}»
                </Text>
              </Pressable>
            ) : null}
            {catHits.length ? (
              <View style={styles.group}>
                <Text style={styles.eyebrow}>CATEGORÍAS</Text>
                <View style={styles.card}>
                  {catHits.map((c, i) => (
                    <Pressable key={c.id} accessibilityRole="button" onPress={() => void run(c.name, NO_FILTERS)} style={({ pressed }) => [styles.simpleRow, i > 0 && styles.rowLine, pressed && styles.pressed]}>
                      <Text style={styles.simpleText}>{c.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {recentHits.length ? (
              <View style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.eyebrow}>RECIENTES</Text>
                  {!typed ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setRecents([]);
                        saveRecents([]);
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.link}>Borrar</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.card}>
                  {recentHits.map((r, i) => (
                    <Pressable key={r} accessibilityRole="button" onPress={() => void run(r, NO_FILTERS)} style={({ pressed }) => [styles.simpleRow, i > 0 && styles.rowLine, pressed && styles.pressed]}>
                      <Ionicons name="time-outline" size={17} color={colors.muted} />
                      <Text style={styles.simpleText} numberOfLines={1}>
                        {r}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {!typed ? (
              <View style={styles.group}>
                <Text style={styles.hint}>Escribe como lo dirías: «corrientazo», «motilarme». También puedes decirlo con el micrófono.</Text>
                <View style={styles.chips}>
                  {QUICK_ASKS.map((q) => (
                    <Pressable key={q} accessibilityRole="button" onPress={() => void run(q, NO_FILTERS)} style={styles.chip}>
                      <Text style={styles.chipText}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.group}>
              <Text style={styles.eyebrow}>ENTENDÍ ESTO · TOCA PARA QUITAR</Text>
              <View style={styles.chips}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${answer?.terms || question} y buscar otra cosa`} onPress={clear} style={[styles.chip, styles.chipOn]}>
                  <Text style={styles.chipText}>{answer?.terms || question} ×</Text>
                </Pressable>
                {chips.map((c) => (
                  <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={`Quitar ${c.label}`} onPress={() => toggle(c.key)} style={[styles.chip, styles.chipOn]}>
                    <Text style={styles.chipText}>{c.label} ×</Text>
                  </Pressable>
                ))}
              </View>
              {answer?.suggestions.some((s) => suggestionAction(s).kind !== 'map') ? (
                <View style={styles.chips}>
                  {answer.suggestions.filter((s) => suggestionAction(s).kind !== 'map').map((s) => (
                    <Pressable key={s} accessibilityRole="button" onPress={() => onSuggestion(s, answer)} style={styles.chip}>
                      <Text style={styles.chipText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {loading ? (
              <View style={styles.loading} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.hint}>Buscando cerca de ti…</Text>
              </View>
            ) : error ? (
              <View style={styles.group} accessibilityLiveRegion="polite">
                <Text style={styles.hint}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={() => void run(question, filters)} style={styles.chip}>
                  <Text style={styles.chipText}>Reintentar</Text>
                </Pressable>
              </View>
            ) : answer ? (
              <>
                {answer.widened ? (
                  <View style={styles.relaxed}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.ink} />
                    <Text style={styles.relaxedText}>No había nada muy cerca, así que busqué más lejos.</Text>
                  </View>
                ) : null}
                {answer.businesses.length ? (
                  <>
                    <Text style={styles.count} accessibilityLiveRegion="polite">
                      {answer.businesses.length === 1 ? '1 negocio' : `${answer.businesses.length} negocios`}
                    </Text>
                    {answer.businesses.map((b) => (
                      <Pressable key={b.id} accessibilityRole="button" onPress={() => setCard(b)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
                        <Avatar uri={b.profile_url} name={b.name} size={56} />
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <View style={styles.nameRow}>
                            <Text style={styles.resultName} numberOfLines={1}>
                              {b.name}
                            </Text>
                            {b.has_active_offer ? (
                              <View style={styles.offer}>
                                <Text style={styles.offerText}>Oferta</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.resultSub} numberOfLines={1}>
                            {[b.category_name, howFar(b.minutes, b.distance_km), b.delivery ? 'domicilio' : null].filter(Boolean).join(' · ')}
                          </Text>
                          {b.item ? (
                            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/business/product', params: { entityId: b.id, itemId: b.item!.id } })} hitSlop={6}>
                              <Text style={styles.why} numberOfLines={1}>
                                {b.item.name}
                                {b.item.price != null ? ` · ${b.item.price_from ? 'desde ' : ''}${formatPesos(b.item.price)}` : ''}
                              </Text>
                            </Pressable>
                          ) : null}
                          {b.has_hours ? (
                            <View style={styles.statusRow}>
                              <View style={[styles.dot, { backgroundColor: b.is_open_now ? colors.verified : '#8796AB' }]} />
                              <Text style={styles.statusText}>{b.is_open_now ? 'Abierto' : 'Cerrado'}</Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/map', params: { q: answer.terms || question } })} style={styles.mapBtn}>
                      <Ionicons name="map-outline" size={18} color={colors.ink} />
                      <Text style={styles.chipText}>Verlos en el mapa</Text>
                    </Pressable>
                    <Text style={styles.note}>Nadie paga por salir arriba.</Text>
                  </>
                ) : (
                  <View style={styles.none}>
                    <Text style={styles.noneTitle}>Nadie cerca ofrece «{question}» todavía</Text>
                    <Text style={styles.hint}>{answer.reply}</Text>
                  </View>
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <BusinessCardModal
        entity={card ? ({ ...card, distance_meters: card.distance_km * 1000, distanceKm: card.distance_km } as unknown as WithDistance) : null}
        onClose={() => setCard(null)}
        origin="ask"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, paddingRight: 4, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.line },
  input: { flex: 1, minWidth: 0, fontSize: 15.5, fontFamily: fonts.ui.semibold, color: colors.ink, padding: 0 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.lg, gap: spacing.md },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.ui.extrabold, color: colors.muted },
  link: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  hint: { fontSize: 13.5, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  pressed: { opacity: 0.8 },
  searchRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  searchRowText: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  card: { borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  simpleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  simpleText: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  chipOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  chipText: { fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.ink },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  relaxed: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  relaxedText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.semibold, color: colors.ink },
  count: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  result: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultName: { flexShrink: 1, fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.ink },
  resultSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  why: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  offer: { paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: colors.accent, justifyContent: 'center' },
  offerText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.ink },
  mapBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  note: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  none: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  noneTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
});
