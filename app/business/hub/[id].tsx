import { Ionicons } from '@/components/Icon';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { Avatar } from '@/components/Avatar';
import { Cover } from '@/components/Cover';
import { EmpreSymbol, type EmpreProduct } from '@/components/EmpreSymbol';
import { EmptyState } from '@/components/EmptyState';
import { BusinessSwitcher } from '@/components/profile/BusinessSwitcher';
import { GrowthCard } from '@/components/profile/GrowthCard';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { ActionTile, StatusCap, SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { FEATURES } from '@/config';
import { ownerDraft } from '@/lib/answers';
import { catalogCopy } from '@/lib/catalog';
import { addDays, presetRange, todayCO } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { displayIcon } from '@/lib/mapView';
import { timeLeftLabel, timeLeftMs } from '@/lib/offer';
import { useNow } from '@/lib/useNow';
import { colors, fonts, softShadow, spacing } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
interface HubRow {
  key: string;
  icon: IconName;
  symbol?: EmpreProduct;
  product?: string;
  title: string;
  sub: string;
  alert?: boolean;
  onPress: () => void;
}

const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

/**
 * «Mi negocio», ordenado por lo que el dueño viene a hacer (tablero «Mi negocio», teléfono 2): la portada de cómo lo ven,
 * el día en una frase, «Lo que sigue» (lo que pide respuesta y las citas de hoy), sus
 * cuatro espacios con su dato, lo de todos los días y, al final, lo de vez en cuando. Lo principal cabe en la primera pantalla.
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
  const agendaDay = useQuery({
    queryKey: ['agenda', entityId, 'hub', today],
    queryFn: () => agendaApi.agenda(entityId, startCO(today), startCO(addDays(today, 1))),
    enabled: Boolean(entityId) && FEATURES.agenda,
    staleTime: 30_000,
    retry: false,
  });
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
  const requiresPayment = subscription.data?.requires_payment ?? false;
  const nFollowers = followers.data ?? 0;
  const go = (href: Href) => () => router.push(href);
  const edit = go({ pathname: '/business/edit/[id]', params: { id: entityId } });
  const offers = go({ pathname: '/business/offers', params: { entityId } });
  const products = go({ pathname: '/business/products/[id]', params: { id: entityId } });
  const photos = go({ pathname: '/business/my-photos/[id]', params: { id: entityId } });
  const agenda = go({ pathname: '/business/agenda/[id]', params: { id: entityId } });
  const finance = go({ pathname: '/business/ledger/[id]', params: { id: entityId } });
  const sale = go({ pathname: '/business/ledger/sale/[id]', params: { id: entityId } });
  const profile = go({ pathname: '/business/[id]', params: { id: entityId } });
  const requests = inbox.byEntity.get(entityId)?.requests ?? 0;
  const soldToday = sold.data?.current.sales_total ?? 0;

  const appts = (agendaDay.data ?? []).filter((a) => a.kind === 'booking' && (a.status === 'requested' || a.status === 'confirmed'));
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

  const short = copy.kind === 'service' ? 'Servicios' : 'Productos';
  const running = (offerList.data ?? []).map((o) => timeLeftMs(o.ends_at)).filter((ms) => ms > 0).sort((x, y) => x - y)[0];
  const hasRunning = running !== undefined;
  const stockAlert = (insights.data ?? []).find((i) => i.kind === 'soon' || i.kind === 'out' || i.kind === 'low');
  const nItems = items.data?.length ?? 0;
  const nUnanswered = unansweredQ.data?.data?.length ?? 0;
  const spaces: { key: string; title: string; sub: string; symbol?: EmpreProduct; alert?: boolean; onPress: () => void }[] = [
    ...(FEATURES.ledger ? [{ key: 'finance', title: 'Finanzas', sub: soldToday > 0 ? `Hoy ${formatPesos(soldToday)}` : 'Tu caja y lo que te deben', symbol: 'finance' as const, onPress: finance }] : []),
    { key: 'products', title: short, sub: stockAlert ? stockAlert.title : nItems > 0 ? (nItems === 1 ? '1 en tu catálogo' : `${nItems} en tu catálogo`) : `Agrega lo que ${copy.kind === 'service' ? 'ofreces' : 'vendes'}`, alert: Boolean(stockAlert), onPress: products },
    ...(FEATURES.agenda ? [{ key: 'agenda', title: 'Agenda', sub: requests > 0 ? `${requests} por responder` : confirmed > 0 ? (confirmed === 1 ? '1 cita hoy' : `${confirmed} citas hoy`) : 'Sin citas por ahora', symbol: 'agenda' as const, alert: requests > 0, onPress: agenda }] : []),
    { key: 'offers', title: 'Ofertas', sub: hasRunning ? timeLeftLabel(running) : 'Publica una', symbol: 'offers', onPress: offers },
  ];
  const later: HubRow[] = [
    { key: 'profile', icon: 'person-outline', title: 'Perfil público', sub: b.is_verified ? 'Nombre, horario, ubicación y contacto' : 'Aún sin verificar · nombre, horario y contacto', onPress: edit },
    { key: 'photos', icon: 'images-outline', title: 'Fotos y videos', sub: `${b.photos?.length ?? 0} publicadas · súbelas y edítalas aquí`, onPress: photos },
    { key: 'teach', icon: 'sparkles-outline', symbol: 'ai', product: 'Empre AI', title: 'Enséñale a Empre AI', sub: nUnanswered ? (nUnanswered === 1 ? '1 pregunta que no supo responder' : `${nUnanswered} preguntas que no supo responder`) : 'Lo que responde por ti en tu chat', alert: nUnanswered > 0, onPress: go({ pathname: '/business/teach/[id]', params: { id: entityId } }) },
    { key: 'reviews', icon: 'star-outline', title: 'Reseñas', sub: b.review_count > 0 ? (b.review_count === 1 ? '1 reseña' : `${b.review_count} reseñas`) : 'Aparecen cuando te visiten', onPress: go({ pathname: '/business/reviews/[id]', params: { id: entityId } }) },
    ...(FEATURES.agenda ? [{ key: 'agent', icon: 'chatbubble-ellipses-outline' as const, symbol: 'agent' as const, product: 'Empre Agent', title: 'Citas con Agent', sub: 'Lo que resolvió solo y lo que espera tu decisión', onPress: go({ pathname: '/business/agent/[id]', params: { id: entityId, name: b.name } }) }] : []),
    ...(FEATURES.ledger && FEATURES.tabs ? [{ key: 'tabs', icon: (b.business_profile === 'food' ? 'restaurant-outline' : 'receipt-outline') as IconName, title: b.business_profile === 'food' ? 'Mesas' : 'Cuentas abiertas', sub: b.business_profile === 'food' ? 'Lo que va pidiendo cada mesa, y cobrar al final' : 'Para clientes que piden varias cosas y pagan al final', onPress: go({ pathname: '/business/ledger/tabs/[id]', params: { id: entityId } }) }] : []),
    { key: 'practice', icon: 'school-outline', title: 'Practicar el canje', sub: 'Con un QR de práctica: no cuenta como venta', onPress: go('/business/practice') },
    { key: 'sub', icon: 'diamond-outline', title: 'Suscripción del negocio', sub: 'Tu plan y pagos', alert: requiresPayment, onPress: go({ pathname: '/business/subscription/[id]', params: { id: entityId } }) },
  ];
  const renderRows = (list: HubRow[]) => list.map(({ key, ...r }, i) => <SystemRow key={key} first={i === 0} {...r} />);

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}>
        {/* Varios negocios: una casilla para cambiar sin salir (tablero «Mi negocio»). */}
        <View style={styles.switchRow}>
          <BusinessSwitcher currentId={entityId} onPick={(id) => router.replace({ pathname: '/business/hub/[id]', params: { id } })} onAdd={() => router.push('/business/new')} />
        </View>
        {/* Así te ven: ocupa el lugar del encabezado, así que no empuja nada hacia abajo. */}
        <View style={styles.seen}>
          <Cover photo={b.banner_url} category={b.category?.name} icon={b.category?.icon} style={styles.seenCover}>
            <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.back}>
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
            <Pressable accessibilityRole="link" accessibilityLabel={`${b.name}. Ver cómo te ven`} onPress={profile} style={({ pressed }) => [styles.seenBody, pressed && { opacity: 0.9 }]}>
              <View style={styles.seenAvatar}>
                {b.profile_url ? <Avatar uri={b.profile_url} name={b.name} size={44} /> : <Ionicons name={displayIcon(b.category?.icon) as IconName} size={20} color={colors.ink} />}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text style={styles.seenName} numberOfLines={1} accessibilityRole="header">
                  {b.name}
                </Text>
                <Text style={styles.seenMeta} numberOfLines={1}>
                  {[b.is_open_now ? 'Abierto' : 'Cerrado', b.review_count > 0 ? b.avg_rating.toFixed(1).replace('.', ',') : null, nFollowers > 0 ? `${nFollowers} ${nFollowers === 1 ? 'seguidor' : 'seguidores'}` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={styles.seenLink}>Ver perfil</Text>
            </Pressable>
          </Cover>
        </View>

        {requiresPayment ? (
          <SystemGroup>
            <SystemRow first icon="sparkles" title="Tu prueba gratis terminó" sub="Actívalo pronto o tu negocio se ocultará del mapa y las búsquedas." alert onPress={go({ pathname: '/business/subscription/[id]', params: { id: entityId } })} />
          </SystemGroup>
        ) : null}

        {/* El día en una frase, armada con plantillas (tablero «Mi negocio · Hoy»): solo lo que sí pasó. */}
        <Text style={styles.daySentence} accessibilityRole="header">
          {(FEATURES.agenda && confirmed) || requests || soldToday > 0 ? (
            <>
              Hoy {FEATURES.agenda && confirmed ? <>tienes <Text style={styles.dsAgenda}>{`${confirmed} ${confirmed === 1 ? 'cita' : 'citas'}`}</Text></> : null}
              {FEATURES.agenda && confirmed && requests ? ', ' : ''}
              {requests ? <Text style={styles.dsUnder}>{`${requests} por responder`}</Text> : null}
              {soldToday > 0 ? <>{(FEATURES.agenda && confirmed) || requests ? ' y llevas ' : 'llevas '}<Text style={styles.dsMoney}>{formatPesos(soldToday)}</Text></> : null}.
            </>
          ) : (
            'Hoy todavía no hay movimiento. Empieza por lo de abajo.'
          )}
        </Text>
        <View style={styles.main}>
          {FEATURES.ledger && soldToday > 0 ? (
            <View style={styles.mainTop}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Hoy vas ${formatPesos(soldToday)}. Abrir Finanzas`} onPress={finance} style={styles.today}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.label}>Hoy vas</Text>
                  <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPesos(soldToday)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.ink} />
              </Pressable>
            </View>
          ) : null}
          {steps.length ? (
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
          ) : (
            <View style={styles.mainFoot}>
              <View style={styles.footText} accessibilityLiveRegion="polite">
                <Text style={styles.footHead} numberOfLines={1}>
                  {soldToday > 0 ? 'Sin citas por ahora' : 'Aún sin ventas hoy'}
                </Text>
                <Text style={styles.footSub} numberOfLines={1}>
                  {soldToday > 0 ? '¿Vendiste algo más?' : 'Toma dos toques registrar la primera'}
                </Text>
              </View>
              <Pressable accessibilityRole="button" onPress={sale} style={styles.btnRed}>
                <Text style={styles.btnRedText}>Registrar venta</Text>
              </Pressable>
            </View>
          )}
        </View>

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

        <GrowthCard entityId={entityId} onGo={(g) => (g === 'catalog' ? products() : g === 'offer' ? offers() : g === 'photos' ? photos() : edit())} />

        <View style={styles.spaces} accessibilityRole="menu" accessibilityLabel="Tus espacios">
          {spaces.map((s) => (
            <Pressable key={s.key} accessibilityRole="button" accessibilityLabel={`${s.title}. ${s.sub}`} onPress={s.onPress} style={({ pressed }) => [styles.space, pressed && { opacity: 0.85 }]}>
              {s.symbol ? <EmpreSymbol product={s.symbol} size={28} animated={false} /> : <Ionicons name="cube-outline" size={24} color={colors.ink} />}
              {s.alert ? <View style={styles.spaceDot} /> : null}
              <View style={{ gap: 1 }}>
                <Text style={styles.spaceTitle} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={styles.spaceSub} numberOfLines={2}>
                  {s.sub}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Lo de todos los días</Text>
          <View style={styles.tiles}>
            {/* Las tres del tablero «Mi negocio»: canjear y anotar un gasto viven en el botón Empre y en tu perfil */}
            <ActionTile icon="add-circle-outline" label={copy.kind === 'service' ? 'Subir un servicio' : 'Subir un producto'} onPress={go({ pathname: '/business/products/item', params: { entityId } })} />
            <ActionTile icon="pricetag-outline" label="Crear una oferta" onPress={offers} />
            {FEATURES.ledger ? <ActionTile icon="cash-outline" label="Anotar una venta" onPress={sale} /> : null}
          </View>
        </View>

        <SystemSection title="Lo de vez en cuando">
          <SystemGroup>{renderRows(later)}</SystemGroup>
        </SystemSection>
      </ScrollView>
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
  draftWho: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  draftText: { fontSize: 15, lineHeight: 21, fontFamily: fonts.ui.semibold, color: colors.ink },
  draftBold: { fontFamily: fonts.ui.extrabold },
  draftQuote: { fontSize: 15, lineHeight: 21, fontFamily: fonts.ui.extrabold, color: colors.ink },
  draftBtns: { flexDirection: 'row', gap: 8, marginTop: 2 },
  draftBtn: { flex: 1, alignItems: 'center' },
  draftEdit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.nightSoft },
  draftEditText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  switchRow: { flexDirection: 'row', marginBottom: 12 },
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, gap: 16 },
  main: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  mainTop: { gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  big: { fontSize: 30, lineHeight: 34, fontFamily: fonts.display.bold, color: colors.finance, fontVariant: ['tabular-nums'] },
  label: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  // «Lo que sigue»: la hora a la izquierda (roja si es ahora), qué es y, si pide algo, el botón.
  next: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  nextRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  nextHour: { width: 52, fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  nextHourNow: { color: colors.agenda },
  nextTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  nextSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  nextCta: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 18, borderWidth: 1.5, borderColor: colors.nightSoft },
  nextCtaText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  daySentence: { fontFamily: fonts.display.bold, fontSize: 22, lineHeight: 26, color: colors.ink, marginBottom: 12 },
  dsAgenda: { color: colors.agenda },
  dsUnder: { textDecorationLine: 'underline' },
  dsMoney: { color: colors.finance },
  mainFoot: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 16, paddingRight: 12 },
  footText: { flex: 1, minWidth: 0, gap: 2 },
  footHead: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: colors.ink },
  footSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  btnRed: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary },
  btnRedText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  tiles: { flexDirection: 'row', gap: 8 },
  seen: { borderRadius: 20, overflow: 'hidden', ...softShadow },
  seenCover: { height: 136, justifyContent: 'flex-end' },
  // Un velo bajo el nombre: sobre una foto clara el texto blanco se seguiría leyendo.
  seenBody: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(11, 21, 38, 0.55)' },
  seenLink: { flexShrink: 0, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: '#fff', textDecorationLine: 'underline' },
  back: { position: 'absolute', top: 10, left: 10, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  today: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  spaces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  space: { width: '48.8%', minHeight: 92, justifyContent: 'space-between', gap: 6, padding: 12, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  spaceDot: { position: 'absolute', top: 12, right: 12, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  spaceTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  spaceSub: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.ui.semibold, color: colors.muted },
  seenAvatar: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  seenName: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: '#fff' },
  seenMeta: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#fff' },
});
