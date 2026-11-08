import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment } from '@/api/agenda';
import { answersApi } from '@/api/answers';
import { entitiesApi, paymentsApi } from '@/api/endpoints';
import { ledgerApi } from '@/api/ledger';
import { novedadesApi } from '@/api/novedades';
import { offersApi } from '@/api/offers';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { Avatar } from '@/components/Avatar';
import { Cover } from '@/components/Cover';
import { EmpreSymbol, type EmpreProduct } from '@/components/EmpreSymbol';
import { EmptyState } from '@/components/EmptyState';
import { GrowthCard } from '@/components/profile/GrowthCard';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { ActionTile, StatusCap, SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { FEATURES } from '@/config';
import { catalogCopy } from '@/lib/catalog';
import { addDays, presetRange, todayCO } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { displayIcon } from '@/lib/mapView';
import { timeLeftLabel, timeLeftMs } from '@/lib/offer';
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

const DAY_FROM = 8;
const DAY_TO = 20;
const startCO = (ymd: string) => `${ymd}T00:00:00-05:00`;
const hourOf = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};
const dayPct = (h: number) => Math.max(0, Math.min(100, ((h - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100));
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

/**
 * «Mi negocio», ordenado por lo que el dueño viene a hacer: la portada de cómo lo ven, cómo va hoy con su acción roja, sus
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
  const [selId, setSelId] = useState<string | null>(null);

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
  const nowH = hourOf(new Date().toISOString());
  const next = appts.find((a) => a.status === 'confirmed' && hourOf(a.starts_at) >= nowH);
  const sel: Appointment | undefined = appts.find((a) => a.id === selId) ?? next ?? appts[0];
  const showDay = FEATURES.agenda && (appts.length > 0 || requests > 0);
  // La acción roja cambia con lo que toca: responder si hay una cita pendiente; si no, vender.
  const responding = Boolean(sel && showDay && sel.status === 'requested');
  const who = (a: Appointment) => [a.customer?.name, a.service?.name].filter(Boolean).join(' · ') || 'Cita';

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

        <View style={styles.main}>
          {soldToday > 0 || (FEATURES.agenda && appts.length > 0) ? (
            <View style={styles.mainTop}>
              {FEATURES.ledger ? (
                <Pressable accessibilityRole="button" accessibilityLabel={soldToday > 0 ? `Hoy vas ${formatPesos(soldToday)}. Abrir Finanzas` : 'Aún sin ventas hoy. Abrir Finanzas'} onPress={finance} style={styles.today}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.label}>{soldToday > 0 ? 'Hoy vas' : 'Hoy'}</Text>
                    <Text style={soldToday > 0 ? styles.big : styles.todayWords} numberOfLines={1} adjustsFontSizeToFit>
                      {soldToday > 0 ? formatPesos(soldToday) : 'Aún sin ventas'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.ink} />
                </Pressable>
              ) : null}
              {FEATURES.agenda && appts.length > 0 ? (
                <View style={{ gap: 6 }}>
                  <View style={styles.dayTrack}>
                    {appts.map((a) => {
                      const on = sel?.id === a.id;
                      const pending = a.status === 'requested';
                      return (
                        <Pressable
                          key={a.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${timeOf(a.starts_at)}, ${who(a)}${pending ? ', por responder' : ''}`}
                          onPress={() => setSelId(a.id)}
                          style={[styles.dayBlock, { left: `${dayPct(hourOf(a.starts_at))}%`, width: `${Math.max(5, dayPct(hourOf(a.ends_at)) - dayPct(hourOf(a.starts_at)))}%` }, pending ? styles.dayPending : styles.dayConfirmed, on && styles.dayOn]}
                        />
                      );
                    })}
                    {nowH >= DAY_FROM && nowH <= DAY_TO ? <View pointerEvents="none" style={[styles.dayNow, { left: `${dayPct(nowH)}%` }]} /> : null}
                  </View>
                  <View style={styles.dayLabels}>
                    {['8 am', '12 m', '4 pm', '8 pm'].map((l) => (
                      <Text key={l} style={styles.dayLabel}>
                        {l}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.mainFoot}>
            <View style={styles.footText} accessibilityLiveRegion="polite">
              <Text style={styles.footHead} numberOfLines={1}>
                {sel && showDay ? `${sel.status === 'requested' ? 'Por responder' : 'Cita'}: ${timeOf(sel.starts_at)}` : soldToday > 0 ? 'Sin citas por ahora' : 'Aún sin ventas hoy'}
              </Text>
              <Text style={styles.footSub} numberOfLines={1}>
                {sel && showDay ? who(sel) : soldToday > 0 ? '¿Vendiste algo más?' : 'Toma dos toques registrar la primera'}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={responding ? agenda : sale} style={styles.btnRed}>
              <Text style={styles.btnRedText}>{responding ? 'Responder' : 'Registrar venta'}</Text>
            </Pressable>
          </View>
        </View>

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
            <ActionTile icon="qr-code-outline" label="Canjear" onPress={go('/business/scan')} />
            {FEATURES.ledger ? <ActionTile icon="remove-circle-outline" label="Gasto" onPress={go({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } })} /> : null}
            <ActionTile icon="add-circle-outline" label={copy.kind === 'service' ? 'Agregar servicio' : 'Agregar producto'} onPress={go({ pathname: '/business/products/item', params: { entityId } })} />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, gap: 16 },
  main: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  mainTop: { gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  big: { fontSize: 30, lineHeight: 34, fontFamily: fonts.display.bold, color: colors.ink },
  label: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  dayTrack: { height: 32, borderRadius: 8, justifyContent: 'center', backgroundColor: colors.selectedSoft },
  dayBlock: { position: 'absolute', top: 0, bottom: 0, borderRadius: 6 },
  dayConfirmed: { backgroundColor: colors.ink },
  dayPending: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink },
  dayOn: { shadowColor: colors.ink, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 3, transform: [{ scale: 1.08 }] },
  dayNow: { position: 'absolute', top: -5, bottom: -5, width: 2, backgroundColor: colors.brand },
  dayLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  dayLabel: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.faint },
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
  todayWords: { fontSize: 19, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  spaces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  space: { width: '48.8%', minHeight: 92, justifyContent: 'space-between', gap: 6, padding: 12, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  spaceDot: { position: 'absolute', top: 12, right: 12, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  spaceTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  spaceSub: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.ui.semibold, color: colors.muted },
  seenAvatar: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  seenName: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: '#fff' },
  seenMeta: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#fff' },
});
