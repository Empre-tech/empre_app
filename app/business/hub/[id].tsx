import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment } from '@/api/agenda';
import { entitiesApi, paymentsApi } from '@/api/endpoints';
import { ledgerApi } from '@/api/ledger';
import { novedadesApi } from '@/api/novedades';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { Avatar } from '@/components/Avatar';
import { Cover } from '@/components/Cover';
import type { EmpreProduct } from '@/components/EmpreSymbol';
import { EmptyState } from '@/components/EmptyState';
import { GrowthCard } from '@/components/profile/GrowthCard';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { ActionTile, StatusCap, SystemGroup, SystemHead, SystemRow, SystemSection, SystemTitle } from '@/components/system/parts';
import { FEATURES } from '@/config';
import { catalogCopy } from '@/lib/catalog';
import { addDays, presetRange, todayCO } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { displayIcon } from '@/lib/mapView';
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
 * «Mi negocio», el escritorio de quien vende: cómo va hoy en una sola pieza, los accesos de todos los días, cómo te ven
 * y lo demás por grupos. El buscador encuentra funciones, nada más.
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
  const [q, setQ] = useState('');

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const subscription = useQuery({ queryKey: ['subscription', entityId], queryFn: () => paymentsApi.getSubscription(entityId), enabled: Boolean(entityId) });
  const followers = useQuery({ queryKey: ['followers', entityId], queryFn: () => novedadesApi.followers(entityId), enabled: Boolean(entityId) });
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
  const allClear = soldToday === 0 && requests === 0 && appts.length === 0;

  const clients: HubRow[] = [
    { key: 'profile', icon: 'person-outline', title: 'Perfil público', sub: 'Nombre, descripción, horario, ubicación y contacto', onPress: edit },
    { key: 'catalog', icon: 'list-outline', title: FEATURES.ledger && copy.kind !== 'service' ? `${copy.noun} e inventario` : copy.noun, sub: FEATURES.ledger && copy.kind !== 'service' ? 'Lo que vendes, su precio y cuántos te quedan' : 'Lo que ofreces y su precio', onPress: products },
    { key: 'photos', icon: 'images-outline', title: 'Fotos y videos', sub: `${b.photos?.length ?? 0} publicadas · súbelas y edítalas aquí`, onPress: photos },
    { key: 'offers', icon: 'flash-outline', symbol: 'offers', product: 'Empre Offers', title: 'Ofertas', sub: 'Publica y administra tus ofertas', onPress: offers },
  ];
  const mine: HubRow[] = [
    ...(FEATURES.agenda ? [{ key: 'agenda', icon: 'calendar-outline' as const, symbol: 'agenda' as const, product: 'Empre Agenda', title: 'Agenda', sub: requests > 0 ? `${requests} por responder` : 'Solicitudes y reservas', alert: requests > 0, onPress: agenda }] : []),
    ...(FEATURES.agenda ? [{ key: 'agent', icon: 'chatbubble-ellipses-outline' as const, symbol: 'agent' as const, product: 'Empre Agent', title: 'Citas con Agent', sub: 'Lo que resolvió solo y lo que espera tu decisión', onPress: go({ pathname: '/business/agent/[id]', params: { id: entityId, name: b.name } }) }] : []),
    ...(FEATURES.ledger ? [{ key: 'finance', icon: 'wallet-outline' as const, symbol: 'finance' as const, product: 'Empre Finance', title: 'Finanzas', sub: soldToday > 0 ? `Hoy ${formatPesos(soldToday)}` : 'Cómo va el día, fiados y costos', onPress: finance }] : []),
    ...(FEATURES.ledger && FEATURES.tabs ? [{ key: 'tabs', icon: (b.business_profile === 'food' ? 'restaurant-outline' : 'receipt-outline') as IconName, title: b.business_profile === 'food' ? 'Mesas' : 'Cuentas abiertas', sub: b.business_profile === 'food' ? 'Lo que va pidiendo cada mesa, y cobrar al final' : 'Para clientes que piden varias cosas y pagan al final', onPress: go({ pathname: '/business/ledger/tabs/[id]', params: { id: entityId } }) }] : []),
    ...(FEATURES.ledger ? [{ key: 'understand', icon: 'sparkles' as const, symbol: 'ai' as EmpreProduct, product: 'Empre AI', title: 'Entender tu semana', sub: 'Qué pasó, qué no se puede afirmar y qué probar', onPress: go({ pathname: '/business/ledger/plata/[id]', params: { id: entityId } }) }] : []),
    { key: 'write', icon: 'sparkles', symbol: 'ai' as EmpreProduct, product: 'Empre AI', title: 'Escribir con IA', sub: 'Tu descripción: eliges entre varias opciones', onPress: edit },
    { key: 'practice', icon: 'school-outline', title: 'Practicar el canje', sub: 'Con un QR de práctica: no cuenta como venta', onPress: go('/business/practice') },
    { key: 'sub', icon: 'diamond-outline', title: 'Suscripción del negocio', sub: 'Tu plan y pagos', alert: requiresPayment, onPress: go({ pathname: '/business/subscription/[id]', params: { id: entityId } }) },
  ];
  const needle = q.trim().toLowerCase();
  const fits = (r: HubRow) => !needle || `${r.title} ${r.sub} ${r.product ?? ''}`.toLowerCase().includes(needle);
  const shownClients = clients.filter(fits);
  const shownMine = mine.filter(fits);
  const renderRows = (list: HubRow[]) => list.map(({ key, ...r }, i) => <SystemRow key={key} first={i === 0} {...r} />);

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.top}>
          <SystemHead lead="Mi negocio" name={b.name} />
          <SystemTitle>Hoy en tu negocio</SystemTitle>
          <View style={styles.field}>
            <Ionicons name="search" size={20} color={colors.ink} />
            <TextInput value={q} onChangeText={setQ} placeholder="Busca una función" placeholderTextColor={colors.faint} accessibilityLabel="Busca una función de tu negocio" autoCorrect={false} returnKeyType="search" style={styles.input} />
            {q ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" onPress={() => setQ('')} style={styles.clear}>
                <Ionicons name="close" size={16} color={colors.ink} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {needle ? (
          shownClients.length + shownMine.length > 0 ? (
            <SystemGroup>{renderRows([...shownClients, ...shownMine])}</SystemGroup>
          ) : (
            <Text style={styles.none}>No hay ninguna función con «{q.trim()}».</Text>
          )
        ) : (
          <>
            <View style={styles.main}>
              <View style={styles.mainTop}>
                {allClear ? (
                  <View style={{ gap: 4 }}>
                    <Text style={styles.big}>Todo al día</Text>
                    <Text style={styles.calm}>Nada por responder ni citas hoy.</Text>
                  </View>
                ) : (
                  <View style={styles.cifras}>
                    {FEATURES.agenda ? <Cifra n={String(requests)} label="por responder" dot={requests > 0} flex={1.2} /> : null}
                    {FEATURES.agenda ? <Cifra n={String(confirmed)} label="citas hoy" flex={0.8} /> : null}
                    {FEATURES.ledger ? <Cifra n={formatPesos(soldToday)} label="vendido hoy" flex={1.5} /> : null}
                  </View>
                )}
                {FEATURES.agenda ? (
                  <View style={{ gap: 6 }}>
                    <View style={styles.dayTrack}>
                      {appts.length === 0 ? <Text style={styles.dayFree}>Libre todo el día</Text> : null}
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
                      {nowH >= DAY_FROM && nowH <= DAY_TO && appts.length > 0 ? <View pointerEvents="none" style={[styles.dayNow, { left: `${dayPct(nowH)}%` }]} /> : null}
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
              <View style={styles.mainFoot}>
                <View style={styles.footText} accessibilityLiveRegion="polite">
                  <Text style={styles.footHead} numberOfLines={1}>
                    {sel && showDay ? `${sel.status === 'requested' ? 'Por responder' : 'Cita'}: ${timeOf(sel.starts_at)}` : soldToday > 0 ? 'Sin citas por ahora' : 'Aún sin ventas hoy'}
                  </Text>
                  <Text style={styles.footSub} numberOfLines={1}>
                    {sel && showDay ? who(sel) : soldToday > 0 ? `Llevas ${formatPesos(soldToday)} hoy` : 'Aquí las vas a ver'}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" onPress={responding ? agenda : sale} style={styles.btnRed}>
                  <Text style={styles.btnRedText}>{responding ? 'Responder' : 'Registrar venta'}</Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Lo de todos los días</Text>
              <View style={styles.tiles}>
                <ActionTile icon="qr-code-outline" label="Canjear" onPress={go('/business/scan')} />
                {FEATURES.ledger ? <ActionTile icon="remove-circle-outline" label="Gasto" onPress={go({ pathname: '/business/ledger/expense/[id]', params: { id: entityId } })} /> : null}
                {FEATURES.ledger ? <ActionTile icon="people-outline" label="Te deben" onPress={go({ pathname: '/business/ledger/debts/[id]', params: { id: entityId } })} /> : null}
              </View>
            </View>

            {b.is_verified ? null : <Text style={styles.calm}>Aún no está verificado. Puedes administrarlo mientras tanto.</Text>}

            {requiresPayment ? (
              <SystemGroup>
                <SystemRow first icon="sparkles" title="Tu prueba gratis terminó" sub="Actívalo pronto o tu negocio se ocultará del mapa y las búsquedas." alert onPress={go({ pathname: '/business/subscription/[id]', params: { id: entityId } })} />
              </SystemGroup>
            ) : null}

            <SystemSection title="Así te ven" link="Ver perfil" onLink={profile}>
              <Pressable accessibilityRole="link" accessibilityLabel={`${b.name}. Ver cómo te ven`} onPress={profile} style={({ pressed }) => [styles.seen, pressed && { opacity: 0.9 }]}>
                <Cover photo={b.banner_url} category={b.category?.name} icon={b.category?.icon} style={styles.seenCover}>
                  <View style={styles.seenBody}>
                    <View style={styles.seenAvatar}>
                      {b.profile_url ? <Avatar uri={b.profile_url} name={b.name} size={44} /> : <Ionicons name={displayIcon(b.category?.icon) as IconName} size={20} color={colors.ink} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <Text style={styles.seenName} numberOfLines={1}>
                        {b.name}
                      </Text>
                      <Text style={styles.seenMeta} numberOfLines={1}>
                        {[b.is_open_now ? 'Abierto' : 'Cerrado', b.review_count > 0 ? b.avg_rating.toFixed(1).replace('.', ',') : null, nFollowers > 0 ? `${nFollowers} ${nFollowers === 1 ? 'seguidor' : 'seguidores'}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                </Cover>
              </Pressable>
            </SystemSection>

            <GrowthCard entityId={entityId} onGo={(t) => (t === 'catalog' ? products() : t === 'offer' ? offers() : t === 'photos' ? photos() : edit())} />

            <SystemSection title="Lo que ven tus clientes">
              <SystemGroup>{renderRows(clients)}</SystemGroup>
            </SystemSection>

            <SystemSection title="Solo para ti">
              <SystemGroup>{renderRows(mine)}</SystemGroup>
            </SystemSection>
          </>
        )}
      </ScrollView>
      <StatusCap />
    </View>
  );
}

function Cifra({ n, label, dot, flex }: { n: string; label: string; dot?: boolean; flex: number }) {
  return (
    <View style={[styles.cifra, { flex }]}>
      <View style={styles.cifraTop}>
        <Text style={styles.cifraN} numberOfLines={1} adjustsFontSizeToFit>
          {n}
        </Text>
        {dot ? <View style={styles.dot} /> : null}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, gap: 24 },
  top: { gap: 14 },
  field: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 4, borderRadius: 16, backgroundColor: colors.surface, ...softShadow },
  input: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  clear: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  none: { textAlign: 'center', fontSize: 14.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  main: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  mainTop: { minHeight: 168, justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.selectedSoft },
  big: { fontSize: 28, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink },
  calm: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted },
  cifras: { flexDirection: 'row', gap: 12 },
  cifra: { minWidth: 0, gap: 2 },
  cifraTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cifraN: { flexShrink: 1, fontSize: 28, lineHeight: 32, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  label: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  dayTrack: { height: 32, borderRadius: 8, justifyContent: 'center', backgroundColor: colors.selectedSoft },
  dayFree: { paddingLeft: 12, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  dayBlock: { position: 'absolute', top: 0, bottom: 0, borderRadius: 6 },
  dayConfirmed: { backgroundColor: colors.ink },
  dayPending: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink },
  dayOn: { shadowColor: colors.ink, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 3, transform: [{ scale: 1.08 }] },
  dayNow: { position: 'absolute', top: -5, bottom: -5, width: 2, backgroundColor: colors.brand },
  dayLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  dayLabel: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.faint },
  mainFoot: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 12 },
  footText: { flex: 1, minWidth: 0, gap: 2 },
  footHead: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: colors.ink },
  footSub: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  btnRed: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.primary },
  btnRedText: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: '#fff' },
  tiles: { flexDirection: 'row', gap: 8 },
  seen: { borderRadius: 20, overflow: 'hidden', ...softShadow },
  seenCover: { height: 96, justifyContent: 'flex-end' },
  seenBody: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12 },
  seenAvatar: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  seenName: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.bold, color: '#fff' },
  seenMeta: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: '#fff' },
});
