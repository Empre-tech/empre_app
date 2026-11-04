import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment } from '@/api/agenda';
import { claimsApi } from '@/api/offers';
import type { OfferClaim } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { loadSavedClaims } from '@/claims/claimStore';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { SignInPrompt } from '@/components/SignInPrompt';
import { formatWhen, STATUS_LABEL } from '@/lib/agendaFormat';
import { effectiveClaimStatus, mergeClaims } from '@/lib/claims';
import { formatPesos } from '@/lib/ledger';
import { loadSavedPlans, planHour, planKey, planTag, planTitle } from '@/lib/plans';
import { useNow } from '@/lib/useNow';
import { colors, fonts, softShadow } from '@/theme';

const claimDate = (c: OfferClaim) => c.redeemed_at ?? c.claimed_at;

/** Lo que se ahorró en un canje: solo si la oferta trae los dos precios. */
function savedIn(c: OfferClaim): number {
  const { reference_price: was, special_price: now } = c.offer ?? {};
  return was && now && was > now ? was - now : 0;
}

const dayOf = (iso: string) => new Date(iso).toDateString();
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Mis salidas: lo ahorrado, lo de hoy en orden, tus QR activos y el diario del barrio por días. */
export default function SalidasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, user } = useAuth();
  const signedIn = status === 'signedIn' && Boolean(user);
  const now = useNow(30_000);

  const mine = useQuery({ queryKey: ['claims', 'mine'], queryFn: claimsApi.mine, enabled: signedIn, retry: false, staleTime: 15_000 });
  const saved = useQuery({ queryKey: ['claims', 'saved', user?.id], queryFn: () => loadSavedClaims(user!.id), enabled: signedIn });
  const appts = useQuery({ queryKey: ['appointments'], queryFn: agendaApi.mine, enabled: signedIn });

  const claims = useMemo(() => mergeClaims(mine.data ?? [], saved.data ?? []), [mine.data, saved.data]);
  const live = claims.filter((c) => effectiveClaimStatus(c, now) === 'RECLAMADO');
  const redeemed = claims.filter((c) => effectiveClaimStatus(c, now) === 'CANJEADO');
  const upcoming = (appts.data ?? [])
    .filter((a) => (a.status === 'requested' || a.status === 'confirmed') && Date.parse(a.ends_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = redeemed.filter((c) => Date.parse(claimDate(c)) >= monthStart.getTime());
  const savedMonth = thisMonth.reduce((s, c) => s + savedIn(c), 0);
  const places = new Set(thisMonth.map((c) => c.entity_name).filter(Boolean)).size;
  const faces = [...new Map(thisMonth.map((c) => [c.entity_name ?? c.id, c])).values()].slice(0, 4);
  const [stackOpen, setStackOpen] = useState(false);
  const plans = useQuery({ queryKey: ['saved-plans'], queryFn: loadSavedPlans });
  const [openDay, setOpenDay] = useState<string | null>(null);

  // Hoy, en orden: lo canjeado, los QR listos y las citas de hoy.
  const todayKey = new Date(now).toDateString();
  type Stop = { key: string; at: string; title: string; sub: string; state: string; done: boolean; hot: boolean; open: () => void };
  type Entry = { key: string; at: string; biz: string; title: string; saved: number; stamp: string; open: () => void };
  const openClaim = (c: OfferClaim) => router.push({ pathname: '/offer/claim', params: { claimId: c.id, offerId: c.offer_id } });
  const openAppt = (a: Appointment) => router.push({ pathname: '/appointment/[id]', params: { id: a.id } });
  const diary: Entry[] = [
    ...redeemed.map((c): Entry => ({ key: `c${c.id}`, at: claimDate(c), biz: c.entity_name ?? 'Negocio', title: c.offer?.title ?? 'Oferta', saved: savedIn(c), stamp: 'CANJEADO', open: () => openClaim(c) })),
    ...(appts.data ?? []).filter((a) => a.status === 'completed').map((a): Entry => ({ key: `a${a.id}`, at: a.starts_at, biz: a.entity?.name ?? 'Negocio', title: a.service?.name ?? 'Cita', saved: 0, stamp: 'ATENDIDA', open: () => openAppt(a) })),
  ].sort((x, y) => y.at.localeCompare(x.at));

  // El plan guardado de hoy: sus paradas, y qué pasó con cada oferta.
  const todayPlan = (plans.data ?? []).find((p) => p.times[0] && dayOf(p.times[0]) === todayKey) ?? null;
  const inPlan = new Set(todayPlan?.stops.map((x) => x.id) ?? []);
  const planStops: Stop[] = (todayPlan?.stops ?? []).map((x, i) => {
    const c = claims.find((k) => k.offer_id === x.id && effectiveClaimStatus(k, now) !== 'CANCELADO' && effectiveClaimStatus(k, now) !== 'EXPIRADO');
    const st = c ? effectiveClaimStatus(c, now) : null;
    const hour = todayPlan?.times[i];
    if (c && st === 'CANJEADO') return { key: `p${x.id}`, at: claimDate(c), title: x.entity_name, sub: x.title, state: `Canjeado a las ${planHour(claimDate(c))}`, done: true, hot: false, open: () => openClaim(c) };
    if (c) return { key: `p${x.id}`, at: hour ?? c.claimed_at, title: x.entity_name, sub: x.title, state: `QR listo · vence en ${mmss(Date.parse(c.expires_at) - now)}`, done: false, hot: true, open: () => openClaim(c) };
    return { key: `p${x.id}`, at: hour ?? '', title: x.entity_name, sub: x.title, state: hour ? `Por reclamar · ${planHour(hour)}` : 'Por reclamar', done: false, hot: false, open: () => router.push({ pathname: '/offer/[id]', params: { id: x.id, entityId: x.entity_id } }) };
  });
  const otherStops: Stop[] = [
    ...redeemed.filter((c) => dayOf(claimDate(c)) === todayKey && !inPlan.has(c.offer_id)).map((c): Stop => ({ key: `r${c.id}`, at: claimDate(c), title: c.entity_name ?? 'Negocio', sub: c.offer?.title ?? 'Oferta', state: `Canjeado a las ${planHour(claimDate(c))}`, done: true, hot: false, open: () => openClaim(c) })),
    ...live.filter((c) => !inPlan.has(c.offer_id)).map((c): Stop => ({ key: `l${c.id}`, at: c.claimed_at, title: c.entity_name ?? 'Negocio', sub: c.offer?.title ?? 'Oferta', state: `QR listo · vence en ${mmss(Date.parse(c.expires_at) - now)}`, done: false, hot: true, open: () => openClaim(c) })),
    ...upcoming.filter((a) => dayOf(a.starts_at) === todayKey).map((a): Stop => ({ key: `a${a.id}`, at: a.starts_at, title: a.entity?.name ?? 'Cita', sub: a.service?.name ?? 'Cita', state: `Cita a las ${planHour(a.starts_at)} · ${STATUS_LABEL[a.status]}`, done: false, hot: false, open: () => openAppt(a) })),
  ].sort((x, y) => x.at.localeCompare(y.at));
  const stops = [...planStops, ...otherStops];
  const doneStops = stops.filter((x) => x.done).length;
  const laterAppts = upcoming.filter((a) => dayOf(a.starts_at) !== todayKey);
  const days = useMemo(() => {
    const out: { key: string; label: string; saved: number; items: Entry[] }[] = [];
    for (const d of diary) {
      const key = dayOf(d.at);
      let g = out.find((x) => x.key === key);
      if (!g) {
        const label = new Date(d.at).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }).replace(',', '').toUpperCase();
        g = { key, label: key === todayKey ? `HOY · ${label}` : label, saved: 0, items: [] };
        out.push(g);
      }
      g.saved += d.saved;
      g.items.push(d);
    }
    return out.slice(0, 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.data, saved.data, appts.data, todayKey]);

  const empty = !live.length && !upcoming.length && !diary.length;
  const loading = mine.isLoading || appts.isLoading;

  if (status !== 'loading' && !signedIn) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <SignInPrompt title="Mis salidas" message="Inicia sesión para ver tus QR, tus citas y lo que has ahorrado." />
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 }]}
      refreshControl={<RefreshControl refreshing={mine.isRefetching} onRefresh={() => { void mine.refetch(); void appts.refetch(); }} />}
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Mis salidas
        </Text>
      </View>

      {savedMonth > 0 ? (
        <View style={styles.summary}>
          {faces.length ? (
            <View style={styles.faces} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {faces.map((c, i) => (
                <View key={c.id} style={[styles.face, i > 0 && { marginLeft: -8 }]}>
                  <Avatar uri={undefined} name={c.entity_name ?? '?'} size={34} />
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.summaryText}>
            <Text style={styles.summaryLabel}>Este mes ahorraste</Text>
            <Text style={styles.summaryValue}>
              {formatPesos(savedMonth)}
              {places > 0 ? <Text style={styles.summaryIn}>{` en ${places} ${places === 1 ? 'negocio' : 'negocios'}`}</Text> : null}
            </Text>
          </View>
        </View>
      ) : null}

      {!loading && empty ? (
        <EmptyState icon="walk-outline" title="Todavía no tienes salidas" body="Cuando reclames una oferta o pidas una cita, aparecerá aquí." action={{ title: 'Ver ofertas', onPress: () => router.push('/(tabs)/offers') }} />
      ) : null}

      {stops.length ? (
        <View style={styles.sectionBox}>
          <View style={styles.sectionHead}>
            <Text style={styles.section} accessibilityRole="header">
              Hoy, en curso
            </Text>
            <Text style={styles.progress}>{`${doneStops} de ${stops.length} ${stops.length === 1 ? 'parada' : 'paradas'}`}</Text>
          </View>
          <View style={styles.today}>
            {todayPlan ? (
              <>
                <Text style={styles.eyebrow}>{planTag(todayPlan)}</Text>
                <Text style={styles.planName}>{planTitle(todayPlan)}</Text>
              </>
            ) : null}
            {stops.map((x, i) => (
              <Pressable key={x.key} accessibilityRole="button" accessibilityLabel={`${x.title}. ${x.sub}. ${x.state}`} onPress={x.open} style={({ pressed }) => [styles.stop, pressed && { opacity: 0.85 }]}>
                <View style={styles.rail}>
                  <View style={[styles.stopDot, x.done && styles.stopDotDone, x.hot && styles.stopDotHot]}>
                    <Ionicons name={x.done ? 'checkmark' : x.hot ? 'qr-code-outline' : 'time-outline'} size={17} color={x.done ? '#fff' : x.hot ? colors.ink : colors.faint} />
                  </View>
                  {i < stops.length - 1 ? <View style={[styles.railLine, x.done && { backgroundColor: colors.verified }]} /> : null}
                </View>
                <View style={styles.stopBody}>
                  <View style={styles.stopTop}>
                    <Text style={styles.stopTitle} numberOfLines={1}>
                      {x.title}
                    </Text>
                    {x.done ? (
                      <View style={styles.stamp}>
                        <Text style={styles.stampText}>CANJEADO</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.stopSub} numberOfLines={1}>
                    {x.sub}
                  </Text>
                  <Text style={[styles.stopState, x.hot && { color: colors.accentInk }, x.done && { color: colors.verified }]}>{x.state}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.sectionBox}>
        <View style={styles.sectionHead}>
          <Text style={styles.section} accessibilityRole="header">
            Tus QR activos
          </Text>
          {live.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={() => setStackOpen((v) => !v)} style={styles.linkTap}>
              <Text style={styles.link}>{stackOpen ? 'Apilar' : 'Ver todos'}</Text>
            </Pressable>
          ) : null}
        </View>
        {live.length ? (
          <View style={stackOpen ? { gap: 10 } : { height: 76 + (live.length - 1) * 10 }}>
            {live.map((c, i) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`${c.entity_name ?? 'Negocio'}. ${c.offer?.title ?? 'Oferta'}. Vence en ${mmss(Date.parse(c.expires_at) - now)}`}
                onPress={() => openClaim(c)}
                style={[styles.ticket, !stackOpen && { position: 'absolute', left: 0, right: 0, top: i * 10, zIndex: 10 - i, transform: [{ scale: 1 - i * 0.03 }] }]}
              >
                <View style={styles.ticketIcon}>
                  <Ionicons name="qr-code-outline" size={22} color="#fff" />
                </View>
                <View style={styles.ticketText}>
                  <Text style={styles.ticketBiz} numberOfLines={2}>
                    {c.entity_name ?? 'Negocio'}
                  </Text>
                  <Text style={styles.ticketOffer} numberOfLines={1}>
                    {c.offer?.title ?? 'Oferta'}
                  </Text>
                </View>
                <View style={styles.left}>
                  <Text style={styles.leftText}>Vence en {mmss(Date.parse(c.expires_at) - now)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.none}>No tienes QR por usar. Cuando reclames una oferta, su sobre aparece aquí.</Text>
        )}
      </View>

      {plans.data?.length ? (
        <Section title="Planes guardados">
          {plans.data.map((p, i) => (
            <Row key={planKey(p)} first={i === 0} icon="map-outline" title={planTitle(p)} sub={p.stops.map((x) => x.entity_name).join(' · ')} onPress={() => router.push({ pathname: '/plan', params: { plan: JSON.stringify(p) } })} />
          ))}
        </Section>
      ) : null}

      {laterAppts.length ? (
        <Section title="Lo que sigue">
          {laterAppts.map((a, i) => (
            <Row key={a.id} first={i === 0} icon="calendar-outline" title={a.service?.name ?? 'Cita'} sub={[a.entity?.name, formatWhen(a.starts_at)].filter(Boolean).join(' · ')} tag={STATUS_LABEL[a.status]} onPress={() => openAppt(a)} />
          ))}
        </Section>
      ) : null}

      {days.length ? (
        <View style={styles.sectionBox}>
          <Text style={styles.section} accessibilityRole="header">
            Tu diario del barrio
          </Text>
          {days.map((d) => {
            const isOpen = openDay === d.key;
            const head = d.items.length === 1 ? d.items[0].title : `${d.items[0].title} y ${d.items.length - 1} más`;
            return (
              <View key={d.key} style={styles.day}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpenDay(isOpen ? null : d.key)} style={styles.dayHead}>
                  <View style={styles.dayTop}>
                    <Text style={styles.dayDate}>{d.label}</Text>
                    {d.saved > 0 ? <Text style={styles.daySaved}>Ahorraste {formatPesos(d.saved)}</Text> : null}
                  </View>
                  <Text style={styles.dayTitle} numberOfLines={2}>
                    {head}
                  </Text>
                  <View style={styles.dayMarks}>
                    {d.items.slice(0, 6).map((it) => (
                      <View key={it.key} style={styles.mark}>
                        <Ionicons name="checkmark" size={15} color="#fff" />
                      </View>
                    ))}
                    <Text style={styles.dayCount}>{d.items.length === 1 ? '1 salida' : `${d.items.length} salidas`}</Text>
                  </View>
                </Pressable>
                {isOpen
                  ? d.items.map((it) => (
                      <Pressable key={it.key} accessibilityRole="button" onPress={it.open} style={styles.dayItem}>
                        <Text style={styles.itemTime}>{planHour(it.at)}</Text>
                        <View style={styles.itemBody}>
                          <Text style={styles.itemBiz} numberOfLines={1}>
                            {it.biz}
                          </Text>
                          <Text style={styles.itemOffer} numberOfLines={1}>
                            {it.title}
                          </Text>
                        </View>
                        <View style={styles.stamp}>
                          <Text style={styles.stampText}>{it.stamp}</Text>
                        </View>
                      </Pressable>
                    ))
                  : null}
              </View>
            );
          })}
          <Text style={styles.privacy}>Solo tú ves tu diario. Cada negocio sabe lo que hiciste con él, no qué más visitaste.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionBox}>
      <Text style={styles.section} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ first, icon, title, sub, tag, onPress }: { first: boolean; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; tag?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, sub, tag].filter(Boolean).join('. ')} onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && { opacity: 0.85 }]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={colors.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {tag ? <Text style={styles.tag}>{tag}</Text> : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  title: { fontSize: 26, lineHeight: 31, fontFamily: fonts.display.bold, color: colors.ink },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  faces: { flexDirection: 'row' },
  face: { borderRadius: 19, borderWidth: 2.5, borderColor: colors.surface, overflow: 'hidden' },
  summaryText: { flex: 1, minWidth: 0, gap: 2 },
  summaryLabel: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  summaryValue: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display.bold, color: colors.ink },
  summaryIn: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  sectionBox: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  section: { fontSize: 20, lineHeight: 25, fontFamily: fonts.display.bold, color: colors.ink },
  progress: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.verified },
  linkTap: { minHeight: 44, justifyContent: 'center' },
  link: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  today: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 6, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontFamily: fonts.ui.extrabold, color: colors.faint },
  planName: { marginTop: 4, marginBottom: 12, fontSize: 19, lineHeight: 23, fontFamily: fonts.display.bold, color: colors.ink },
  stop: { flexDirection: 'row', gap: 12, minHeight: 72 },
  rail: { width: 36, alignItems: 'center' },
  railLine: { flex: 1, width: 3, borderRadius: 2, backgroundColor: colors.hairline },
  stopDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface },
  stopDotDone: { borderColor: colors.verified, backgroundColor: colors.verified },
  stopDotHot: { borderColor: colors.accent, borderWidth: 3 },
  stopBody: { flex: 1, minWidth: 0, gap: 3, paddingTop: 2, paddingBottom: 12 },
  stopTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stopTitle: { flexShrink: 1, fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  stopSub: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  stopState: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  stamp: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 7, borderWidth: 2, borderColor: colors.verified, transform: [{ rotate: '-6deg' }] },
  stampText: { fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.ui.extrabold, color: colors.verified },
  ticket: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  ticketIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  ticketText: { flex: 1, minWidth: 0, gap: 2 },
  ticketBiz: { fontSize: 15, lineHeight: 19, fontFamily: fonts.ui.extrabold, color: colors.ink },
  ticketOffer: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  left: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: colors.accentSoft },
  leftText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  none: { padding: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  day: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, ...softShadow },
  dayHead: { paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  dayTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  dayDate: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.faint },
  daySaved: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  dayTitle: { fontSize: 17, lineHeight: 21, fontFamily: fonts.display.bold, color: colors.ink },
  dayMarks: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mark: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.verified },
  dayCount: { marginLeft: 'auto', fontSize: 13, fontFamily: fonts.ui.bold, color: colors.muted },
  dayItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  itemTime: { width: 64, fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.muted },
  itemBody: { flex: 1, minWidth: 0 },
  itemBiz: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.ink },
  itemOffer: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  privacy: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  card: { paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 1 },
  tag: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.warning },
});
