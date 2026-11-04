import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { askApi, type AskFilters, type AskResponse } from '@/api/ask';
import { Avatar } from '@/components/Avatar';
import { BusinessCardModal } from '@/components/explore/BusinessCardModal';
import type { WithDistance } from '@/components/explore/FeaturedCard';
import { Figure } from '@/components/figures/Figure';
import { speechAvailable, startDictation } from '@/ledger/speech';
import { filterChips, howFar, QUICK_ASKS, suggestionAction } from '@/lib/askChips';
import { formatPesos } from '@/lib/catalog';
import { useCoords } from '@/lib/useCoords';
import { cardShadow, colors, fonts, radius, spacing } from '@/theme';

const NO_FILTERS: AskFilters = { open_now: false, with_offer: false, delivery: false, cheapest: false };

interface Turn {
  id: number;
  question: string;
  filters: AskFilters;
  answer?: AskResponse;
  error?: string;
}

/**
 * «Pregúntale a Empre» (lienzo B2–B4, B11, B12): el cliente escribe o dice lo que necesita y la respuesta son
 * negocios reales cerca, con lo que coincide de lo que venden y su precio. Las condiciones se apilan con un toque
 * (abierto, con oferta, a domicilio, lo más barato) y se quitan igual. «Verlos en el mapa» abre el mapa con la búsqueda.
 */
