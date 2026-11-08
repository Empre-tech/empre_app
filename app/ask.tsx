import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { askApi, type AskFilters, type AskResponse } from '@/api/ask';
import { categoriesApi } from '@/api/endpoints';
import { discoveryApi } from '@/api/offers';
import type { DiscoveryItem } from '@/api/types';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { speechAvailable, startDictation } from '@/ledger/speech';
import { areaAround, familyFor, noneTitle, pickAlternatives } from '@/lib/askAlternatives';
import { filterChips, hourIdeas, howFar, suggestionAction } from '@/lib/askChips';
import { hourCO } from '@/lib/finance';
import { formatPesos } from '@/lib/catalog';
import { resolveImageUrl } from '@/lib/image';
import { displayIcon } from '@/lib/mapView';
import { MAP_STYLE } from '@/lib/mapStyle';
import { photoTone } from '@/lib/photoTone';
import { clearHabits, countSearch } from '@/lib/searchHabitsStore';
import { addRecent, loadRecents, saveRecents } from '@/lib/searchRecents';
import { useCoords } from '@/lib/useCoords';
import { liveParse } from '@/lib/voiceLive';
import { colors, fonts, spacing } from '@/theme';

const NO_FILTERS: AskFilters = { open_now: false, with_offer: false, delivery: false, cheapest: false };

const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

type AskPlace = AskResponse['businesses'][number] & Partial<DiscoveryItem>;

