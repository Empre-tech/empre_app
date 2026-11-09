import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/analytics/track';
import { agendaApi } from '@/api/agenda';
import { catalogApi } from '@/api/catalog';
import { answersApi } from '@/api/answers';
import { chatApi, entitiesApi } from '@/api/endpoints';
import { offersApi, statusApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Cover } from '@/components/Cover';
import { Chispa, type ChispaMood } from '@/components/ai/Chispa';
import { AskManySheet } from '@/components/offers/AskManySheet';
import { FEATURES } from '@/config';
import {
  answer,
  detectIntent,
  followUps,
  priceLabel,
  suggestQuestions,
  type Answer,
  type AnswerData,
  type Block,
  type Intent,
} from '@/lib/answers';
import { sameItemPeers } from '@/lib/askMany';
import { askMessage, catalogCopy, formatPesos } from '@/lib/catalog';
import { chatItemParam } from '@/lib/chatItem';
import { displayIcon } from '@/lib/mapView';
import { formatEndsWhen } from '@/lib/offer';
import { distanceLabel, itemStatusBadge, priceView, type MarketItem } from '@/lib/offerMarket';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { colors, fonts, softShadow } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Props {
  item: MarketItem | null;
  onClose: () => void;
  /** La Vitrina ya cargada: de aquí salen los otros negocios que ofrecen lo mismo («Pregúntales a los N», 3.64). */
  pool?: MarketItem[];
}

/**
 * Ficha rápida interactiva de Vitrina (inspirada en el modal de catálogo Swiggy + Empre AI):
 * - Muestra foto grande, anclaje de precio, duración y si el servicio tiene una oferta activa en el negocio.
 * - Integra «Pregúntale a Empre AI» para responder al instante con lo que publicó el negocio.
 * - Permite escribirle directo al negocio adjuntando la tarjeta del producto/servicio o reclamar la oferta.
 */
export function MarketItemSheet({ item, onClose, pool = [] }: Props) {
  const reduce = useReduceMotion();
  return (
    <Modal visible={item !== null} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
      {item !== null ? <SheetContent key={item.id} item={item} onClose={onClose} pool={pool} /> : null}
    </Modal>
  );
}

