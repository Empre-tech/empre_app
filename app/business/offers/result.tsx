import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { offersApi } from '@/api/offers';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { formatEnded, offerTypeLabel } from '@/lib/offer';
import { averages, funnel, nextTimeIdea, trend, type Trend } from '@/lib/offerInsights';
import { colors, fonts, radius, spacing } from '@/theme';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const TREND_TEXT: Record<Trend, string> = { up: '▲ más', down: '▼ menos', same: '≈ igual' };

/**
 * «Cómo te fue» de una oferta: de las vistas al canje, cuándo se agotó, cómo se compara con el propio promedio (nunca
 * con otros negocios) y una idea para la próxima, con «Volver a publicar» con los mismos ajustes.
 */
export default function OfferResultScreen() {
  const { entityId, offerId } = useLocalSearchParams<{ entityId: string; offerId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stats = useQuery({ queryKey: ['offer-stats', entityId], queryFn: () => offersApi.stats(entityId ?? ''), enabled: Boolean(entityId), staleTime: 60_000 });

  const all = stats.data?.offers ?? [];
  const s = all.find((x) => x.offer_id === offerId);
  const summary = stats.data?.summary;
  const avg = averages(all);

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Cómo te fue" />
      {stats.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : !s ? (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>{stats.isError ? 'No pudimos cargar los resultados' : 'No encontramos esta oferta'}</Text>
          {stats.isError ? (
            <Pressable accessibilityRole="button" onPress={() => void stats.refetch()} style={styles.btn}>
              <Text style={styles.btnText}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.card}>
            <Text style={styles.kind}>{offerTypeLabel(s.type)}</Text>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.meta}>
              {s.ended ? formatEnded(s.ends_at) : 'Sigue activa'} · publicada el {DAYS[s.weekday]} a las {s.hour}:00 · {Math.round(s.duration_minutes / 60)} h
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section} accessibilityRole="header">
              Del vistazo al canje
            </Text>
            <Bar label="Vistas" value={s.views} pct={100} />
            <Bar label="Reclamos" value={s.claims} pct={funnel(s).claimRate} suffix={`${funnel(s).claimRate} % de las vistas`} />
            <Bar label="Canjes" value={s.redeemed} pct={s.views ? Math.round((s.redeemed / s.views) * 100) : 0} suffix={`${funnel(s).redeemRate} % de los reclamos`} />
            <Text style={styles.note}>
              {s.filled_minutes !== undefined ? `Cupos agotados en ${s.filled_minutes} min.` : `Se usaron ${s.claims} de ${s.total_slots} cupos.`} Las vistas son anónimas: sabemos cuántas personas la vieron, no quiénes.
            </Text>
            {summary?.enough ? (
              <View style={styles.chips}>
                <TrendChip label="Canjes" t={trend(s.redeemed, avg.redeemed)} />
                <TrendChip label="Reclamos por vista" t={trend(s.views ? s.claims / s.views : 0, avg.claimRate)} />
              </View>
            ) : null}
          </View>

          <View style={styles.idea} accessibilityRole="text">
            <Text style={styles.ideaText}>💡 {nextTimeIdea(s, summary)}</Text>
          </View>

          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/business/offers/new', params: { entityId, from: s.offer_id } })} style={styles.primary}>
            <Text style={styles.primaryText}>Volver a publicar</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function Bar({ label, value, pct, suffix }: { label: string; value: number; pct: number; suffix?: string }) {
  return (
    <View style={styles.bar} accessible accessibilityLabel={`${label}: ${value}${suffix ? `, ${suffix}` : ''}`}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>
          {value}
          {suffix ? ` · ${suffix}` : ''}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, pct))}%` }]} />
      </View>
    </View>
  );
}

function TrendChip({ label, t }: { label: string; t: Trend }) {
  return (
    <View style={[styles.chip, t === 'up' ? styles.up : t === 'down' ? styles.down : styles.same]}>
      <Text style={[styles.chipText, t === 'up' ? styles.upText : t === 'down' ? styles.downText : styles.sameText]}>
        {label}: {TREND_TEXT[t]} que tu promedio
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  kind: { fontSize: 10.5, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  title: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  section: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  bar: { gap: 4 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  barLabel: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.ink },
  barValue: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted, textAlign: 'right' },
  track: { height: 14, borderRadius: 7, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 14, borderRadius: 7, backgroundColor: colors.primary },
  note: { fontSize: 12, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  chipText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold },
  up: { backgroundColor: '#E3F4EA' },
  upText: { color: '#1D6B3D' },
  down: { backgroundColor: '#FBE4E4' },
  downText: { color: '#8E2A2A' },
  same: { backgroundColor: colors.bg },
  sameText: { color: colors.muted },
  idea: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  ideaText: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  primary: { minHeight: 52, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: '#fff' },
  state: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  stateTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  btn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
