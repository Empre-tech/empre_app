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
import { loadSavedPlans, planKey, planTitle } from '@/lib/plans';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

const claimDate = (c: OfferClaim) => c.redeemed_at ?? c.claimed_at;

/** Lo que se ahorró en un canje: solo si la oferta trae los dos precios. */
function savedIn(c: OfferClaim): number {
  const { reference_price: was, special_price: now } = c.offer ?? {};
  return was && now && was > now ? was - now : 0;
}

const dayOf = (iso: string) => new Date(iso).toDateString();
const clock = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min`;
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

  type Entry = { key: string; at: string; title: string; sub: string; saved: number; icon: keyof typeof Ionicons.glyphMap; open: () => void };
  const openClaim = (c: OfferClaim) => router.push({ pathname: '/offer/claim', params: { claimId: c.id, offerId: c.offer_id } });
  const openAppt = (a: Appointment) => router.push({ pathname: '/appointment/[id]', params: { id: a.id } });
  const diary: Entry[] = [
    ...redeemed.map((c): Entry => ({ key: `c${c.id}`, at: claimDate(c), title: c.offer?.title ?? 'Oferta', sub: [c.entity_name, savedIn(c) ? `ahorraste ${formatPesos(savedIn(c))}` : null].filter(Boolean).join(' · '), saved: savedIn(c), icon: 'checkmark-circle-outline', open: () => openClaim(c) })),
    ...(appts.data ?? []).filter((a) => a.status === 'completed').map((a): Entry => ({ key: `a${a.id}`, at: a.starts_at, title: a.service?.name ?? 'Cita', sub: [a.entity?.name, STATUS_LABEL[a.status]].filter(Boolean).join(' · '), saved: 0, icon: 'calendar-outline', open: () => openAppt(a) })),
  ].sort((x, y) => y.at.localeCompare(x.at));

  const stops: Stop[] = [
    ...redeemed.filter((c) => dayOf(claimDate(c)) === todayKey).map((c): Stop => ({ key: `r${c.id}`, at: claimDate(c), title: c.entity_name ?? 'Negocio', sub: c.offer?.title ?? 'Oferta', state: `Canjeado a las ${clock(claimDate(c))}`, done: true, hot: false, open: () => openClaim(c) })),
    ...live.map((c): Stop => ({ key: `l${c.id}`, at: c.claimed_at, title: c.entity_name ?? 'Negocio', sub: c.offer?.title ?? 'Oferta', state: `QR listo · vence en ${mmss(Date.parse(c.expires_at) - now)}`, done: false, hot: true, open: () => openClaim(c) })),
    ...upcoming.filter((a) => dayOf(a.starts_at) === todayKey).map((a): Stop => ({ key: `a${a.id}`, at: a.starts_at, title: a.entity?.name ?? 'Cita', sub: a.service?.name ?? 'Cita', state: `Cita a las ${clock(a.starts_at)} · ${STATUS_LABEL[a.status]}`, done: false, hot: false, open: () => openAppt(a) })),
  ].sort((x, y) => x.at.localeCompare(y.at));
  const doneStops = stops.filter((s) => s.done).length;
  const laterAppts = upcoming.filter((a) => dayOf(a.starts_at) !== todayKey);
  const days = useMemo(() => {
    const out: { key: string; label: string; saved: number; items: Entry[] }[] = [];
    for (const d of diary) {
      const key = dayOf(d.at);
      let g = out.find((x) => x.key === key);
      if (!g) {
        const date = new Date(d.at);
        g = { key, label: (key === todayKey ? `Hoy · ${date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}` : date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })).toUpperCase(), saved: 0, items: [] };
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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={mine.isRefetching} onRefresh={() => { void mine.refetch(); void appts.refetch(); }} />}
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
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
                <View key={c.id} style={[styles.face, i > 0 && { marginLeft: -10 }]}>
                  <Avatar uri={undefined} name={c.entity_name ?? "?"} size={34} />
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.summaryLabel}>Este mes ahorraste</Text>
          <Text style={styles.summaryValue}>
            {formatPesos(savedMonth)}
            {places > 0 ? <Text style={styles.summaryLabel}>{`  en ${places} ${places === 1 ? 'negocio' : 'negocios'}`}</Text> : null}
          </Text>
        </View>
      ) : null}

      {!loading && empty ? (
        <EmptyState icon="walk-outline" title="Todavía no tienes salidas" body="Cuando reclames una oferta o pidas una cita, aparecerá aquí." action={{ title: 'Ver ofertas', onPress: () => router.push('/(tabs)/offers') }} />
      ) : null}

      {stops.length ? (
        <View style={{ gap: spacing.sm }}>
          <View style={styles.sectionHead}>
            <Text style={styles.section}>Hoy, en curso</Text>
            <Text style={styles.summaryLabel}>{`${doneStops} de ${stops.length}`}</Text>
          </View>
          <View style={styles.card}>
            {stops.map((s, i) => (
              <Pressable key={s.key} accessibilityRole="button" accessibilityLabel={`${s.title}. ${s.sub}. ${s.state}`} onPress={s.open} style={({ pressed }) => [styles.stop, pressed && { opacity: 0.85 }]}>
                <View style={styles.rail}>
                  <View style={[styles.stopDot, s.done && styles.stopDotDone, s.hot && styles.stopDotHot]}>
                    <Ionicons name={s.done ? 'checkmark' : s.hot ? 'qr-code' : 'time-outline'} size={14} color={s.done ? '#fff' : colors.ink} />
                  </View>
                  {i < stops.length - 1 ? <View style={[styles.railLine, s.done && { backgroundColor: colors.verified }]} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, paddingBottom: spacing.md }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {s.sub}
                  </Text>
                  <Text style={[styles.stopState, s.hot && { color: colors.warning }, s.done && { color: colors.verified }]}>{s.state}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <View style={styles.sectionHead}>
          <Text style={styles.section}>Tus QR activos</Text>
          {live.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={() => setStackOpen((v) => !v)} hitSlop={8}>
              <Text style={styles.link}>{stackOpen ? 'Apilar' : 'Ver todos'}</Text>
            </Pressable>
          ) : null}
        </View>
        {live.length ? (
          <View style={stackOpen ? { gap: spacing.sm } : { height: 76 + (live.length - 1) * 10 }}>
            {live.map((c, i) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`${c.entity_name ?? 'Negocio'}. ${c.offer?.title ?? 'Oferta'}. Vence en ${mmss(Date.parse(c.expires_at) - now)}`}
                onPress={() => openClaim(c)}
                style={[styles.ticket, !stackOpen && { position: 'absolute', left: 0, right: 0, top: i * 10, zIndex: 10 - i, transform: [{ scale: 1 - i * 0.03 }] }]}
              >
                <Ionicons name="qr-code-outline" size={24} color={colors.ink} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {c.entity_name ?? 'Negocio'}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {c.offer?.title ?? 'Oferta'}
                  </Text>
                </View>
                <Text style={styles.tag}>{mmss(Date.parse(c.expires_at) - now)}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.rowSub}>No tienes QR por usar. Cuando reclames una oferta, su sobre aparece aquí.</Text>
        )}
      </View>

      {plans.data?.length ? (
        <Section title="Planes guardados">
          {plans.data.map((p, i) => (
            <Row
              key={planKey(p)}
              first={i === 0}
              icon="map-outline"
              title={planTitle(p)}
              sub={p.stops.map((s) => s.entity_name).join(' · ')}
              onPress={() => router.push({ pathname: '/plan', params: { plan: JSON.stringify(p) } })}
            />
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
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.section}>Tu diario del barrio</Text>
          {days.map((d) => {
            const isOpen = openDay === d.key || (openDay === null && d.key === days[0].key);
            return (
              <View key={d.key} style={styles.card}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpenDay(isOpen ? '' : d.key)} style={styles.dayHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayLabel}>{d.label}</Text>
                    <Text style={styles.rowSub}>
                      {d.items.length === 1 ? '1 salida' : `${d.items.length} salidas`}
                      {d.saved > 0 ? ` · Ahorraste ${formatPesos(d.saved)}` : ''}
                    </Text>
                  </View>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                </Pressable>
                {isOpen ? d.items.map((e) => <Row key={e.key} first={false} icon={e.icon} title={e.title} sub={e.sub} onPress={e.open} />) : null}
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
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.section}>{title}</Text>
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
  faces: { flexDirection: 'row', marginBottom: spacing.xs },
  face: { borderRadius: 19, borderWidth: 2, borderColor: colors.surface, overflow: 'hidden' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink, textDecorationLine: 'underline' },
  stop: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md },
  rail: { alignItems: 'center', width: 28 },
  railLine: { flex: 1, width: 2, backgroundColor: colors.line, marginTop: 2 },
  stopDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  stopDotDone: { backgroundColor: colors.verified },
  stopDotHot: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.warning },
  stopState: { marginTop: 2, fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  ticket: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60 },
  dayLabel: { fontSize: 12, letterSpacing: 0.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  privacy: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center', marginTop: spacing.xs },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontFamily: fonts.display.bold, color: colors.ink },
  summary: { gap: 2, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  summaryLabel: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  summaryValue: { fontSize: 26, fontFamily: fonts.display.bold, color: colors.ink },
  section: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  card: { paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.selectedSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowSub: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: 1 },
  tag: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.warning },
});
