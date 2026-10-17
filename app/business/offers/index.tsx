import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { offersApi } from '@/api/offers';
import type { Offer, OfferStat, OfferStatsSummary } from '@/api/types';
import { OfferTicket } from '@/components/offer/OfferTicket';
import { formatEnded, offerTypeLabel } from '@/lib/offer';
import { topOffers } from '@/lib/offerInsights';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Ofertas del negocio (dueño), maqueta `ofertas_dueno.html`: arriba «Cómo te va» (o, sin datos suficientes, cuánto
 * falta); las activas con la misma tarjeta que ve el cliente y sus acciones rápidas; «Tus mejores ofertas»; y las
 * terminadas con sus resultados en lugar de cupos, «Cómo te fue» y «Volver a publicar».
 */
export default function OffersScreen() {
  const { entityId } = useLocalSearchParams<{ entityId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const [busyId, setBusyId] = useState<string | null>(null);

  const offers = useQuery({ queryKey: ['offers', entityId], queryFn: () => offersApi.list(entityId ?? ''), enabled: Boolean(entityId) });
  const stats = useQuery({ queryKey: ['offer-stats', entityId], queryFn: () => offersApi.stats(entityId ?? ''), enabled: Boolean(entityId), staleTime: 60_000 });

  const all = offers.data ?? [];
  const active = all.filter((o) => new Date(o.ends_at).getTime() > now);
  const statOf = new Map((stats.data?.offers ?? []).map((s) => [s.offer_id, s]));
  const finished = all.filter((o) => new Date(o.ends_at).getTime() <= now);
  const summary = stats.data?.summary;
  const best = topOffers(stats.data?.offers ?? [], summary);

  const quickAction = async (offerId: string, action: 'extend' | 'slots', value: number) => {
    setBusyId(offerId);
    try {
      await offersApi.quickAction(offerId, action, value);
      await queryClient.invalidateQueries({ queryKey: ['offers', entityId] });
    } finally {
      setBusyId(null);
    }
  };
  const openResult = (offerId: string) => router.push({ pathname: '/business/offers/result', params: { entityId, offerId } });
  const republish = (offerId: string) => router.push({ pathname: '/business/offers/new', params: { entityId, from: offerId } });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Ofertas
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/offers/new', params: { entityId } })} style={styles.newBtn}>
          <Text style={styles.link}>+ Nueva oferta</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}>
        {summary ? <HowItGoes summary={summary} /> : null}

        <Text style={styles.section}>{active.length > 1 ? 'Activas' : 'Activa'}</Text>
        {offers.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : active.length === 0 ? (
          <Text style={styles.empty}>No tienes ofertas activas.</Text>
        ) : (
          active.map((offer) => (
            <View key={offer.id} style={styles.activeWrap}>
              <OfferTicket offer={offer} />
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={() => void quickAction(offer.id, 'extend', 30)} disabled={busyId === offer.id} style={styles.action}>
                  <Ionicons name="time-outline" size={16} color={colors.primary} />
                  <Text style={styles.actionText}>Extender 30 min</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => void quickAction(offer.id, 'slots', 5)} disabled={busyId === offer.id} style={styles.action}>
                  <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                  <Text style={styles.actionText}>+5 cupos</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {best.length > 0 ? (
          <>
            <Text style={styles.section}>Tus mejores ofertas</Text>
            {best.map((s, i) => (
              <Pressable key={s.offer_id} accessibilityRole="button" accessibilityLabel={`${i + 1}. ${s.title}, ${s.redeemed} canjes`} onPress={() => openResult(s.offer_id)} style={styles.bestRow}>
                <Text style={styles.bestRank}>{i + 1}</Text>
                <View style={styles.bestText}>
                  <Text style={styles.bestTitle} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={styles.bestSub}>
                    {s.redeemed} {s.redeemed === 1 ? 'canje' : 'canjes'} · {offerTypeLabel(s.type).toLowerCase()} · {Math.round(s.duration_minutes / 60)} h
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </>
        ) : null}

        {finished.length > 0 ? <Text style={styles.section}>Terminadas</Text> : null}
        {finished.map((offer) => (
          <FinishedCard key={offer.id} offer={offer} stat={statOf.get(offer.id)} onResult={() => openResult(offer.id)} onRepublish={() => republish(offer.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** «Cómo te va»: con datos suficientes, los números y dos hallazgos; si no, cuánto falta. */
function HowItGoes({ summary }: { summary: OfferStatsSummary }) {
  if (!summary.enough) {
    const pct = Math.min(100, Math.round((summary.finished / Math.max(1, summary.min_offers)) * 100));
    return (
      <View style={styles.nodata} accessibilityRole="summary">
        <Text style={styles.nodataTitle}>Aún no hay datos suficientes</Text>
        <Text style={styles.nodataText}>
          Con {summary.min_offers} ofertas terminadas y unas {summary.min_views} vistas te diremos qué funcionó mejor en tu negocio.
        </Text>
        <View style={styles.meter} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: summary.min_offers, now: summary.finished }}>
          <View style={[styles.meterFill, { width: `${pct}%` }]} />
        </View>
      </View>
    );
  }
  const claimRate = summary.views ? Math.round((summary.claims / summary.views) * 100) : 0;
  const redeemRate = summary.claims ? Math.round((summary.redeemed / summary.claims) * 100) : 0;
  return (
    <View style={styles.ins} accessibilityRole="summary">
      <Text style={styles.insTitle}>Cómo te va · últimos 90 días</Text>
      <View style={styles.kpis}>
        <Kpi value={String(summary.redeemed)} label="canjes" />
        <Kpi value={`${claimRate} %`} label="de vistas a reclamo" />
        <Kpi value={`${redeemRate} %`} label="de reclamos canjeados" />
      </View>
      {summary.insights.slice(0, 2).map((i) => (
        <View key={i.kind} style={styles.insight}>
          <Ionicons name={i.kind === 'band' ? 'time-outline' : i.kind === 'duration' ? 'hourglass-outline' : 'flash-outline'} size={16} color="#fff" />
          <Text style={styles.insightText}>{i.text}</Text>
        </View>
      ))}
      <Text style={styles.insNote}>Con tus {summary.finished} ofertas terminadas. No es una predicción.</Text>
    </View>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.kpi} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

/** Una oferta terminada: resultados (no cupos), «Cómo te fue» y «Volver a publicar». */
function FinishedCard({ offer, stat, onResult, onRepublish }: { offer: Offer; stat?: OfferStat; onResult: () => void; onRepublish: () => void }) {
  const claims = stat?.claims ?? offer.used_slots;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <Text style={styles.kind}>{offerTypeLabel(offer.type)}</Text>
          <Text style={styles.cardTitle}>{offer.title}</Text>
          <Text style={styles.cardMeta}>{formatEnded(offer.ends_at)}</Text>
        </View>
        <View style={styles.statusOff}>
          <Text style={styles.statusText}>Terminada</Text>
        </View>
      </View>
      <View style={styles.results} accessibilityLabel={`${stat ? `${stat.views} vistas, ` : ''}${claims} reclamos${stat ? `, ${stat.redeemed} canjes` : ''}`}>
        {stat ? <Result value={stat.views} label="vistas" /> : null}
        <Result value={claims} label="reclamos" />
        {stat ? <Result value={stat.redeemed} label="canjes" /> : null}
      </View>
      <View style={styles.actions}>
        {stat ? (
          <Pressable accessibilityRole="button" onPress={onResult} style={styles.btn}>
            <Text style={styles.btnText}>Cómo te fue ›</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onRepublish} style={styles.btn}>
          <Text style={styles.btnText}>Volver a publicar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Result({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.result}>
      <Text style={styles.resultValue}>{value}</Text>
      <Text style={styles.resultLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  newBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  link: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
  list: { padding: spacing.lg, gap: spacing.md },
  section: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted, marginTop: spacing.sm },
  empty: { color: colors.muted, fontSize: 14, fontFamily: fonts.ui.medium },
  activeWrap: { gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm },
  actionText: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primary },
  nodata: { gap: 6, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface },
  nodataTitle: { fontSize: 14.5, fontFamily: fonts.display.bold, color: colors.ink },
  nodataText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  meter: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden', marginTop: 4 },
  meterFill: { height: 8, backgroundColor: colors.success },
  ins: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg + 2, backgroundColor: colors.ink },
  insTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: '#fff' },
  kpis: { flexDirection: 'row', gap: spacing.sm },
  kpi: { flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.12)' },
  kpiValue: { fontSize: 18, fontFamily: fonts.display.bold, color: '#fff' },
  kpiLabel: { fontSize: 10.5, fontFamily: fonts.ui.bold, color: '#C9D8EE' },
  insight: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.1)' },
  insightText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.bold, color: '#fff' },
  insNote: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: '#C9D8EE' },
  bestRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  bestRank: { width: 22, fontSize: 18, fontFamily: fonts.display.bold, color: colors.primary },
  bestText: { flex: 1, minWidth: 0 },
  bestTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  bestSub: { fontSize: 12, fontFamily: fonts.ui.semibold, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardInfo: { flex: 1, gap: 2 },
  kind: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  cardTitle: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  cardMeta: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  statusOff: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.bg },
  statusText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.muted },
  results: { flexDirection: 'row', gap: spacing.sm },
  result: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.bg },
  resultValue: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  resultLabel: { fontSize: 10.5, fontFamily: fonts.ui.bold, color: colors.muted },
  btn: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
