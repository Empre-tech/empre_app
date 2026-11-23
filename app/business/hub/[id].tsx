import { CrownIcon, Ionicons } from '@/components/Icon';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment } from '@/api/agenda';
import { answersApi } from '@/api/answers';
import { chatApi, entitiesApi, paymentsApi } from '@/api/endpoints';
import { ledgerApi } from '@/api/ledger';
import { novedadesApi } from '@/api/novedades';
import { offersApi } from '@/api/offers';
import { useChat } from '@/chat/ChatProvider';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { Chispa } from '@/components/ai/Chispa';
import { useAnswerData } from '@/components/chat/useAnswerData';
import { EmptyState } from '@/components/EmptyState';
import { BusinessSwitcher } from '@/components/profile/BusinessSwitcher';
import { EMPRE_BUTTON } from '@/components/EmpreButton';
import { GoProSheet } from '@/components/pro/GoProSheet';
import { LOCKED_OPACITY, ProTag } from '@/components/pro/ProTag';
import { GrowthSheet } from '@/components/hub/GrowthSheet';
import { HubHeader, HubName } from '@/components/hub/HubHeader';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { StatusCap, SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { FEATURES } from '@/config';
import { ownerDraft } from '@/lib/answers';
import { catalogCopy } from '@/lib/catalog';
import { addDays, presetRange, todayCO, weekOf } from '@/lib/finance';
import { verificationLabel } from '@/lib/format';
import { growthView, missingLine } from '@/lib/growth';
import { formatPesos } from '@/lib/ledger';
import { openingFromHours, statusLine } from '@/lib/placeCard';
import { timeLeftLabel, timeLeftMs } from '@/lib/offer';
import { isProSubscription } from '@/lib/proPlan';
import { useNow } from '@/lib/useNow';
import { colors, fonts, softShadow, spacing, typeScale } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
interface HubRow {
  key: string;
  icon: IconName;
  title: string;
  sub: string;
  alert?: boolean;
  locked?: boolean;
  onPress: () => void;
}

// Cada espacio con un ícono de su tema, sobre un cuadro suave de su color (lienzo v115): ya no el logo de Empre.
const SPACE_LOOK: Record<string, { icon: IconName; bg: string; ink: string }> = {
  finance: { icon: 'wallet-outline', bg: colors.financeSoft, ink: colors.finance },
  products: { icon: 'cube-outline', bg: colors.sandSoft, ink: colors.ink },
  agenda: { icon: 'calendar-outline', bg: colors.agendaSoft, ink: colors.agenda },
  offers: { icon: 'pricetag-outline', bg: colors.accentSoft, ink: colors.accentInk },
};

const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

/**
 * «Mi negocio» administra (lienzo v113, «un rol por lugar»): arriba, el anillo de lo que falta para completar el perfil
 * (lienzo v115); el día en una frase, «Lo que sigue» (lo que pide respuesta y las citas de hoy), sus cuatro espacios con
 * un dato que no se repite y lo de vez en cuando. Vender, ofertar y subir viven en el botón Empre; aquí no se repiten.
 */
export default function BusinessHubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inbox = useInboxSummary();
  const today = todayCO();
  const dayRange = useMemo(() => presetRange('today', today), [today]);
  // La hora de «Lo que sigue» (qué cita es «Ahora»): se refresca cada minuto.
  const nowMs = useNow(60_000);

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const [goPro, setGoPro] = useState(false);
  const subscription = useQuery({ queryKey: ['subscription', entityId], queryFn: () => paymentsApi.getSubscription(entityId), enabled: Boolean(entityId) });
  const followers = useQuery({ queryKey: ['followers', entityId], queryFn: () => novedadesApi.followers(entityId), enabled: Boolean(entityId) });
  const unansweredQ = useQuery({ queryKey: ['answers-unanswered', entityId], queryFn: () => answersApi.unanswered(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const sold = useQuery({
    queryKey: ['ledger', entityId, 'analytics', dayRange.from, dayRange.to, dayRange.compare],
    queryFn: () => ledgerApi.analytics(entityId, { from: dayRange.from, to: dayRange.to, compare: dayRange.compare }),
    enabled: Boolean(entityId) && FEATURES.ledger,
    staleTime: 30_000,
    retry: false,
  });
  // La semana entera (lunes a domingo): Agenda dice cuántas citas tiene; las de hoy salen de aquí mismo.
  const week = useMemo(() => weekOf(today), [today]);
  const agendaWeek = useQuery({
    queryKey: ['agenda', entityId, 'hub-week', week.from],
    queryFn: () => agendaApi.agenda(entityId, startCO(week.from), startCO(addDays(week.to, 1))),
    enabled: Boolean(entityId) && FEATURES.agenda,
    staleTime: 30_000,
    retry: false,
  });
  // Lo que falta para completar el perfil (el anillo): se recalcula al volver de editar, subir fotos o publicar.
  const completeness = useQuery({ queryKey: ['completeness', entityId], queryFn: () => entitiesApi.completeness(entityId), enabled: Boolean(entityId), staleTime: 0 });
  useFocusEffect(
    useCallback(() => {
      void completeness.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al enfocar
    }, []),
  );
  const [growthOpen, setGrowthOpen] = useState(false);
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId) && FEATURES.ledger, staleTime: 60_000, retry: false });
  const insights = useQuery({ queryKey: ['ledger', entityId, 'insights'], queryFn: () => ledgerApi.insights(entityId), enabled: Boolean(entityId) && FEATURES.ledger, staleTime: 60_000, retry: false });
  const offerList = useQuery({ queryKey: ['offers', entityId], queryFn: () => offersApi.list(entityId), enabled: Boolean(entityId), staleTime: 60_000, retry: false });
  // La pregunta de un cliente que espera respuesta: la conversación más nueva de este negocio cuyo último mensaje es
  // un texto del cliente (no una respuesta de Empre AI). Se lee de la lista: abrir el chat lo marcaría como leído.
  const chat = useChat();
  const answerData = useAnswerData(entityId, true, true);
  const convs = useQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations, enabled: Boolean(entityId), staleTime: 30_000 });
  const [sentTo, setSentTo] = useState<string[]>([]);
  const waiting = (convs.data ?? [])
    .filter((c) => c.entity_id === entityId && c.other_party.type === 'user' && !c.sent_by_entity && c.unread_count > 0 && (c.kind ?? 'text') === 'text' && c.content.trim() && !sentTo.includes(c.id))
    .sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))[0];

  if (business.isLoading) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Mi negocio" />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      </View>
    );
  }
  const b = business.data;
  if (business.isError || !b) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Mi negocio" />
        <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tu negocio" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void business.refetch() }} />
      </View>
    );
  }

  const copy = catalogCopy(b.category?.name, b.business_profile);
  // Base y Empre Pro (tablero, teléfono 7): en Base la Agenda no desaparece, queda en gris con la corona, y abajo de los
  // espacios sale «Pásate a Empre Pro». Mientras no se sabe el plan, nada se muestra cerrado.
  const base = subscription.isSuccess && !isProSubscription(subscription.data?.subscription);
  const goProLine = FEATURES.agenda ? 'Empre AI, Finance completo y agenda' : 'Empre AI y Finance completo';
  const nFollowers = followers.data ?? 0;
  const go = (href: Href) => () => router.push(href);
  const edit = go({ pathname: '/business/edit/[id]', params: { id: entityId } });
  const offers = go({ pathname: '/business/offers', params: { entityId } });
  const products = go({ pathname: '/business/products/[id]', params: { id: entityId } });
  const photos = go({ pathname: '/business/my-photos/[id]', params: { id: entityId } });
  const agenda = go({ pathname: '/business/agenda/[id]', params: { id: entityId } });
  const finance = go({ pathname: '/business/ledger/[id]', params: { id: entityId } });
  const profile = go({ pathname: '/business/[id]', params: { id: entityId } });
  const requests = inbox.byEntity.get(entityId)?.requests ?? 0;
  const soldToday = sold.data?.current.sales_total ?? 0;
  const salesToday = sold.data?.current.sales_count ?? 0;
  const owed = sold.data?.receivable ?? 0;

  const weekAppts = (agendaWeek.data ?? []).filter((a) => a.kind === 'booking' && (a.status === 'requested' || a.status === 'confirmed'));
  const dayStart = Date.parse(startCO(today));
  const dayEnd = Date.parse(startCO(addDays(today, 1)));
  const appts = weekAppts.filter((a) => Date.parse(a.starts_at) >= dayStart && Date.parse(a.starts_at) < dayEnd);
  const weekCount = weekAppts.length;
  // La cabecera: la portada, el anillo, las cifras que existen (sin datos, sin cifra) y su estado. Las fotos no se
  // cuentan aquí: ya las dice «Fotos y videos» abajo (2026-11-18).
  const growth = completeness.data ? growthView(completeness.data) : undefined;
  const missing = missingLine(growth);
  const stats = [
    ...(nFollowers > 0 ? [{ value: String(nFollowers), label: nFollowers === 1 ? 'seguidor' : 'seguidores' }] : []),
    ...(b.review_count > 0 ? [{ value: b.avg_rating.toFixed(1).replace('.', ','), label: b.review_count === 1 ? '1 reseña' : `${b.review_count} reseñas` }] : []),
  ];
  const opening = openingFromHours(b.hours, new Date(nowMs), Boolean(b.is_open_now));
  const status = statusLine({ has_hours: Boolean(b.hours?.length), is_open_now: Boolean(b.is_open_now), ...opening })?.text ?? b.category?.name ?? null;
  const confirmed = appts.filter((a) => a.status === 'confirmed').length;
  const who = (a: Appointment) => [a.customer?.name, a.service?.name].filter(Boolean).join(' · ') || 'Cita';
  // «Lo que sigue» (tablero «Mi negocio», teléfono 2): lo que pide respuesta primero; después las citas de hoy en orden,
  // con la que está pasando como «Ahora». Solo lo que hay: sin citas, no hay lista.
  const coming = appts.filter((a) => Date.parse(a.ends_at) > nowMs).sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at));
  const listedRequests = coming.slice(0, 4).filter((a) => a.status === 'requested').length;
  const steps: { key: string; hora: string; t: string; d: string; cta: string | null; now: boolean }[] = FEATURES.agenda
    ? [
        ...(requests > listedRequests ? [{ key: 'req', hora: '•', t: requests === 1 ? '1 cita por responder' : `${requests} citas por responder`, d: 'Esperan tu sí', cta: 'Ver', now: true }] : []),
        ...coming.slice(0, 4).map((a) => {
          const on = Date.parse(a.starts_at) <= nowMs;
          return { key: a.id, hora: on ? 'Ahora' : timeOf(a.starts_at), t: who(a), d: a.status === 'requested' ? 'Por responder' : on ? `Termina ${timeOf(a.ends_at)}` : 'Confirmada', cta: a.status === 'requested' ? 'Responder' : null, now: on };
        }),
      ]
    : [];

  const running = (offerList.data ?? []).map((o) => timeLeftMs(o.ends_at)).filter((ms) => ms > 0).sort((x, y) => x - y)[0];
  const hasRunning = running !== undefined;
  const stockAlert = (insights.data ?? []).find((i) => i.kind === 'soon' || i.kind === 'out' || i.kind === 'low');
  const nItems = items.data?.length ?? 0;
  const nUnanswered = unansweredQ.data?.data?.length ?? 0;
  const spaces: { key: string; title: string; sub: string; alert?: boolean; locked?: boolean; onPress: () => void }[] = [
    ...(FEATURES.ledger ? [{ key: 'finance', title: 'Finanzas', sub: owed > 0 ? `Te deben ${formatPesos(owed)}` : 'Tu caja y lo que te deben', onPress: finance }] : []),
    { key: 'products', title: 'Inventario', sub: stockAlert ? stockAlert.title : nItems > 0 ? (nItems === 1 ? '1 en tu catálogo' : `${nItems} en tu catálogo`) : `Agrega lo que ${copy.kind === 'service' ? 'ofreces' : 'vendes'}`, alert: Boolean(stockAlert), onPress: products },
    // Las citas de hoy y las que esperan respuesta ya están en la frase del día: aquí, la semana.
    ...(FEATURES.agenda ? [{ key: 'agenda', title: 'Agenda', sub: weekCount > 0 ? `Esta semana: ${weekCount} ${weekCount === 1 ? 'cita' : 'citas'}` : 'Sin citas esta semana', alert: requests > 0, onPress: agenda, ...(base && !requests && !weekCount ? { sub: 'Citas que se apartan solas', locked: true, onPress: () => setGoPro(true) } : {}) }] : []),
    { key: 'offers', title: 'Ofertas', sub: hasRunning ? timeLeftLabel(running) : 'Publica una', onPress: offers },
  ];
  const later: HubRow[] = [
    // Todo lo que pasó en una línea de tiempo, con la meta del mes arriba (tablero «Actividad y meta»).
    ...(FEATURES.ledger ? [{ key: 'clients', icon: 'people-outline' as IconName, title: 'Clientes', sub: 'Su historial, su ticket y mensajes por WhatsApp', onPress: go({ pathname: '/business/ledger/clients/[id]', params: { id: entityId } }) }] : []),
    { key: 'activity', icon: 'pulse-outline', title: 'Actividad y meta', sub: 'Lo que pasó y tu meta del mes', onPress: go({ pathname: '/business/activity/[id]', params: { id: entityId } }) },
    { key: 'profile', icon: 'person-outline', title: 'Perfil público', sub: b.is_verified ? 'Nombre, horario y contacto' : 'Sin verificar · nombre, horario y contacto', onPress: edit },
    { key: 'photos', icon: 'images-outline', title: 'Fotos y videos', sub: (b.photos?.length ?? 0) === 1 ? '1 publicada' : `${b.photos?.length ?? 0} publicadas`, onPress: photos },
    { key: 'teach', icon: 'sparkles-outline', title: 'Enséñale a Empre AI', sub: nUnanswered ? (nUnanswered === 1 ? '1 pregunta que no supo responder' : `${nUnanswered} preguntas que no supo responder`) : 'Lo que responde por ti', alert: nUnanswered > 0, onPress: go({ pathname: '/business/teach/[id]', params: { id: entityId } }) },
    { key: 'reviews', icon: 'star-outline', title: 'Reseñas', sub: b.review_count > 0 ? (b.review_count === 1 ? '1 reseña' : `${b.review_count} reseñas`) : 'Aparecen cuando te visiten', onPress: go({ pathname: '/business/reviews/[id]', params: { id: entityId } }) },
    ...(FEATURES.agenda ? [{ key: 'agent', icon: 'chatbubble-ellipses-outline' as const, title: 'Citas con Agent', sub: 'Lo que resolvió solo', ...(base ? { locked: true, onPress: () => setGoPro(true) } : { onPress: go({ pathname: '/business/agent/[id]', params: { id: entityId, name: b.name } }) }) }] : []),
    ...(FEATURES.ledger && FEATURES.tabs ? [{ key: 'tabs', icon: (b.business_profile === 'food' ? 'restaurant-outline' : 'receipt-outline') as IconName, title: b.business_profile === 'food' ? 'Mesas' : 'Cuentas abiertas', sub: b.business_profile === 'food' ? 'Lo que pide cada mesa' : 'Para los que pagan al final', onPress: go({ pathname: '/business/ledger/tabs/[id]', params: { id: entityId } }) }] : []),
    { key: 'practice', icon: 'school-outline', title: 'Practicar el canje', sub: 'Con un QR que no cuenta como venta', onPress: go('/business/practice') },
    { key: 'sub', icon: 'diamond-outline', title: 'Tu plan', sub: base ? 'Base · gratis' : subscription.isSuccess ? 'Empre Pro' : 'Base o Empre Pro', onPress: go({ pathname: '/business/subscription/[id]', params: { id: entityId } }) },
  ];
  const renderRows = (list: HubRow[]) => list.map(({ key, ...r }, i) => <SystemRow key={key} first={i === 0} {...r} />);

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 + EMPRE_BUTTON }]}>
        {/* Arriba, como el perfil de Instagram (lienzo v115): el anillo de lo que falta, las cifras y el nombre, que con
            varios negocios abre la lista para cambiar. */}
        <HubHeader
          name={b.name}
          logo={b.profile_url}
          cover={b.banner_url}
          category={b.category?.name}
          categoryIcon={b.category?.icon}
          loading={followers.isLoading || completeness.isLoading}
          status={status}
          state={b.verification_status === 'verified' ? null : verificationLabel(b.verification_status)}
          pct={growth?.percent ?? 0}
          stats={stats}
          missing={missing && growth ? { ...missing, done: growth.done, total: growth.total } : null}
          nameRow={
            <BusinessSwitcher
              currentId={entityId}
              onPick={(id) => router.replace({ pathname: '/business/hub/[id]', params: { id } })}
              onAdd={() => router.push('/business/new')}
              trigger={(open) => <HubName name={b.name} onPress={open} />}
              fallback={<HubName name={b.name} />}
            />
          }
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          onSeeProfile={profile}
          onMissing={() => setGrowthOpen(true)}
        />

        {/* El día en una frase, armada con plantillas (tablero «Mi negocio · Hoy»): solo lo que sí pasó. */}
        <Text style={styles.daySentence} accessibilityRole="header">
          {(FEATURES.agenda && confirmed) || requests || soldToday > 0 ? (
            <>
              Hoy {FEATURES.agenda && confirmed ? <>tienes <Text style={styles.dsAgenda}>{`${confirmed} ${confirmed === 1 ? 'cita' : 'citas'}`}</Text></> : null}
              {FEATURES.agenda && confirmed && requests ? ', ' : ''}
              {requests ? <Text style={styles.dsUnder}>{`${requests} por responder`}</Text> : null}
              {soldToday > 0 ? <>{(FEATURES.agenda && confirmed) || requests ? ' y llevas ' : 'llevas '}<Text style={styles.dsMoney}>{formatPesos(soldToday)}</Text>{salesToday > 0 ? ` en ${salesToday} ${salesToday === 1 ? 'venta' : 'ventas'}` : ''}</> : null}.
            </>
          ) : (
            'Hoy todavía no hay ventas. Anótalas con el botón Empre.'
          )}
        </Text>
        {steps.length ? (
          <View style={styles.main}>
            <View style={styles.next}>
              <Text style={styles.label}>Lo que sigue</Text>
              {steps.map((st, i) => (
                <Pressable key={st.key} accessibilityRole="button" accessibilityLabel={`${st.hora === '•' ? '' : `${st.hora}. `}${st.t}. ${st.d}. Abrir agenda`} onPress={agenda} style={({ pressed }) => [styles.nextRow, i > 0 && styles.nextLine, pressed && { opacity: 0.85 }]}>
                  <Text style={[styles.nextHour, st.now && styles.nextHourNow]}>{st.hora}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.nextTitle} numberOfLines={1}>
                      {st.t}
                    </Text>
                    <Text style={styles.nextSub} numberOfLines={1}>
                      {st.d}
                    </Text>
                  </View>
                  {st.cta ? (
                    <View style={styles.nextCta}>
                      <Text style={styles.nextCtaText}>{st.cta}</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={colors.placeholder} />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Empre AI te deja lista la respuesta (tablero «Mi negocio», teléfono 2): la envías o la cambias */}
        {waiting ? (
          <DraftCard
            customer={waiting.other_party.name}
            question={waiting.content}
            draft={answerData ? ownerDraft(answerData, waiting.content, { weekday: new Date(nowMs).getDay(), now: nowMs }) : null}
            onSend={(text) => {
              const ok = chat.send({ entity_id: entityId, user_id: waiting.other_party.id, sent_by_entity: true, content: text });
              if (ok) setSentTo((prev) => [...prev, waiting.id]);
              else router.push({ pathname: '/chat/[entityId]', params: { entityId, userId: waiting.other_party.id, name: waiting.other_party.name, avatar: waiting.other_party.profile_url, draft: text } });
            }}
            onOpen={(text) => router.push({ pathname: '/chat/[entityId]', params: { entityId, userId: waiting.other_party.id, name: waiting.other_party.name, avatar: waiting.other_party.profile_url, ...(text ? { draft: text } : {}) } })}
          />
        ) : null}

        <View style={styles.spaces} accessibilityRole="menu" accessibilityLabel="Tus espacios">
          {spaces.map((s) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}. ${s.sub}${s.locked ? '. Es de Empre Pro' : ''}`}
              accessibilityHint={s.locked ? 'Abre Pásate a Empre Pro' : undefined}
              onPress={s.onPress}
              style={({ pressed }) => [styles.space, s.locked && styles.spaceLocked, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.spaceBody, s.locked && { opacity: LOCKED_OPACITY }]}>
                <View style={[styles.spaceIcon, { backgroundColor: SPACE_LOOK[s.key].bg }]}>
                  <Ionicons name={SPACE_LOOK[s.key].icon} size={22} color={SPACE_LOOK[s.key].ink} />
                </View>
                <View style={{ gap: 1 }}>
                  <Text style={styles.spaceTitle} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={styles.spaceSub} numberOfLines={2}>
                    {s.sub}
                  </Text>
                </View>
              </View>
              {s.locked ? (
                <View style={styles.spaceTag}>
                  <ProTag />
                </View>
              ) : s.alert ? (
                <View style={styles.spaceDot} />
              ) : null}
            </Pressable>
          ))}
        </View>

        {base ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Pásate a Empre Pro. ${goProLine}`} onPress={() => setGoPro(true)} style={({ pressed }) => [styles.goPro, pressed && { opacity: 0.85 }]}>
            <CrownIcon size={20} color={colors.ink} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={styles.goProTitle}>Pásate a Empre Pro</Text>
              <Text style={styles.spaceSub} numberOfLines={1}>{goProLine}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        ) : null}

        <SystemSection title="Lo de vez en cuando">
          <SystemGroup>{renderRows(later)}</SystemGroup>
        </SystemSection>
      </ScrollView>
      <GoProSheet visible={goPro} onClose={() => setGoPro(false)} businesses={[{ id: entityId, name: b.name }]} />
      <GrowthSheet visible={growthOpen} view={growth} onClose={() => setGrowthOpen(false)} onGo={(g) => (g === 'catalog' ? products() : g === 'offer' ? offers() : g === 'photos' ? photos() : edit())} />
      <StatusCap />
    </View>
  );
}

/**
 * La pregunta de un cliente con la respuesta que Empre AI dejó lista, en primera persona y con lo publicado. Si no la
 * sabe, solo dice qué preguntó y «Responder» abre el chat. Nada se envía sin un toque del dueño.
 */
function DraftCard({ customer, question, draft, onSend, onOpen }: { customer: string; question: string; draft: string | null; onSend: (text: string) => void; onOpen: (text: string | null) => void }) {
  const first = customer.trim().split(/\s+/)[0] || 'Un cliente';
  return (
    <View style={styles.draft} accessibilityLiveRegion="polite">
      <View style={styles.draftHead}>
        <Chispa size={20} mood="responde" />
        <Text style={styles.draftWho}>Empre AI</Text>
      </View>
      <Text style={styles.draftText}>
        <Text style={styles.draftBold}>{first}</Text>
        {` preguntó «${question.trim()}».${draft ? ' Te dejé lista la respuesta:' : ' No lo sé con lo que publicaste: respóndele tú.'}`}
      </Text>
      {draft ? <Text style={styles.draftQuote}>{`«${draft}»`}</Text> : null}
      <View style={styles.draftBtns}>
        {draft ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Enviarle a ${first}: ${draft}`} onPress={() => onSend(draft)} style={({ pressed }) => [styles.btnRed, styles.draftBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.btnRedText}>Enviar</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => onOpen(draft)} style={({ pressed }) => [styles.draftEdit, styles.draftBtn, pressed && { opacity: 0.85 }]}>
          <Text style={styles.draftEditText}>{draft ? 'Cambiarla' : 'Responder'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  draft: { gap: 8, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  draftHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  draftWho: { ...typeScale.label, color: colors.ink },
  draftText: { ...typeScale.title, lineHeight: 21, fontFamily: fonts.ui.medium, color: colors.ink },
  draftBold: { fontFamily: fonts.ui.semibold },
  draftQuote: { ...typeScale.title, lineHeight: 21, color: colors.ink },
  draftBtns: { flexDirection: 'row', gap: 8, marginTop: 2 },
  draftBtn: { flex: 1, alignItems: 'center' },
  draftEdit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.nightSoft },
  draftEditText: { ...typeScale.title, color: colors.ink },
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, gap: 16 },
  main: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  label: { ...typeScale.label, color: colors.muted },
  // «Lo que sigue»: la hora a la izquierda (roja si es ahora), qué es y, si pide algo, el botón.
  next: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  nextRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  nextHour: { ...typeScale.body, width: 52, fontFamily: fonts.ui.semibold, color: colors.ink, fontVariant: ['tabular-nums'] },
  nextHourNow: { color: colors.agenda },
  nextTitle: { ...typeScale.title, color: colors.ink },
  nextSub: { ...typeScale.body, color: colors.muted },
  nextCta: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 18, borderWidth: 1.5, borderColor: colors.nightSoft },
  nextCtaText: { ...typeScale.body, fontFamily: fonts.ui.semibold, color: colors.ink },
  daySentence: { fontSize: 20, lineHeight: 26, fontFamily: fonts.ui.semibold, letterSpacing: -0.2, color: colors.ink },
  dsAgenda: { color: colors.agenda },
  dsUnder: { textDecorationLine: 'underline' },
  dsMoney: { color: colors.finance },
  btnRed: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brandRef },
  btnRedText: { ...typeScale.title, color: colors.ink },
  spaces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  space: { width: '48.8%', minHeight: 92, justifyContent: 'space-between', gap: 6, padding: 12, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  spaceBody: { flex: 1, justifyContent: 'space-between', gap: 6 },
  spaceLocked: { backgroundColor: colors.well },
  spaceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  spaceTag: { position: 'absolute', top: 12, right: 12 },
  goPro: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 2, borderColor: colors.brandRef, backgroundColor: colors.surface },
  goProTitle: { ...typeScale.title, color: colors.ink },
  spaceDot: { position: 'absolute', top: 12, right: 12, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  spaceTitle: { ...typeScale.title, color: colors.ink },
  spaceSub: { ...typeScale.body, color: colors.muted },
});
