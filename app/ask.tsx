import { Ionicons } from '@/components/Icon';
import { RememberSize } from '@/components/ai/RememberSize';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { askApi, type AskFilters, type AskQuota, type AskResponse } from '@/api/ask';
import { ApiError } from '@/api/client';
import { categoriesApi } from '@/api/endpoints';
import { discoveryApi } from '@/api/offers';
import type { DiscoveryItem } from '@/api/types';
import { Chispa } from '@/components/ai/Chispa';
import { HoldToTalk } from '@/components/ai/HoldToTalk';
import { Avatar } from '@/components/Avatar';
import { TypeIn } from '@/components/chat/EmpreVoice';
import { EmpreSymbol } from '@/components/EmpreSymbol';
import { FilterRow, FiltersSheet } from '@/components/search/SearchFilters';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { speechAvailable, startDictation } from '@/ledger/speech';
import { areaAround, familyFor, noneTitle, pickAlternatives } from '@/lib/askAlternatives';
import { hourIdeas, howFar, suggestionAction } from '@/lib/askChips';
import { buildGroups, groupIdOf } from '@/lib/categoryGroups';
import { activeCount, answerLead, applyFilters, fromAsk, NO_FILTERS as NO_SEARCH, orderLabel, toAsk, type FilterCaps, type SearchFilters } from '@/lib/searchFilters';
import { hourCO } from '@/lib/finance';
import { isRecommendAsk, pickRecommendations, recommendLead } from '@/lib/recommend';
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
  // Lo dicho por voz se muestra con lo entendido antes de buscar (tablero «Para el cliente», teléfono 2): «Buscar así» o «Corregir».
  const [heard, setHeard] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const seq = useRef(0);
  const started = useRef(false);
  // La conversación (2026-11-22): las preguntas anteriores quedan arriba, como en un chat; la última, con sus resultados.
  const [history, setHistory] = useState<{ q: string; reply: string }[]>([]);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const holdText = useRef('');
  const released = useRef(false);

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 10 * 60_000 });
  // Un solo buscador (3.66): lo que el servidor filtra (abierto, oferta, domicilio, más barato) va en `filters`; lo que
  // se filtra aquí con lo que ya llegó (a pie, verificado, tipo) va en `local`.
  const [local, setLocal] = useState<SearchFilters>(NO_SEARCH);
  // Pidió una recomendación sin decir de qué (3.67).
  const [rec, setRec] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Cinco resultados de entrada y «Ver más» (2026-11-25): una lista larga no se lee; el mapa sí los muestra todos.
  const [allResults, setAllResults] = useState(false);
  useEffect(() => setAllResults(false), [answer]);
  // Qué botón acompaña el error: reintentar, iniciar sesión o ninguno (cupo del mes lleno).
  const [errorKind, setErrorKind] = useState<'generic' | 'login' | 'quota'>('generic');
  const groups = useMemo(() => buildGroups(categories.data ?? []), [categories.data]);

  const run = async (q: string, nextFilters: AskFilters) => {
    const clean = q.trim();
    if (!clean) return;
    setErrorKind('generic');
    setVoiceNote(null);
    // Una pregunta nueva: la anterior pasa a la conversación de arriba (cambiar un filtro no cuenta como nueva).
    if (question && clean !== question && (answer || rec)) {
      const prev = question;
      const reply = answer?.reply ?? 'Te recomendé lo que hay cerca.';
      setHistory((h) => [...h.slice(-9), { q: prev, reply }]);
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    // «¿Me recomiendas algún negocio?» (3.67): no se busca la palabra «negocio»; Empre AI recomienda de lo cercano.
    if (isRecommendAsk(clean)) {
      seq.current += 1;
      setText(clean);
      setEditing(false);
      setQuestion(clean);
      setAnswer(null);
      setError(null);
      setLoading(false);
      setRec(clean);
      setRecents((list) => addRecent(list, clean));
      return;
    }
    setRec(null);
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
    } catch (e) {
      if (id !== seq.current) return;
      if (e instanceof ApiError && e.status === 401) {
        setErrorKind('login');
        setError('Inicia sesión para preguntarle a Empre. Es gratis y tienes 10 preguntas al mes.');
      } else if (e instanceof ApiError && e.status === 429 && /pregunta/i.test(e.message)) {
        setErrorKind('quota');
        setError(e.message);
      } else {
        setError('No pudimos buscar ahora. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  };

  const toggle = (key: keyof AskFilters) => void run(question, { ...filters, [key]: !filters[key] });
  const searchFilters = fromAsk(filters, local);
  const changeFilters = (next: SearchFilters) => {
    setLocal(next);
    const a = toAsk(next);
    if (a.open_now !== filters.open_now || a.with_offer !== filters.with_offer || a.delivery !== filters.delivery || a.cheapest !== filters.cheapest) void run(question, a);
  };

  const clear = () => {
    seq.current += 1;
    setText('');
    setQuestion('');
    setAnswer(null);
    setError(null);
    setLoading(false);
    setFilters(NO_FILTERS);
    setLocal(NO_SEARCH);
    setRec(null);
    setEditing(true);
  };

  /** Termina lo dicho: si hay texto, busca. Se llama una sola vez por toma (al soltar o cuando el teléfono deja de oír). */
  const finishHold = () => {
    const t = holdText.current.trim();
    holdText.current = '';
    if (t) void run(t, liveParse(t).searchFilters);
  };

  /** Empieza a escuchar. `autoSubmit`: busca sola cuando el teléfono deja de oír (al abrir desde «Hablar con Empre AI»). */
  const startHold = async (autoSubmit = false) => {
    if (listening) return;
    holdText.current = '';
    released.current = autoSubmit;
    setVoiceNote(null);
    setListening(true);
    setText('');
    setEditing(true);
    stopRef.current = await startDictation(
      {
        onText: (t, isFinal) => {
          holdText.current = t;
          setText(t);
          if (isFinal && released.current) finishHold();
        },
        onEnd: () => {
          setListening(false);
          finishHold();
        },
        onError: (message, code) => {
          setListening(false);
          if (code !== 'no-speech' && code !== 'speech-timeout') setVoiceNote(message);
          else if (!holdText.current) setVoiceNote('No te escuché. Mantén presionado mientras hablas.');
        },
      },
      [],
    );
    if (!stopRef.current) setListening(false);
  };

  /** Soltó el botón: deja de escuchar y busca lo dicho. */
  const endHold = () => {
    released.current = true;
    stopRef.current?.();
  };


  useEffect(() => {
    void loadRecents().then((saved) => setRecents((now) => (now.length ? now : saved)));
    if (started.current) return;
    // La búsqueda que llega por parámetro arranca después de pintar (no dentro del efecto: evita renders en cascada).
    const t = setTimeout(() => {
      started.current = true;
      if (typeof params.q === 'string' && params.q.trim()) void run(params.q, NO_FILTERS);
      else if (params.voice === '1' && speechAvailable()) void startHold(true);
    }, 0);
    return () => clearTimeout(t);
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
  const showResults = !editing && (loading || Boolean(answer) || Boolean(error) || Boolean(rec));
  const recQuery = useQuery({
    queryKey: ['ask-recommend', coords?.latitude.toFixed(2), coords?.longitude.toFixed(2)],
    queryFn: () => discoveryApi.discover({ ...(coords ? { ...areaAround(coords.latitude, coords.longitude), lat: coords.latitude, long: coords.longitude } : {}), limit: 60 }),
    enabled: Boolean(rec),
    staleTime: 60_000,
  });
  const recs = useMemo(
    () => pickRecommendations((recQuery.data?.items ?? []).map((i) => ({ ...i, is_open_now: Boolean(i.is_open_now), active_offer_title: i.active_offer?.title }))),
    [recQuery.data],
  );
  const catHits = typed ? (categories.data ?? []).filter((c) => plain(c.name).includes(typed)).slice(0, 5) : [];
  const recentHits = typed ? recents.filter((r) => plain(r).includes(typed) && plain(r) !== typed).slice(0, 3) : recents;

  const caps: FilterCaps = { rating: false, cheap: true, distance: Boolean(coords) };
  const biz = applyFilters(answer?.businesses ?? [], searchFilters, (b) => ({
    open: b.has_hours ? b.is_open_now : null,
    meters: coords ? b.distance_km * 1000 : null,
    offer: b.has_active_offer,
    delivery: b.delivery,
    verified: b.is_verified,
    group: groupIdOf(b.category_id, groups) ?? null,
    price: b.item?.price ?? null,
  }));
  const filtersOn = activeCount(searchFilters) > 0;
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
  const ideas = isNone || rec ? hourIdeas(hourCO(new Date().toISOString())) : [];
  const onMap = (rec ? recs.map((r) => placeFrom(r.place)) : biz.length ? (biz as AskPlace[]) : [...alts.offers, ...alts.rest]).filter((b) => b.latitude && b.longitude);
  const region = regionFor(onMap, coords);
  // Empre AI dice cuántos hay y cuántos están abiertos; el orden va aparte, en una línea suave.
  const lead = answerLead(biz.length, biz.filter((b) => b.has_hours && b.is_open_now).length);
  const order = orderLabel(searchFilters, caps);
  const nextSuggestions = (answer?.suggestions ?? []).filter((x) => { const k = suggestionAction(x).kind; return k !== 'map' && k !== 'filter'; }).slice(0, 2);

  const voiceOK = speechAvailable();
  const send = () => void run(text, liveParse(text).searchFilters);
  const newChat = () => {
    clear();
    setHistory([]);
  };
  // Abajo, siempre a la mano (2026-11-22): lo que se escribe y el micrófono de mantener presionado.
  const dock = (
    <View style={[styles.dock, { paddingBottom: insets.bottom + 10 }]}>
      <Text style={styles.dockHint} accessibilityLiveRegion="polite">
        {voiceNote ?? (listening ? 'Te escucho… suelta para buscar' : voiceOK ? 'Mantén presionado el micrófono para hablar y suéltalo para buscar' : 'Escribe lo que necesitas, como se lo dirías a un vecino')}
      </Text>
      <View style={styles.dockRow}>
        <View style={styles.dockField}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setEditing(true);
            }}
            placeholder={listening ? 'Te escucho…' : '¿Qué necesitas?'}
            placeholderTextColor={colors.faint}
            style={styles.dockInput}
            returnKeyType="search"
            onSubmitEditing={send}
            maxLength={200}
            autoCorrect={false}
            accessibilityLabel="Escribe lo que necesitas"
            autoFocus={params.voice !== '1' && !params.q}
          />
          {text.trim() && !listening ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Buscar" onPress={send} style={styles.sendBtn}>
              <Ionicons name="arrow-up" size={18} color={colors.onPrimary} />
            </Pressable>
          ) : null}
        </View>
        <HoldToTalk listening={listening} available={voiceOK} onStart={() => void startHold(false)} onRelease={endHold} onUnavailable={() => inputRef.current?.focus()} />
      </View>
    </View>
  );
  const chatHeader = (
    <View style={[styles.chatHeader, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>
      <EmpreSymbol size={28} animated={false} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.chatTitle}>Empre AI</Text>
        <Text style={styles.chatSub} numberOfLines={1}>
          Lo que necesitas, cerca de ti
        </Text>
      </View>
      {question || history.length ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Nueva conversación" onPress={newChat} style={styles.back}>
          <Ionicons name="create-outline" size={20} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
  // Las preguntas de antes, como burbujas: la tuya a la derecha en rojo y la respuesta de Empre AI a la izquierda.
  const thread = (
    <>
      {history.map((h, i) => (
        <View key={`h-${i}`} style={styles.turn}>
          <View style={styles.youBubble}>
            <Text style={styles.youText}>{h.q}</Text>
          </View>
          <View style={styles.aiBubble}>
            <Chispa size={16} mood="responde" />
            <Text style={styles.aiText}>{h.reply}</Text>
          </View>
        </View>
      ))}
      {question && !editing ? (
        <View style={styles.youBubble}>
          <Text style={styles.youText}>{question}</Text>
        </View>
      ) : null}
    </>
  );

  if (showResults) {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {chatHeader}
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.chatBody} keyboardShouldPersistTaps="handled">
          {thread}
          {rec ? (
            <View style={styles.group} accessibilityLiveRegion="polite">
              <View style={styles.recHead}>
                <Chispa size={20} mood={recQuery.isLoading ? 'pensando' : 'responde'} animated={recQuery.isLoading} />
                <Text style={styles.recName}>{recQuery.isLoading ? 'Mirando qué hay cerca de ti…' : 'Empre AI'}</Text>
              </View>
              {recQuery.isLoading ? null : (
                <>
                  <TypeIn parts={[{ t: recommendLead(recs) }]} play style={[styles.recLead, styles.aiIndent]} />
                  {recs.map((r, i) => {
                    const b = placeFrom(r.place);
                    return (
                      <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${b.name}. ${r.reasons.join(', ')}`} onPress={() => setCard(b)} style={({ pressed }) => [styles.recRow, pressed && styles.pressed]}>
                        <View style={[styles.recIcon, { backgroundColor: photoTone(i) }]}>
                          <Ionicons name={displayIcon(b.category_icon) as keyof typeof Ionicons.glyphMap} size={22} color="#fff" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.resultName} numberOfLines={1}>
                            {b.name}
                          </Text>
                          <Text style={styles.resultSub} numberOfLines={1}>
                            {b.category_name}
                          </Text>
                          <Text style={styles.recWhy} numberOfLines={2}>
                            {r.reasons.join(' · ')}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                      </Pressable>
                    );
                  })}
                  <SourceLine names={recs.map((r) => ({ name: r.place.name, uri: r.place.profile_url }))} extra="abiertos, cerca y con oferta" />
                  <Text style={styles.altHead}>¿Algo en especial?</Text>
                  <View style={styles.chips}>
                    {ideas.map((idea) => (
                      <Pressable key={idea.ask} accessibilityRole="button" onPress={() => void run(idea.ask, NO_FILTERS)} style={({ pressed }) => [styles.chipAdd, pressed && styles.pressed]}>
                        <Text style={styles.chipAddText}>{idea.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          ) : (
          <>
          <View style={styles.filterBleed}>
            <FilterRow value={searchFilters} onChange={changeFilters} caps={caps} groupName={groups.find((g) => g.id === searchFilters.group)?.name} onOpenSheet={() => setSheetOpen(true)} />
          </View>
          {loading ? (
            // Mientras busca: la Chispa gira y una línea dice qué hace (como en el chat)
            <View style={styles.recHead} accessibilityLiveRegion="polite">
              <Chispa size={20} mood="pensando" animated />
              <Text style={styles.recName}>Buscando cerca de ti…</Text>
            </View>
          ) : error ? (
            <View style={styles.group} accessibilityLiveRegion="polite">
              <Text style={styles.hint}>{error}</Text>
              {errorKind === 'login' ? (
                <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/login')} style={styles.retry}>
                  <Text style={styles.retryText}>Iniciar sesión</Text>
                </Pressable>
              ) : errorKind === 'generic' ? (
                <Pressable accessibilityRole="button" onPress={() => void run(question, filters)} style={styles.retry}>
                  <Text style={styles.retryText}>Reintentar</Text>
                </Pressable>
              ) : null}
            </View>
          ) : answer ? (
            <>
              {answer.quota ? <Text style={styles.relaxed}>{quotaLine(answer.quota)}</Text> : null}
              {answer.widened ? (
                <Text style={styles.relaxed}>No había nada muy cerca, así que busqué más lejos.</Text>
              ) : null}
              {biz.length ? (
                <>
                  {/* Empre AI: la frase con el dato en negrita y, debajo, el orden */}
                  <View style={styles.aiSays} accessibilityLiveRegion="polite">
                    <View style={styles.recHead}>
                      <Chispa size={20} mood="responde" />
                      <Text style={styles.recName}>Empre AI</Text>
                    </View>
                    <TypeIn parts={lead} play style={[styles.recLead, styles.aiIndent]} boldStyle={styles.leadBold} />
                    {order ? <Text style={[styles.orderText, styles.aiIndent]}>{order}</Text> : null}
                  </View>
                  {biz.slice(0, allResults ? biz.length : FIRST_RESULTS).map((b, i) => {
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
                  {!allResults && biz.length > FIRST_RESULTS ? <MoreButton count={biz.length - FIRST_RESULTS} onPress={() => setAllResults(true)} /> : null}
                  <SourceLine names={biz.map((b) => ({ name: b.name, uri: b.profile_url }))} />
                  {nextSuggestions.length && answer ? (
                    <View style={styles.chips}>
                      {nextSuggestions.map((x) => (
                        <Pressable key={x} accessibilityRole="button" onPress={() => onSuggestion(x, answer)} hitSlop={4} style={({ pressed }) => [styles.nextChip, pressed && styles.pressed]}>
                          <Text style={styles.nextText}>{x}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <View style={styles.none} accessibilityLiveRegion="polite">
                    <Text style={styles.noneTitle}>{noneTitle(asked, family)}</Text>
                    <Text style={styles.hint}>{hasAlts && family ? `Pero hay esto parecido. No son ${family.plural}.` : filtersOn ? 'Prueba quitando un filtro.' : 'Todavía no hay nada parecido en Empre.'}</Text>
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
                      {alts.rest.slice(0, allResults ? alts.rest.length : FIRST_RESULTS).map((b, i) => (
                        <ResultRow key={b.id} b={b} tone={i + alts.offers.length} onOpen={() => setCard(b)} />
                      ))}
                      {!allResults && alts.rest.length > FIRST_RESULTS ? <MoreButton count={alts.rest.length - FIRST_RESULTS} onPress={() => setAllResults(true)} /> : null}
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
          </>
          )}
          {region && onMap.length ? (
            <View style={styles.mapCard}>
            <MapView key={onMap.map((b) => b.id).join('|')} style={StyleSheet.absoluteFill} initialRegion={region} showsUserLocation={Boolean(coords)} showsPointsOfInterests={false} customMapStyle={MAP_STYLE} toolbarEnabled={false} rotateEnabled={false} pitchEnabled={false}>
              {onMap.map((b) => (
                <Marker key={b.id} coordinate={{ latitude: b.latitude, longitude: b.longitude }} accessibilityLabel={`${b.name}, resultado`} onPress={() => setCard(b)} tracksViewChanges={false}>
                  <View style={[styles.pinRing, b.has_active_offer && styles.pinRingOffer]}>
                    <View style={styles.pin}>
                      <Ionicons name={displayIcon(b.category_icon) as keyof typeof Ionicons.glyphMap} size={18} color={colors.ink} />
                    </View>
                    <View style={[styles.pinDot, { backgroundColor: b.is_open_now ? '#D42020' : colors.placeholder }]} />
                  </View>
                </Marker>
              ))}
            </MapView>
            </View>
          ) : null}
        </ScrollView>
        {dock}

        <BusinessCardModal entity={card ? ({ ...card, distance_meters: card.distance_km * 1000, distanceKm: card.distance_km } as unknown as WithDistance) : null} onClose={() => setCard(null)} origin="ask" />
        <FiltersSheet
          visible={sheetOpen}
          value={searchFilters}
          onChange={changeFilters}
          onClose={() => setSheetOpen(false)}
          caps={caps}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          resultCount={biz.length}
        />
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {chatHeader}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.chatBody} keyboardShouldPersistTaps="handled">
        {thread}
        {!typed && !listening && !history.length ? (
          <View style={styles.hello}>
            <Chispa size={44} mood="responde" />
            <Text style={styles.helloTitle}>¿Qué necesitas?</Text>
            <Text style={styles.helloSub}>Pídelo como se lo dirías a un vecino: «una droguería abierta», «almuerzo barato cerca».</Text>
            <View style={styles.chips}>
              {hourIdeas(hourCO(new Date().toISOString())).map((idea) => (
                <Pressable key={idea.ask} accessibilityRole="button" onPress={() => void run(idea.ask, NO_FILTERS)} style={({ pressed }) => [styles.chipAdd, pressed && styles.pressed]}>
                  <Text style={styles.chipAddText}>{idea.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {question ? <RememberSize text={question} /> : null}
        {listening || hasLiveFilters || heard ? (
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
            {heard && !listening && text.trim() ? (
              <View style={styles.heardRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setHeard(false);
                    void run(text, liveParse(text).searchFilters);
                  }}
                  style={styles.heardGo}
                >
                  <Text style={styles.heardGoText}>Buscar así</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setHeard(false);
                    setEditing(true);
                  }}
                  style={styles.heardFix}
                >
                  <Text style={styles.heardFixText}>Corregir</Text>
                </Pressable>
              </View>
            ) : null}
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
      {dock}
    </KeyboardAvoidingView>
  );
}

/** Lo que escribiste, en negrita dentro del nombre. */
const FIRST_RESULTS = 5;

/** «Ver 3 más»: el resto de los resultados, en la misma lista. */
function MoreButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}>
      <Text style={styles.moreText}>{count === 1 ? 'Ver 1 más' : `Ver ${count} más`}</Text>
      <Ionicons name="chevron-down" size={16} color={colors.ink} />
    </Pressable>
  );
}

/** De dónde salió (tablero «Cada cifra con su porqué»): las caras de los negocios que leyó y cuántos. Nadie paga por salir. */
function SourceLine({ names, extra }: { names: { name: string; uri?: string | null }[]; extra?: string }) {
  if (!names.length) return null;
  const who = names.length === 1 ? names[0].name : `${names.length} negocios`;
  return (
    <View style={styles.srcRow} accessible accessibilityLabel={`De lo publicado por ${who}. Nadie paga por salir arriba.`}>
      <View style={{ flexDirection: 'row' }}>
        {names.slice(0, 3).map((n, i) => (
          <View key={`${n.name}-${i}`} style={[styles.srcFace, i > 0 && { marginLeft: -6 }]}>
            <Avatar uri={n.uri ?? undefined} name={n.name} size={18} />
          </View>
        ))}
      </View>
      <Text style={styles.srcText} numberOfLines={2}>
        {`De lo publicado por ${who}${extra ? ` · ${extra}` : ''} · nadie paga por salir arriba`}
      </Text>
    </View>
  );
}

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
  moreBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  moreText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 10, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  chatTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  chatSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  chatBody: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 12 },
  turn: { gap: 8 },
  youBubble: { alignSelf: 'flex-end', maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: 6, backgroundColor: colors.primary },
  youText: { fontSize: 15, lineHeight: 21, fontFamily: fonts.ui.semibold, color: colors.onPrimary },
  aiBubble: { alignSelf: 'flex-start', maxWidth: '90%', flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomLeftRadius: 6, backgroundColor: colors.well },
  aiText: { flexShrink: 1, fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.ink },
  hello: { alignItems: 'center', gap: 10, paddingTop: 24, paddingHorizontal: 8 },
  helloTitle: { fontSize: 24, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  helloSub: { fontSize: 14.5, lineHeight: 21, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', marginBottom: 6 },
  mapCard: { height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.well },
  dock: { paddingHorizontal: 12, paddingTop: 8, gap: 6, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.hairline },
  dockHint: { fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  dockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dockField: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 6, borderRadius: 24, backgroundColor: colors.well, borderWidth: 1, borderColor: colors.line },
  dockInput: { flex: 1, minWidth: 0, fontSize: 15.5, fontFamily: fonts.ui.medium, color: colors.ink, paddingVertical: 10 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  heardRow: { flexDirection: 'row', gap: 8 },
  heardGo: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandRef },
  heardGoText: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  heardFix: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line },
  heardFixText: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  altGroup: { gap: 8 },
  altHead: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  ideas: { flexDirection: 'row', gap: 8 },
  idea: { flex: 1, minWidth: 0, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, borderRadius: 16, backgroundColor: colors.well },
  ideaText: { fontSize: 12.5, textAlign: 'center', fontFamily: fonts.ui.extrabold, color: colors.ink },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D42020' },
  screen: { flex: 1, backgroundColor: colors.bg },
  pressed: { opacity: 0.8 },
  // Escribiendo
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8, borderRadius: 24, backgroundColor: colors.well, borderWidth: 2, borderColor: colors.ink },
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
  sheetIn: { paddingTop: 14, paddingHorizontal: 16, gap: 12 },
  filterBleed: { marginHorizontal: -14 },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  recName: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  recLead: { fontSize: 15.5, lineHeight: 22, fontFamily: fonts.ui.semibold, color: colors.ink },
  leadBold: { fontFamily: fonts.ui.extrabold },
  aiSays: { gap: 4 },
  aiIndent: { marginLeft: 27 },
  orderText: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  srcFace: { borderRadius: 11, borderWidth: 1.5, borderColor: colors.bg },
  srcText: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.semibold, color: colors.muted },
  nextChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  nextText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  recRow: { minHeight: 72, padding: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, flexDirection: 'row', alignItems: 'center', gap: 12 },
  recIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recWhy: { marginTop: 2, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipOn: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 10, borderRadius: 999, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primary },
  chipOnText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.onPrimary},
  chipAdd: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface },
  chipAddText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandRef },
  retryText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
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
  none: { gap: spacing.sm, padding: 14, borderRadius: 16, backgroundColor: colors.well },
  noneTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});

/** «Te quedan 7 de 10 preguntas este mes». */
function quotaLine(q: AskQuota): string {
  const left = Math.max(0, q.limit - q.used);
  return `Te ${left === 1 ? 'queda 1 pregunta' : `quedan ${left} preguntas`} de ${q.limit} este mes.`;
}