function SheetContent({ item, onClose, pool }: { item: MarketItem; onClose: () => void; pool: MarketItem[] }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const { status } = useAuth();
  const entityId = item.entity_id;

  const entityQuery = useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => entitiesApi.get(entityId),
    enabled: Boolean(entityId),
    staleTime: 60_000,
  });
  const catalogQuery = useQuery({
    queryKey: ['catalog', entityId],
    queryFn: () => catalogApi.list(entityId),
    enabled: Boolean(entityId),
    staleTime: 60_000,
  });
  const activeOffersQuery = useQuery({
    queryKey: ['offers-active', entityId],
    queryFn: () => offersApi.activeList(entityId),
    enabled: Boolean(entityId),
    staleTime: 60_000,
  });
  const bizStatusQuery = useQuery({
    queryKey: ['status', entityId],
    queryFn: () => statusApi.get(entityId),
    enabled: Boolean(entityId),
    staleTime: 60_000,
  });
  const agendaQuery = useQuery({
    queryKey: ['agenda-summary', entityId],
    queryFn: () => agendaApi.summary(entityId),
    enabled: FEATURES.agenda && status === 'signedIn' && Boolean(entityId),
    staleTime: 30_000,
  });

  const taughtQuery = useQuery({
    queryKey: ['business-answers', entityId],
    queryFn: () => answersApi.list(entityId),
    enabled: Boolean(entityId),
    staleTime: 60_000,
  });

  const biz = entityQuery.data;
  const catalogItems = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const activeOffers = useMemo(() => activeOffersQuery.data ?? [], [activeOffersQuery.data]);
  const copy = useMemo(() => catalogCopy(biz?.category?.name ?? item.category_name, biz?.business_profile), [biz?.category?.name, item.category_name, biz?.business_profile]);

  const isService = item.kind === 'service';
  const dist = distanceLabel(item.distance_meters);
  const p = priceView(item);
  const badge = itemStatusBadge(item, now);

  // Detectar si este servicio específico está incluido dentro de alguna oferta activa del negocio
  const matchingOffer = useMemo(() => {
    if (!isService) return activeOffers.find((o) => o.id === item.id) ?? activeOffers[0] ?? null;
    const normTitle = item.title.trim().toLowerCase();
    return (
      activeOffers.find((o) =>
        (o.items ?? []).some(
          (it) => (item.service_id && it.service_item_id === item.service_id) || it.name.trim().toLowerCase() === normTitle,
        ),
      ) ??
      (item.linked_offer_id ? activeOffers.find((o) => o.id === item.linked_offer_id) : null) ??
      activeOffers[0] ??
      null
    );
  }, [isService, activeOffers, item.id, item.service_id, item.title, item.linked_offer_id]);

  const serviceInOffer = useMemo(() => {
    if (!isService || !matchingOffer) return false;
    const normTitle = item.title.trim().toLowerCase();
    return (matchingOffer.items ?? []).some(
      (it) => (item.service_id && it.service_item_id === item.service_id) || it.name.trim().toLowerCase() === normTitle,
    );
  }, [isService, matchingOffer, item.service_id, item.title]);

  // Datos reales del negocio para Empre AI («Pregúntale»)
  const answerData = useMemo<AnswerData>(
    () => ({
      name: biz?.name ?? item.entity_name,
      noun: copy.noun,
      services: catalogItems.length
        ? catalogItems.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            section: s.section,
            price: s.price,
            price_from: s.price_from,
            duration_min: s.duration_min,
            bookable: s.bookable,
          }))
        : item.service_price != null
          ? [
              {
                id: item.service_id ?? item.id,
                name: item.title,
                description: item.description,
                section: item.section,
                price: item.service_price ?? null,
                price_from: Boolean(item.price_from),
                duration_min: item.duration_min,
                bookable: item.bookable,
              },
            ]
          : [],
      offers: activeOffers.map((o) => ({
        id: o.id,
        title: o.title,
        conditions: o.conditions,
        ends_at: o.ends_at,
        items: o.items,
      })),
      hours: biz?.hours ?? [],
      isOpenNow: biz?.is_open_now ?? item.open_now ?? null,
      availability: bizStatusQuery.data?.availability ?? null,
      serviceMode: biz?.service_mode ?? '',
      agendaOn: Boolean(agendaQuery.data?.enabled),
      taught: taughtQuery.data?.data ?? [],
    }),
    [biz, item, copy.noun, catalogItems, activeOffers, bizStatusQuery.data?.availability, agendaQuery.data?.enabled, taughtQuery.data?.data],
  );

  // Otros negocios cercanos con el mismo producto: si hay, una pregunta les llega a todos (3.64).
  const peers = useMemo(() => sameItemPeers(item, pool), [item, pool]);
  const [askMany, setAskMany] = useState(false);

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiTurn, setAiTurn] = useState<{ q: string; a: Answer } | null>(null);
  const [asked, setAsked] = useState<Intent[]>([]);
  const [mood, setMood] = useState<ChispaMood>('reposo');
  const [thinking, setThinking] = useState(false);

  // Solo preguntas que se pueden responder con lo publicado (3.67): si no hay ninguna, no se inventan. Después de una
  // respuesta, las que suelen venir.
  const suggested = useMemo(() => {
    const done = new Set(asked);
    return aiTurn ? followUps(answerData, aiTurn.a.intent, done, 3) : suggestQuestions(answerData, done, 4);
  }, [answerData, aiTurn, asked]);

  const reply = (q: string, intent: Intent, serviceId: string | undefined, taughtId: string | undefined, source: 'rule' | 'taught' | 'classify') => {
    // `now` viene de useNow: la hora del minuto basta para horarios y ofertas.
    const res = answer(answerData, intent, { serviceId, taughtId, text: q, weekday: new Date(now).getDay(), now });
    setAiTurn({ q, a: res });
    setAsked((list) => (list.includes(intent) ? list : [...list, intent]));
    setMood(res.unanswered ? 'nosabe' : 'responde');
    track('ai_answer_source', entityId, { intent, source: res.unanswered ? 'owner' : source, businesses: 1 });
  };

  const askQuick = (intent: Intent, label: string) => {
    const targetSvcId = item.service_id ?? (isService ? item.id : undefined);
    reply(label, intent, intent === 'duration' || intent === 'price' || intent === 'book' ? targetSvcId : undefined, undefined, 'rule');
  };

  // Texto libre: reglas y lo enseñado primero (sin costo); si nadie lo entiende, el servidor solo clasifica, una vez.
  const submitCustomQuestion = async () => {
    const clean = aiQuestion.trim();
    if (!clean || thinking) return;
    setAiQuestion('');
    let d = detectIntent(clean, answerData.services, answerData.taught);
    let source: 'rule' | 'taught' | 'classify' = d.taughtId ? 'taught' : 'rule';
    if (d.intent === 'unknown' && status === 'signedIn') {
      setThinking(true);
      setMood('pensando');
      const key = `${entityId}|${clean.toLocaleLowerCase('es')}`;
      const c = classified.has(key) ? classified.get(key) : await chatApi.classify(entityId, clean).catch(() => null);
      if (c) classified.set(key, c);
      setThinking(false);
      if (c && c.intent !== 'unknown') {
        d = { intent: c.intent as Intent, services: [], taughtId: c.answer_id };
        source = 'classify';
      }
    }
    reply(clean, d.intent, d.services.length === 1 ? d.services[0].id : item.service_id, d.taughtId, source);
  };

  const openBusiness = () => {
    onClose();
    router.push({ pathname: '/business/[id]', params: { id: entityId } });
  };

  const openOffer = (offerId: string) => {
    onClose();
    router.push({ pathname: '/offer/[id]', params: { id: offerId, entityId } });
  };

  const openProductOrOffer = () => {
    if (!isService) {
      openOffer(item.id);
      return;
    }
    const svcId = item.service_id || item.id.replace(/^ask-/, '');
    onClose();
    router.push({ pathname: '/business/product', params: { entityId, itemId: svcId } });
  };

  const writeToBusiness = (customDraft?: string) => {
    onClose();
    if (status !== 'signedIn') {
      router.push('/(auth)/login');
      return;
    }
    track('contact_started', entityId);
    const defaultDraft = customDraft || askMessage(copy, item.title);
    const rawPrice = item.special_price ?? item.service_price ?? null;
    const card = chatItemParam({
      id: item.service_id ?? item.id,
      name: item.title,
      price: rawPrice,
      price_from: Boolean(item.price_from),
      ...(item.photo ? { photo: item.photo } : {}),
      ...(item.section ? { section: item.section } : {}),
    });
    router.push({
      pathname: '/chat/[entityId]',
      params: {
        entityId,
        name: biz?.name ?? item.entity_name,
        avatar: biz?.profile_url ?? '',
        draft: defaultDraft,
        item: card,
      },
    });
  };

  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Cerrar vista rápida" onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]} accessibilityViewIsModal>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* HERO FOTO (Inspirado en Referencia 2 Swiggy Card Modal) */}
          <View style={styles.heroWrap}>
            <Cover
              photo={item.photo}
              category={item.category_name}
              icon={item.category_icon}
              iconName={displayIcon(item.category_icon) as IconName}
              iconSize={76}
              style={styles.heroPhoto}
            />
            <View style={styles.heroTopRow}>
              {p.save ? (
                <View style={styles.heroOfferBadge}>
                  <Ionicons name="flame" size={13} color={colors.ink} />
                  <Text style={styles.heroOfferBadgeText}>OFERTA {p.save}</Text>
                </View>
              ) : (
                <View style={styles.heroCatalogBadge}>
                  <Ionicons name="pricetag-outline" size={12} color="#fff" />
                  <Text style={styles.heroCatalogBadgeText}>{item.section || copy.noun}</Text>
                </View>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <View style={styles.heroBottomRow}>
              {biz?.is_open_now ?? item.open_now ? (
                <View style={styles.openBadge}>
                  <View style={styles.openDot} />
                  <Text style={styles.openBadgeText}>Abierto ahora</Text>
                </View>
              ) : null}
              {(biz?.avg_rating ?? item.rating ?? 0) >= 4.0 ? (
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={11} color="#fff" />
                  <Text style={styles.ratingBadgeText}>{(biz?.avg_rating ?? item.rating ?? 0).toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.body}>
            {/* AVISO INTELIGENTE SI EL PRODUCTO/NEGOCIO TIENE OFERTA ACTIVA */}
            {isService && matchingOffer ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ver oferta activa: ${matchingOffer.title}`}
                onPress={() => openOffer(matchingOffer.id)}
                style={({ pressed }) => [styles.offerBanner, pressed && styles.pressed]}
              >
                <View style={styles.offerBannerIcon}>
                  <Ionicons name="flame" size={18} color={colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerBannerTag}>
                    {serviceInOffer ? '¡ESTE SERVICIO ESTÁ EN OFERTA!' : 'ESTE NEGOCIO TIENE UNA OFERTA ACTIVA'}
                  </Text>
                  <Text style={styles.offerBannerTitle} numberOfLines={1}>
                    {matchingOffer.title}
                    {matchingOffer.special_price ? ` · ${formatPesos(matchingOffer.special_price)}` : ''}
                  </Text>
                </View>
                <View style={styles.offerBannerGo}>
                  <Text style={styles.offerBannerGoText}>Ver oferta</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.ink} />
                </View>
              </Pressable>
            ) : null}

            {/* ENCABEZADO DEL PRODUCTO / SERVICIO / OFERTA */}
            <View style={styles.headBlock}>
              <View style={styles.titlePriceRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemCategory}>
                    {[item.category_name, item.section, dist ? `a ${dist}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.priceColumn}>
                  {p.now ? (
                    <View style={[p.was ? styles.promoPriceBox : styles.catalogPriceBox]}>
                      <Text style={styles.priceNow}>{p.now}</Text>
                    </View>
                  ) : (
                    <Text style={styles.consultText}>Consultar</Text>
                  )}
                  {p.was ? <Text style={styles.priceWas}>Antes {p.was}</Text> : null}
                </View>
              </View>

              {/* ATRIBUTOS RÁPIDOS (FAB: Features -> Benefits) */}
              <View style={styles.factsRow}>
                <View style={[styles.factPill, badge.urgent && styles.factPillUrgent]}>
                  <Ionicons
                    name={isService ? 'time-outline' : 'alarm-outline'}
                    size={13}
                    color={badge.urgent ? '#8F4300' : colors.ink}
                  />
                  <Text style={[styles.factPillText, badge.urgent && { color: '#8F4300' }]}>{badge.text}</Text>
                </View>
                {item.bookable ? (
                  <View style={styles.factPill}>
                    <Ionicons name="calendar-outline" size={13} color={colors.verified} />
                    <Text style={[styles.factPillText, { color: colors.verified }]}>Se puede reservar</Text>
                  </View>
                ) : null}
                {biz?.service_mode === 'delivery' || biz?.service_mode === 'both' ? (
                  <View style={styles.factPill}>
                    <Ionicons name="bicycle-outline" size={13} color={colors.ink} />
                    <Text style={styles.factPillText}>Hacen domicilio</Text>
                  </View>
                ) : null}
              </View>

              {item.description ? (
                <Text style={styles.descText} numberOfLines={3}>
                  {item.description}
                </Text>
              ) : null}
            </View>

            {/* TARJETA DEL NEGOCIO (Acceso directo al perfil completo) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ir al negocio ${biz?.name ?? item.entity_name}`}
              onPress={openBusiness}
              style={({ pressed }) => [styles.bizCard, pressed && styles.pressed]}
            >
              <Avatar uri={biz?.profile_url} name={biz?.name ?? item.entity_name} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.bizNameRow}>
                  <Text style={styles.bizName} numberOfLines={1}>
                    {biz?.name ?? item.entity_name}
                  </Text>
                  {biz?.is_verified ? <Ionicons name="checkmark-circle" size={15} color={colors.verified} /> : null}
                </View>
                <Text style={styles.bizMeta} numberOfLines={1}>
                  Ver todo su catálogo, horarios y ubicación
                </Text>
              </View>
              <View style={styles.bizGoPill}>
                <Text style={styles.bizGoText}>Ver local</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.ink} />
              </View>
            </Pressable>

            {/* MÓDULO EMPRE AI: RESPUESTAS RÁPIDAS AL INSTANTE */}
            <View style={styles.aiCard}>
              <View style={styles.aiHeader}>
                <Chispa size={34} mood={mood} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiTitle}>Pregúntale a Empre AI</Text>
                  <Text style={styles.aiSub}>{thinking ? 'Entendiendo tu pregunta…' : `Responde al instante con lo que publicó ${biz?.name ?? item.entity_name}`}</Text>
                </View>
                <View style={styles.aiAutoBadge}>
                  <Text style={styles.aiAutoText}>AL INSTANTE</Text>
                </View>
              </View>

              {/* Chips de preguntas sugeridas */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiChipsRow} keyboardShouldPersistTaps="handled">
                {peers.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Comparar ${item.title} en los ${peers.length} negocios cercanos que lo tienen`}
                    onPress={() => setAskMany(true)}
                    style={({ pressed }) => [styles.aiChip, styles.aiChipCompare, pressed && styles.pressed]}
                  >
                    <Ionicons name="git-compare-outline" size={13} color="#fff" />
                    <Text style={[styles.aiChipText, styles.aiChipTextActive]}>{`Comparar en los ${peers.length}`}</Text>
                  </Pressable>
                ) : null}
                {suggested.map((q) => (
                  <Pressable
                    key={q.intent}
                    accessibilityRole="button"
                    onPress={() => askQuick(q.intent, q.label)}
                    style={({ pressed }) => [
                      styles.aiChip,
                      aiTurn?.q === q.label && styles.aiChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="sparkles" size={12} color={aiTurn?.q === q.label ? '#fff' : colors.primaryDark} />
                    <Text style={[styles.aiChipText, aiTurn?.q === q.label && styles.aiChipTextActive]}>{q.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Respuesta instantánea de Empre AI */}
              {aiTurn ? (
                <View style={styles.aiAnswerBox}>
                  <Text style={styles.aiQuestionAsked}>“{aiTurn.q}”</Text>
                  {aiTurn.a.blocks.map((b, idx) => (
                    <AIBlockView key={idx} b={b} />
                  ))}
                  {aiTurn.a.source ? <Text style={styles.aiSource}>{aiTurn.a.source}</Text> : null}
                  <View style={styles.aiAnswerActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => writeToBusiness(`${aiTurn.q} (Sobre: ${item.title})`)}
                      style={({ pressed }) => [styles.aiWriteLink, pressed && styles.pressed]}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primaryDark} />
                      <Text style={styles.aiWriteLinkText}>Enviar esta consulta directo al negocio</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* Campo para escribir pregunta libre a Empre AI */}
              <View style={styles.aiInputRow}>
                <TextInput
                  value={aiQuestion}
                  onChangeText={setAiQuestion}
                  onSubmitEditing={() => void submitCustomQuestion()}
                  returnKeyType="send"
                  placeholder="Haz una pregunta rápida (ej. ¿tienen turno hoy?)..."
                  placeholderTextColor={colors.muted}
                  style={styles.aiInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Preguntar a Empre AI"
                  disabled={!aiQuestion.trim() || thinking}
                  onPress={() => void submitCustomQuestion()}
                  style={[styles.aiSendBtn, (!aiQuestion.trim() || thinking) && styles.aiSendBtnDisabled]}
                >
                  <Ionicons name="arrow-up" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>

        <AskManySheet
          visible={askMany}
          product={item.title}
          items={peers}
          onClose={() => setAskMany(false)}
        />

        {/* BARRA DE ACCIÓN INFERIOR: ESCRIBIR DIRECTO + RECLAMAR / VER DETALLE */}
        <View style={styles.footerBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Escribirle a ${biz?.name ?? item.entity_name} sobre ${item.title}`}
            onPress={() => writeToBusiness()}
            style={({ pressed }) => [styles.chatBtn, pressed && styles.pressed]}
          >
            <Ionicons name="chatbubble-outline" size={19} color={colors.ink} />
            <Text style={styles.chatBtnText}>Escribirle</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={openProductOrOffer}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>{isService ? 'Ver detalle completo' : 'Reclamar oferta'}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function AIBlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case 'text':
    case 'missing':
      return (
        <View style={{ gap: 2 }}>
          <Text style={styles.aiBlockTitle}>{b.title}</Text>
          {b.body ? <Text style={styles.aiBlockBody}>{b.body}</Text> : null}
        </View>
      );
    case 'services':
      return (
        <View style={{ gap: 4 }}>
          <Text style={styles.aiBlockTitle}>{b.title}</Text>
          {b.items.slice(0, 4).map((s) => (
            <View key={s.id} style={styles.aiSvcRow}>
              <Text style={styles.aiSvcName} numberOfLines={1}>
                {s.name}
                {s.duration_min ? ` · ${s.duration_min} min` : ''}
              </Text>
              <Text style={styles.aiSvcPrice}>{priceLabel(s) ?? 'Consultar'}</Text>
            </View>
          ))}
        </View>
      );
    case 'offer':
      return (
        <View style={styles.aiOfferBlock}>
          <Text style={styles.aiBlockTitle}>{b.title}</Text>
          {b.appliesTo ? <Text style={styles.aiBlockBody}>Incluye: {b.appliesTo}</Text> : null}
          <Text style={styles.aiBlockBody}>Vigente hasta {formatEndsWhen(b.endsAt)}</Text>
        </View>
      );
    case 'choose':
      return <Text style={styles.aiBlockTitle}>{b.title}</Text>;
  }
}

// Lo que el servidor ya clasificó en esta sesión: la misma pregunta no se paga dos veces (3.64).
const classified = new Map<string, { intent: string; answer_id?: string }>();

const styles = StyleSheet.create({
  aiChipCompare: { backgroundColor: colors.ink, borderColor: colors.ink },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14,35,70,0.52)' },
  sheet: { maxHeight: '90%', backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', ...softShadow },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6, backgroundColor: colors.surface },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  scrollContent: { paddingBottom: 16 },
  heroWrap: { height: 188, position: 'relative', backgroundColor: colors.ink },
  heroPhoto: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  heroTopRow: { position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroOfferBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accent },
  heroOfferBadgeText: { fontSize: 12.5, fontFamily: fonts.display.bold, color: colors.ink },
  heroCatalogBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(14,35,70,0.86)' },
  heroCatalogBadgeText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' },
  heroBottomRow: { position: 'absolute', bottom: 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  openBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.94)' },
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.verified },
  openBadgeText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#1B6B3C' },
  ratingBadgeText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  body: { paddingHorizontal: 18, paddingTop: 14, gap: 12 },
  offerBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: '#FFF1E3', borderWidth: 1.5, borderColor: colors.accent },
  offerBannerIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  offerBannerTag: { fontSize: 10.5, letterSpacing: 0.4, fontFamily: fonts.ui.extrabold, color: '#8F4300' },
  offerBannerTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  offerBannerGo: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.surface },
  offerBannerGoText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  headBlock: { padding: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 10 },
  titlePriceRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  itemTitle: { fontSize: 21, lineHeight: 25, fontFamily: fonts.display.bold, color: colors.ink },
  itemCategory: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  priceColumn: { alignItems: 'flex-end', gap: 3 },
  promoPriceBox: { backgroundColor: '#FFF1E3', borderWidth: 1.5, borderColor: colors.accent, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  catalogPriceBox: { backgroundColor: colors.selectedSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  priceNow: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  priceWas: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.faint, textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  consultText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  factsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  factPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.selectedSoft },
  factPillUrgent: { backgroundColor: '#FFF1E3' },
  factPillText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  descText: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.medium, color: colors.muted },
  bizCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  bizNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bizName: { flexShrink: 1, fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  bizMeta: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  bizGoPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.selectedSoft },
  bizGoText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.ink },
  aiCard: { padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: '#D5E3F7', gap: 10 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  aiSub: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  aiAutoBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: '#E3F5F3' },
  aiAutoText: { fontSize: 10, fontFamily: fonts.ui.extrabold, color: colors.verified, letterSpacing: 0.4 },
  aiChipsRow: { gap: 6, paddingVertical: 2 },
  aiChip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  aiChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  aiChipText: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.ink },
  aiChipTextActive: { color: '#fff' },
  aiAnswerBox: { padding: 12, borderRadius: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, gap: 6 },
  aiQuestionAsked: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  aiBlockTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  aiBlockBody: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  aiSvcRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  aiSvcName: { flex: 1, fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  aiSvcPrice: { fontSize: 13, fontFamily: fonts.display.bold, color: colors.ink },
  aiOfferBlock: { padding: 8, borderRadius: 10, backgroundColor: '#FFF1E3', gap: 2 },
  aiSource: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.faint },
  aiAnswerActions: { marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.line },
  aiWriteLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  aiWriteLinkText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  aiInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiInput: { flex: 1, height: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, fontSize: 13, fontFamily: fonts.ui.medium, color: colors.ink },
  aiSendBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  aiSendBtnDisabled: { opacity: 0.4 },
  footerBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  chatBtn: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  chatBtnText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  primaryBtn: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.primary },
  primaryBtnText: { fontSize: 15.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
});
