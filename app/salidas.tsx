import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agendaApi, type Appointment } from '@/api/agenda';
import { claimsApi } from '@/api/offers';
import type { OfferClaim } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { loadSavedClaims } from '@/claims/claimStore';
import { EmptyState } from '@/components/EmptyState';
import { SignInPrompt } from '@/components/SignInPrompt';
import { formatWhen, STATUS_LABEL } from '@/lib/agendaFormat';
import { effectiveClaimStatus, mergeClaims } from '@/lib/claims';
import { formatPesos } from '@/lib/ledger';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

const claimDate = (c: OfferClaim) => c.redeemed_at ?? c.claimed_at;

/** Lo que se ahorró en un canje: solo si la oferta trae los dos precios. */
function savedIn(c: OfferClaim): number {
  const { reference_price: was, special_price: now } = c.offer ?? {};
  return was && now && was > now ? was - now : 0;
}

/** Mis salidas: lo que sigue (QR vigentes y citas) y el diario de lo que ya pasó, con lo ahorrado este mes. */
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

  type Entry = { key: string; at: string; title: string; sub: string; icon: keyof typeof Ionicons.glyphMap; open: () => void };
  const openClaim = (c: OfferClaim) => router.push({ pathname: '/offer/claim', params: { claimId: c.id, offerId: c.offer_id } });
  const openAppt = (a: Appointment) => router.push({ pathname: '/appointment/[id]', params: { id: a.id } });
  const diary: Entry[] = [
    ...redeemed.map((c): Entry => ({ key: `c${c.id}`, at: claimDate(c), title: c.offer?.title ?? 'Oferta', sub: [c.entity_name, savedIn(c) ? `ahorraste ${formatPesos(savedIn(c))}` : null].filter(Boolean).join(' · '), icon: 'checkmark-circle-outline', open: () => openClaim(c) })),
    ...(appts.data ?? []).filter((a) => a.status === 'completed').map((a): Entry => ({ key: `a${a.id}`, at: a.starts_at, title: a.service?.name ?? 'Cita', sub: [a.entity?.name, STATUS_LABEL[a.status]].filter(Boolean).join(' · '), icon: 'calendar-outline', open: () => openAppt(a) })),
  ].sort((x, y) => y.at.localeCompare(x.at));

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

      {live.length || upcoming.length ? (
        <Section title="Lo que sigue">
          {live.map((c, i) => (
            <Row key={c.id} first={i === 0} icon="qr-code-outline" title={c.offer?.title ?? 'Oferta'} sub={c.entity_name ?? ''} tag={`Vence ${new Date(c.expires_at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}`} onPress={() => openClaim(c)} />
          ))}
          {upcoming.map((a, i) => (
            <Row key={a.id} first={i === 0 && !live.length} icon="calendar-outline" title={a.service?.name ?? 'Cita'} sub={[a.entity?.name, formatWhen(a.starts_at)].filter(Boolean).join(' · ')} tag={STATUS_LABEL[a.status]} onPress={() => openAppt(a)} />
          ))}
        </Section>
      ) : null}

      {diary.length ? (
        <Section title="Tu diario del barrio">
          {diary.slice(0, 20).map((d, i) => (
            <Row key={d.key} first={i === 0} icon={d.icon} title={d.title} sub={d.sub} onPress={d.open} />
          ))}
        </Section>
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