/** Un negocio de la lista de cerca con la forma de un resultado, sin perder su oferta para la tarjeta. */
function placeFrom(i: DiscoveryItem): AskPlace {
  const km = (i.distance_meters ?? 0) / 1000;
  return { ...i, category_id: i.category_id ?? '', category_name: i.category_name ?? '', category_icon: i.category_icon ?? '', profile_url: i.profile_url ?? '', is_open_now: Boolean(i.is_open_now), has_hours: i.is_open_now !== undefined, distance_km: km, minutes: Math.max(1, Math.round(km * 12.5)), delivery: false } as AskPlace;
}

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
  const [card, setCard] = useState<AskPlace | null>(null);
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
    // Una búsqueda nueva (no al cambiar un filtro de la misma) cuenta para «Lo que más buscas» del inicio.
    if (clean !== question) void countSearch(clean);
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
            const parsed = liveParse(t);
            void run(t, parsed.searchFilters);
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
  const live = useMemo(() => liveParse(text), [text]);
  const hasLiveFilters = live.searchFilters.open_now || live.searchFilters.with_offer || live.searchFilters.delivery || live.searchFilters.cheapest;
  const showResults = !editing && (loading || Boolean(answer) || Boolean(error));
  const catHits = typed ? (categories.data ?? []).filter((c) => plain(c.name).includes(typed)).slice(0, 5) : [];
  const recentHits = typed ? recents.filter((r) => plain(r).includes(typed) && plain(r) !== typed).slice(0, 3) : recents;
  const chips = filterChips(filters);

  const biz = answer?.businesses ?? [];
  const asked = answer?.terms || question;
  const isNone = !loading && !error && Boolean(answer) && biz.length === 0;
  const family = isNone ? familyFor(asked) : null;
  const nearby = useQuery({
    queryKey: ['ask-alternatives', family?.family, coords?.latitude.toFixed(2), coords?.longitude.toFixed(2)],
    // Sin ubicación se mira toda la ciudad, igual que la búsqueda.
    queryFn: () => discoveryApi.discover({ ...(coords ? { ...areaAround(coords.latitude, coords.longitude), lat: coords.latitude, long: coords.longitude } : {}), limit: 60 }),
    enabled: Boolean(family),
    staleTime: 60_000,
  });
  const alts = useMemo(() => {
    const lists = family ? pickAlternatives(nearby.data?.items ?? [], family, filters) : { offers: [], rest: [] };
    return { offers: lists.offers.map(placeFrom), rest: lists.rest.map(placeFrom) };
  }, [family, nearby.data, filters]);
  const hasAlts = alts.offers.length + alts.rest.length > 0;
  const ideas = isNone ? hourIdeas(hourCO(new Date().toISOString())) : [];
  const onMap = (biz.length ? (biz as AskPlace[]) : [...alts.offers, ...alts.rest]).filter((b) => b.latitude && b.longitude);
  const region = regionFor(onMap, coords);
  const count = biz.length === 1 ? '1 lugar que cumple' : `${biz.length} lugares que cumplen`;

  if (showResults) {
    return (
      <View style={styles.screen}>
        {/* El mapa sigue arriba: los resultados se encienden en él. */}
        <View style={styles.mapTop}>
          {region ? (
            <MapView key={onMap.map((b) => b.id).join('|')} style={StyleSheet.absoluteFill} initialRegion={region} showsUserLocation={Boolean(coords)} showsPointsOfInterests={false} customMapStyle={MAP_STYLE} toolbarEnabled={false} rotateEnabled={false} pitchEnabled={false}>
              {onMap.map((b) => (
                <Marker key={b.id} coordinate={{ latitude: b.latitude, longitude: b.longitude }} accessibilityLabel={`${b.name}, resultado`} onPress={() => setCard(b)} tracksViewChanges={false}>
                  <View style={[styles.pinRing, b.has_active_offer && styles.pinRingOffer]}>
                    <View style={styles.pin}>
                      <Ionicons name={displayIcon(b.category_icon) as keyof typeof Ionicons.glyphMap} size={18} color={colors.ink} />
                    </View>
                    <View style={[styles.pinDot, { backgroundColor: b.is_open_now ? '#14B8B0' : colors.placeholder }]} />
                  </View>
                </Marker>
              ))}
            </MapView>
          ) : null}
          <View style={[styles.floating, { top: insets.top + 12 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Buscaste ${question}. Cambiar la búsqueda`} onPress={() => setEditing(true)} style={styles.floatingTap}>
              <EmpreSymbol size={22} />
              <Text style={styles.floatingText} numberOfLines={1}>
                {question}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" onPress={clear} style={styles.floatingX}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.sheet} contentContainerStyle={[styles.sheetIn, { paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.group}>
            {isNone ? null : <Text style={styles.eyebrow}>ENTENDÍ ESTO · TOCA PARA QUITAR</Text>}
            <View style={styles.chips}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Quitar: ${answer?.terms || question}`} onPress={clear} style={styles.chipOn}>
                <Text style={styles.chipOnText}>{answer?.terms || question}</Text>
                <Text style={styles.chipOnText}>×</Text>
              </Pressable>
              {chips.map((c) => (
                <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={`Quitar: ${c.label}`} onPress={() => toggle(c.key)} style={styles.chipOn}>
                  <Text style={styles.chipOnText}>{c.label}</Text>
                  <Text style={styles.chipOnText}>×</Text>
                </Pressable>
              ))}
              {answer?.suggestions.filter((x) => suggestionAction(x).kind !== 'map').map((x) => (
                <Pressable key={x} accessibilityRole="button" onPress={() => onSuggestion(x, answer)} style={styles.chipAdd}>
                  <Text style={styles.chipAddText}>{x}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {loading ? (
            <View style={styles.loading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.hint}>Buscando cerca de ti…</Text>
            </View>
          ) : error ? (
            <View style={styles.group} accessibilityLiveRegion="polite">
              <Text style={styles.hint}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void run(question, filters)} style={styles.retry}>
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : answer ? (
            <>
              {answer.widened ? (
                <Text style={styles.relaxed}>No había nada muy cerca, así que busqué más lejos.</Text>
              ) : null}
              {biz.length ? (
                <>
                  <Text style={styles.count} accessibilityLiveRegion="polite">
                    {count}
                  </Text>
                  {biz.map((b, i) => {
                    const photo = b.profile_url ? resolveImageUrl(b.profile_url) : null;
                    return (
                      <Pressable key={b.id} accessibilityRole="button" onPress={() => setCard(b)} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
                        <View style={[styles.resultPhoto, { backgroundColor: photoTone(i) }]}>
                          {photo ? <Image accessible={false} source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={displayIcon(b.category_icon) as keyof typeof Ionicons.glyphMap} size={28} color="#fff" />}
                          {b.has_active_offer ? (
                            <View style={styles.offer}>
                              <Text style={styles.offerText}>Oferta</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.resultBody}>
                          <Text style={styles.resultName} numberOfLines={1}>
                            {b.name}
                          </Text>
                          <Text style={styles.resultSub} numberOfLines={2}>
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
                          {b.has_hours ? <Text style={[styles.statusText, { color: b.is_open_now ? colors.verified : colors.muted }]}>{b.is_open_now ? 'Abierto' : 'Cerrado'}</Text> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                  <Text style={styles.note}>Ordenado por lo que pediste, si está abierto y cercanía. Nadie paga por salir arriba.</Text>
                </>
              ) : (
                <>
                  <View style={styles.none} accessibilityLiveRegion="polite">
                    <Text style={styles.noneTitle}>{noneTitle(asked, family)}</Text>
                    <Text style={styles.hint}>{hasAlts && family ? `Pero hay esto parecido. No son ${family.plural}.` : chips.length ? 'Prueba quitando una condición.' : 'Todavía no hay nada parecido en Empre.'}</Text>
                  </View>
                  {family && nearby.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
                  {alts.offers.length ? (
                    <View style={styles.altGroup}>
                      <Text style={styles.altHead}>Con oferta ahora</Text>
                      {alts.offers.map((b, i) => (
                        <ResultRow key={b.id} b={b} tone={i} onOpen={() => setCard(b)} />
                      ))}
                    </View>
                  ) : null}
                  {alts.rest.length && family ? (
                    <View style={styles.altGroup}>
                      <Text style={styles.altHead}>Otras opciones de {family.family}</Text>
                      {alts.rest.map((b, i) => (
                        <ResultRow key={b.id} b={b} tone={i + alts.offers.length} onOpen={() => setCard(b)} />
                      ))}
                    </View>
                  ) : null}
                  {hasAlts ? (
                    <Text style={styles.note}>Ordenado por si está abierto y cercanía. Nadie paga por salir aquí.</Text>
                  ) : family && nearby.isLoading ? null : (
                    <View style={styles.altGroup}>
                      <Text style={styles.altHead}>Mira lo que hay en tu zona</Text>
                      <View style={styles.ideas}>
                        {ideas.map((idea) => (
                          <Pressable key={idea.ask} accessibilityRole="button" onPress={() => void run(idea.ask, NO_FILTERS)} style={({ pressed }) => [styles.idea, pressed && styles.pressed]}>
                            <Ionicons name={idea.icon} size={22} color={colors.ink} />
                            <Text style={styles.ideaText} numberOfLines={2}>
                              {idea.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}
            </>
          ) : null}
        </ScrollView>

        <BusinessCardModal entity={card ? ({ ...card, distance_meters: card.distance_km * 1000, distanceKm: card.distance_km } as unknown as WithDistance) : null} onClose={() => setCard(null)} origin="ask" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.searchBox}>
          <EmpreSymbol size={22} />
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              setEditing(true);
            }}
            placeholder={listening ? 'Te escucho…' : '¿Qué necesitas?'}
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => void run(text, NO_FILTERS)}
            maxLength={200}
            autoCorrect={false}
            accessibilityLabel="Buscar un negocio, un servicio o lo que necesites"
            autoFocus={params.voice !== '1' && !params.q}
          />
          {text ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" onPress={clear} style={styles.clearBtn}>
              <Ionicons name="close" size={18} color={colors.ink} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Dejar de escuchar' : 'Buscar hablando'} onPress={() => void listen()} hitSlop={4} style={styles.micBtn}>
            <Ionicons name={listening ? 'stop' : 'mic-outline'} size={16} color={colors.primaryDark} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        {listening || hasLiveFilters ? (
          <View style={styles.liveCard} accessibilityLiveRegion="polite">
            <View style={styles.liveCardHead}>
              <Text style={styles.liveBrand}>EMPRE AI LIVE · BÚSQUEDA</Text>
              {listening ? <View style={styles.liveDot} /> : null}
            </View>
            <Text style={styles.liveTranscript}>
              {live.words.length > 0
                ? live.words.map((w, i) => (
                    <Text key={i} style={w.tag === 'filter' ? styles.liveWordFilter : undefined}>
                      {`${w.text}${i < live.words.length - 1 ? ' ' : ''}`}
                    </Text>
                  ))
                : 'Habla con naturalidad: «comida rápida abierta ahora con oferta»…'}
            </Text>
            {hasLiveFilters ? (
              <View style={styles.chips}>
                {live.searchFilters.open_now ? (
                  <View style={[styles.liveFilterPill, styles.filterRow, { backgroundColor: colors.verifiedSoft }]}>
                    <View style={styles.openDot} />
                    <Text style={[styles.liveFilterText, { color: colors.verified }]}>Abierto ahora</Text>
                  </View>
                ) : null}
                {live.searchFilters.with_offer ? (
                  <View style={[styles.liveFilterPill, styles.filterRow, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="pricetag-outline" size={13} color={colors.accentInk} />
                    <Text style={[styles.liveFilterText, { color: colors.accentInk }]}>Con oferta</Text>
                  </View>
                ) : null}
                {live.searchFilters.delivery ? (
                  <View style={[styles.liveFilterPill, styles.filterRow, { backgroundColor: colors.selectedSoft }]}>
                    <Ionicons name="bicycle-outline" size={14} color={colors.ink} />
                    <Text style={[styles.liveFilterText, { color: colors.ink }]}>Domicilio</Text>
                  </View>
                ) : null}
                {live.searchFilters.cheapest ? (
                  <View style={[styles.liveFilterPill, styles.filterRow, { backgroundColor: colors.selectedSoft }]}>
                    <Ionicons name="cash-outline" size={14} color={colors.ink} />
                    <Text style={[styles.liveFilterText, { color: colors.ink }]}>Más económico</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
        {typed ? (
          <Pressable accessibilityRole="button" onPress={() => void run(text, live.searchFilters)} style={({ pressed }) => [styles.searchRow, pressed && styles.pressed]}>
            <Ionicons name="search" size={18} color={colors.ink} />
            <Text style={styles.searchRowText} numberOfLines={1}>
              Buscar «{text.trim()}»
            </Text>
          </Pressable>
        ) : null}
        {catHits.length ? (
          <View style={styles.tight}>
            <Text style={styles.groupEyebrow}>CATEGORÍAS</Text>
            <View style={styles.card}>
              {catHits.map((c, i) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => void run(c.name, NO_FILTERS)} style={({ pressed }) => [styles.catRow, i < catHits.length - 1 && styles.rowLine, pressed && styles.pressed]}>
                  <View style={styles.catTile}>
                    <Ionicons name={displayIcon(c.icon) as keyof typeof Ionicons.glyphMap} size={20} color={colors.ink} />
                  </View>
                  <Text style={styles.catText} numberOfLines={1}>
                    <Hit text={c.name} typed={typed} />
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.placeholder} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {recentHits.length ? (
          <View style={styles.tight}>
            <View style={styles.groupHead}>
              <Text style={styles.groupEyebrow}>RECIENTES</Text>
              {!typed ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setRecents([]);
                    saveRecents([]);
                    clearHabits();
                  }}
                  style={styles.linkTap}
                >
                  <Text style={styles.link}>Borrar</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.card}>
              {recentHits.map((r, i) => (
                <Pressable key={r} accessibilityRole="button" onPress={() => void run(r, NO_FILTERS)} style={({ pressed }) => [styles.recentRow, i < recentHits.length - 1 && styles.rowLine, pressed && styles.pressed]}>
                  <Ionicons name="time-outline" size={18} color={colors.faint} />
                  <Text style={styles.recentText} numberOfLines={1}>
                    {r}
                  </Text>
                  <Ionicons name="arrow-up-outline" size={16} color={colors.placeholder} style={styles.northEast} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {!typed ? <Text style={styles.typeHint}>Escribe como lo dirías: «corrientazo», «motilarme». Empre entiende palabras de aquí y errores de dedo.</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Lo que escribiste, en negrita dentro del nombre. */
function Hit({ text, typed }: { text: string; typed: string }) {
  const at = plain(text).indexOf(typed);
  if (at < 0 || !typed) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Text style={styles.hit}>{text.slice(at, at + typed.length)}</Text>
      {text.slice(at + typed.length)}
    </>
  );
}

/** Encuadra los resultados en el mapa; sin resultados, donde estás. */
function regionFor(list: { latitude: number; longitude: number }[], coords: { latitude: number; longitude: number } | null) {
  if (!list.length) return coords ? { ...coords, latitudeDelta: 0.02, longitudeDelta: 0.02 } : null;
  const lats = list.map((b) => b.latitude);
  const lngs = list.map((b) => b.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: Math.max(0.012, (maxLat - minLat) * 1.7), longitudeDelta: Math.max(0.012, (maxLng - minLng) * 1.5) };
}

/** Un negocio en la lista: foto, categoría con distancia, si está abierto y lo que coincide de lo que vende. */
function ResultRow({ b, tone, onOpen }: { b: AskPlace; tone: number; onOpen: () => void }) {
  const photo = b.profile_url ? resolveImageUrl(b.profile_url) : null;
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
      <View style={[styles.resultPhoto, { backgroundColor: photoTone(tone) }]}>
        {photo ? <Image accessible={false} source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={displayIcon(b.category_icon) as keyof typeof Ionicons.glyphMap} size={28} color="#fff" />}
        {b.has_active_offer ? (
          <View style={styles.offer}>
            <Text style={styles.offerText}>Oferta</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.resultBody}>
        <Text style={styles.resultName} numberOfLines={1}>
          {b.name}
        </Text>
        <Text style={styles.resultSub} numberOfLines={2}>
          {[b.category_name, b.distance_km > 0 ? howFar(b.minutes, b.distance_km) : null].filter(Boolean).join(' · ')}
        </Text>
        {b.has_hours ? <Text style={[styles.statusText, { color: b.is_open_now ? colors.verified : colors.muted }]}>{b.is_open_now ? 'Abierto' : 'Cerrado'}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  altGroup: { gap: 8 },
  altHead: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  ideas: { flexDirection: 'row', gap: 8 },
  idea: { flex: 1, minWidth: 0, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, borderRadius: 16, backgroundColor: colors.bg },
  ideaText: { fontSize: 12.5, textAlign: 'center', fontFamily: fonts.ui.extrabold, color: colors.ink },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#14B8B0' },
  screen: { flex: 1, backgroundColor: colors.bg },
  pressed: { opacity: 0.8 },
  // Escribiendo
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8, borderRadius: 24, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.ink },
  input: { flex: 1, minWidth: 0, minHeight: 48, fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink, padding: 0 },
  clearBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.line },
  micBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  body: { padding: 12, gap: 12 },
  liveCard: { gap: 8, padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  liveCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBrand: { fontSize: 11, letterSpacing: 0.7, fontFamily: fonts.ui.extrabold, color: colors.verified },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  liveTranscript: { fontSize: 18, lineHeight: 25, fontFamily: fonts.display.bold, color: colors.ink },
  liveWordFilter: { color: colors.verified, backgroundColor: colors.verifiedSoft },
  liveFilterPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  liveFilterText: { fontSize: 12, fontFamily: fonts.ui.extrabold },
  tight: { gap: 4 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupEyebrow: { paddingHorizontal: 4, paddingBottom: 2, fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  linkTap: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  hint: { fontSize: 13.5, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  typeHint: { paddingHorizontal: 4, fontSize: 13, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.faint },
  searchRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surface },
  searchRowText: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  card: { paddingVertical: 2, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surface },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  recentRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12 },
  recentText: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.bold, color: colors.ink },
  northEast: { transform: [{ rotate: '45deg' }] },
  catRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 },
  catTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  catText: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  hit: { fontFamily: fonts.ui.extrabold },
  // Resultados
  mapTop: { height: 350, flexShrink: 0, backgroundColor: colors.selectedSoft },
  floating: { position: 'absolute', left: 12, right: 12, minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 6, borderRadius: 24, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  floatingTap: { flex: 1, minWidth: 0, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10 },
  floatingText: { flex: 1, minWidth: 0, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  floatingX: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pinRing: { padding: 3, borderRadius: 999, backgroundColor: colors.surface },
  pinRingOffer: { backgroundColor: colors.accent },
  pin: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  pinDot: { position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.surface },
  sheet: { flex: 1, marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 30, shadowOffset: { width: 0, height: -10 }, elevation: 8 },
  sheetIn: { paddingTop: 14, paddingHorizontal: 14, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipOn: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 10, borderRadius: 999, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.selectedSoft },
  chipOnText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  chipAdd: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface },
  chipAddText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary },
  retryText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  relaxed: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.accentSoft, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.bold, color: colors.accentInk },
  count: { marginTop: 2, fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  result: { flexDirection: 'row', alignItems: 'stretch', gap: 12, padding: 8, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  resultPhoto: { width: 88, minHeight: 88, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  offer: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.accent },
  offerText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  resultBody: { flex: 1, minWidth: 0, gap: 3, justifyContent: 'center' },
  resultName: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  resultSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  why: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  statusText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold },
  note: { fontSize: 12, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.faint },
  none: { gap: spacing.sm, padding: 14, borderRadius: 16, backgroundColor: colors.bg },
  noneTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