export default function AskScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const coords = useCoords();
  const params = useLocalSearchParams<{ q?: string; voice?: string }>();
  const [text, setText] = useState('');
  const [card, setCard] = useState<AskResponse['businesses'][number] | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const scroll = useRef<ScrollView>(null);
  const seq = useRef(0);
  const started = useRef(false);

  const run = async (question: string, filters: AskFilters) => {
    const q = question.trim();
    if (!q) return;
    const id = ++seq.current;
    setTurns((prev) => [...prev, { id, question: q, filters }]);
    try {
      const answer = await askApi.ask({
        q,
        ...(coords ? { lat: coords.latitude, long: coords.longitude } : {}),
        open: filters.open_now,
        offer: filters.with_offer,
        delivery: filters.delivery,
        cheap: filters.cheapest,
      });
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, answer } : t)));
    } catch {
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, error: 'No pudimos buscar ahora. Revisa tu conexión e inténtalo de nuevo.' } : t)));
    }
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
  };

  const last = turns[turns.length - 1];
  const lastFilters = last?.answer?.filters ?? last?.filters ?? NO_FILTERS;

  const send = (q = text) => {
    setText('');
    void run(q, NO_FILTERS);
  };

  // Rehacer la última búsqueda con una condición más o una menos.
  const toggle = (key: keyof AskFilters) => {
    if (!last) return;
    void run(last.answer?.terms || last.question, { ...lastFilters, [key]: !lastFilters[key] });
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
            send(t);
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
    if (started.current) return;
    started.current = true;
    if (typeof params.q === 'string' && params.q.trim()) void run(params.q, NO_FILTERS);
    else if (params.voice === '1' && speechAvailable()) void listen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  const onSuggestion = (label: string, answer: AskResponse) => {
    const a = suggestionAction(label);
    if (a.kind === 'filter') toggle(a.filter);
    else if (a.kind === 'map') router.push({ pathname: '/map', params: { q: answer.terms } });
    else if (a.kind === 'categories') router.push('/categories');
    else send(a.text);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.round}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.spark}>
          <Ionicons name="sparkles" size={17} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Pregúntale a Empre</Text>
          <Text style={styles.sub}>Te contesto con negocios reales cerca</Text>
        </View>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
        {turns.length === 0 ? (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.hint}>Escribe o di lo que necesitas: «almuerzo barato cerca», «una droguería abierta», «arreglar el celular».</Text>
            <View style={styles.chips}>
              {QUICK_ASKS.map((q) => (
                <Pressable key={q} accessibilityRole="button" onPress={() => send(q)} style={styles.chip}>
                  <Text style={styles.chipText}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {turns.map((t) => (
          <View key={t.id} style={{ gap: spacing.sm }}>
            <View style={styles.me}>
              <Text style={styles.meText}>{t.question}</Text>
            </View>
            {filterChips(t.filters).length ? <Text style={styles.with}>Con: {filterChips(t.filters).map((c) => c.label).join(', ')}</Text> : null}
            {t.error ? (
              <View style={styles.em}>
                <Text style={styles.emText}>{t.error}</Text>
              </View>
            ) : !t.answer ? (
              <View style={[styles.em, { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }]}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.emText}>Buscando cerca de ti…</Text>
              </View>
            ) : (
              <Answer answer={t.answer} active={t.id === last?.id} onOpen={setCard}
                onItem={(entityId, itemId) => router.push({ pathname: '/business/product', params: { entityId, itemId } })}
                onSuggestion={(s) => onSuggestion(s, t.answer!)} onRemove={toggle} />
            )}
          </View>
        ))}
      </ScrollView>

      <BusinessCardModal
        entity={
          card
            ? ({ ...card, distance_meters: card.distance_km * 1000, distanceKm: card.distance_km } as unknown as WithDistance)
            : null
        }
        onClose={() => setCard(null)}
        origin="ask"
      />

      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={listening ? 'Te escucho…' : 'Pregunta lo que necesites…'}
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={() => send()}
          maxLength={200}
          autoFocus={turns.length === 0 && params.voice !== '1' && !params.q}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text.trim() ? 'Preguntar' : listening ? 'Dejar de escuchar' : 'Preguntar hablando'}
          onPress={() => (text.trim() ? send() : void listen())}
          style={[styles.send, listening && styles.sendOn]}
        >
          <Ionicons name={text.trim() ? 'arrow-up' : listening ? 'stop' : 'mic'} size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Answer({
  answer,
  active,
  onOpen,
  onItem,
  onSuggestion,
  onRemove,
}: {
  answer: AskResponse;
  active: boolean;
  onOpen: (b: AskResponse['businesses'][number]) => void;
  onItem: (entityId: string, itemId: string) => void;
  onSuggestion: (label: string) => void;
  onRemove: (key: keyof AskFilters) => void;
}) {
  const chips = filterChips(answer.filters);
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.em}>
        <Text style={styles.emText}>{answer.reply}</Text>
      </View>
      {active && chips.length ? (
        <View style={styles.chips}>
          {chips.map((c) => (
            <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={`Quitar ${c.label}`} onPress={() => onRemove(c.key)} style={[styles.chip, styles.chipOn]}>
              <Text style={[styles.chipText, { color: colors.selected }]}>{c.label} ×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {answer.businesses.length ? (
        <View style={styles.card}>
          {answer.businesses.slice(0, 6).map((b, i) => (
            <Pressable key={b.id} accessibilityRole="button" onPress={() => onOpen(b)} style={[styles.row, i > 0 && styles.rowLine]}>
              <Avatar uri={b.profile_url} name={b.name} size={52} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {[b.category_name, howFar(b.minutes, b.distance_km), b.has_hours ? (b.is_open_now ? 'abierto' : 'cerrado') : null, b.delivery ? 'domicilio' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {b.item ? (
                  <Pressable accessibilityRole="link" onPress={() => onItem(b.id, b.item!.id)} hitSlop={6}>
                    <Text style={styles.item} numberOfLines={1}>
                      {b.item.name}
                      {b.item.price != null ? ` · ${b.item.price_from ? 'desde ' : ''}${formatPesos(b.item.price)}` : ''}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {b.has_active_offer ? (
                <View style={styles.offer}>
                  <Text style={styles.offerText}>Oferta</Text>
                </View>
              ) : (
                <Figure name={b.category_name} size={34} fallbackIcon={b.category_icon} />
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
      {active && answer.suggestions.length ? (
        <View style={styles.chips}>
          {answer.suggestions.map((s) => (
            <Pressable key={s} accessibilityRole="button" onPress={() => onSuggestion(s)} style={styles.chip}>
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {active ? <Text style={styles.note}>Armado con los precios y horarios que publicaron los negocios.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...cardShadow },
  spark: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  sub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  thread: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  hint: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.muted, lineHeight: 22 },
  me: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: colors.primary, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 11 },
  meText: { fontSize: 15, fontFamily: fonts.ui.bold, color: '#fff' },
  with: { alignSelf: 'flex-end', fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  em: { alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: colors.surface, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 11, ...cardShadow },
  emText: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.selectedSoft, borderColor: colors.selected },
  chipText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  card: { borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: spacing.md, ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  rowName: { fontSize: 15.5, fontFamily: fonts.display.bold, color: colors.ink },
  rowSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, marginTop: 2 },
  item: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink, marginTop: 4, textDecorationLine: 'underline' },
  offer: { paddingHorizontal: 9, height: 24, borderRadius: 12, backgroundColor: colors.accent, justifyContent: 'center' },
  offerText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  note: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  input: { flex: 1, height: 50, borderRadius: 25, backgroundColor: '#EEF2F7', paddingHorizontal: 18, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  send: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendOn: { backgroundColor: colors.ink },
});
