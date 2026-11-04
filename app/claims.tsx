import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClaimStatus, OfferClaim } from '@/api/types';
import { claimsApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { loadSavedClaims } from '@/claims/claimStore';
import { EmptyState } from '@/components/EmptyState';
import { SignInPrompt } from '@/components/SignInPrompt';
import { SkeletonRows } from '@/components/Skeleton';
import { effectiveClaimStatus, mergeClaims } from '@/lib/claims';
import { planHour } from '@/lib/plans';
import { useNow } from '@/lib/useNow';
import { colors, fonts } from '@/theme';

const LABEL: Record<ClaimStatus, string> = { RECLAMADO: 'ACTIVO', CANJEADO: 'CANJEADO', EXPIRADO: 'VENCIDO', CANCELADO: 'CANCELADO' };
const ICON: Record<ClaimStatus, keyof typeof Ionicons.glyphMap> = { RECLAMADO: 'qr-code-outline', CANJEADO: 'checkmark', EXPIRADO: 'time-outline', CANCELADO: 'close' };

function ClaimCard({ item, now, onOpen, onOffer }: { item: OfferClaim; now: number; onOpen: () => void; onOffer?: () => void }) {
  const state = effectiveClaimStatus(item, now);
  const active = state === 'RECLAMADO';
  const done = state === 'CANJEADO';
  const when = item.redeemed_at ? `${new Date(item.redeemed_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · ${planHour(item.redeemed_at)}` : '';
  const why = state === 'EXPIRADO' ? `El código venció a las ${planHour(item.expires_at)}. No se cobró nada.` : state === 'CANCELADO' ? 'Lo cancelaste. Si la oferta sigue vigente, puedes reclamarla otra vez.' : null;
  const tint = active ? colors.accent : done ? colors.verified : colors.line;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.offer?.title ?? 'Oferta'}, ${item.entity_name ?? ''}, ${LABEL[state].toLowerCase()}`} onPress={onOpen} style={({ pressed }) => [styles.ticket, pressed && { opacity: 0.9 }]}>
      <View style={styles.top}>
        <View style={styles.topRow}>
          <View style={[styles.ring, { borderColor: tint }]}>
            <View style={styles.icon}>
              <Ionicons name={ICON[state]} size={20} color={colors.ink} />
            </View>
          </View>
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={2}>
              {item.offer?.title ?? 'Oferta'}
            </Text>
            {item.entity_name ? <Text style={styles.biz}>{item.entity_name}</Text> : null}
          </View>
        </View>
        {why ? <Text style={styles.why}>{why}</Text> : null}
      </View>
      <View style={[styles.stub, done && styles.stubLoose]}>
        {done ? <Text style={styles.when}>{when}</Text> : null}
        {active ? <Text style={styles.expires}>Vence a las {planHour(item.expires_at)}</Text> : null}
        <View style={[styles.stamp, active && styles.stampLive, done && styles.stampDone]}>
          <Text style={[styles.stampText, active && styles.stampTextLive, done && styles.stampTextDone]}>{LABEL[state]}</Text>
        </View>
        {why && onOffer ? (
          <Pressable accessibilityRole="link" onPress={onOffer} style={styles.see}>
            <Text style={styles.seeText}>Ver la oferta</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Mis reclamos (tablero «Estados del reclamo»): cada oferta reclamada es un ticket con su talón y su sello. El QR sigue aquí aunque no haya conexión. */
export default function ClaimsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status: authStatus, user } = useAuth();
  const signedIn = authStatus === 'signedIn' && Boolean(user);
  const now = useNow(30_000);

  const mine = useQuery({ queryKey: ['claims', 'mine'], queryFn: claimsApi.mine, enabled: signedIn, retry: false, staleTime: 15_000 });
  const saved = useQuery({
    queryKey: ['claims', 'saved', user?.id],
    queryFn: () => loadSavedClaims(user!.id),
    enabled: signedIn,
  });
  const claims = useMemo(() => mergeClaims(mine.data ?? [], saved.data ?? []), [mine.data, saved.data]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 14 }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Mis reclamos
        </Text>
      </View>

      {authStatus !== 'loading' && !signedIn ? (
        <SignInPrompt title="Tus reclamos" message="Inicia sesión para ver los QR de las ofertas que reclamaste." />
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          refreshing={mine.isRefetching}
          onRefresh={() => void mine.refetch()}
          ListEmptyComponent={
            mine.isLoading || saved.isLoading ? (
              <SkeletonRows count={3} />
            ) : (
              <EmptyState icon="ticket-outline" title="Todavía no has reclamado ofertas" body="Cuando lo hagas, tu QR quedará aquí, aunque no tengas conexión." action={{ title: 'Ver ofertas', onPress: () => router.push('/(tabs)/offers') }} />
            )
          }
          renderItem={({ item }) => (
            <ClaimCard
              item={item}
              now={now}
              onOpen={() => router.push({ pathname: '/offer/claim', params: { claimId: item.id, offerId: item.offer_id } })}
              onOffer={item.offer?.entity_id ? () => router.push({ pathname: '/offer/[id]', params: { id: item.offer_id, entityId: item.offer!.entity_id } }) : undefined}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 6 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  title: { fontSize: 22, fontFamily: fonts.display.bold, color: colors.ink },
  list: { paddingHorizontal: 24, paddingTop: 12, gap: 18, flexGrow: 1 },
  ticket: { borderRadius: 18, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  top: { paddingVertical: 16, paddingHorizontal: 18, gap: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ring: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, lineHeight: 20, fontFamily: fonts.display.semibold, color: colors.ink },
  biz: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.faint },
  why: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  stub: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 18, borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: colors.line },
  stubLoose: { borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: colors.surface, transform: [{ translateX: -4 }, { translateY: 6 }, { rotate: '-2deg' }] },
  when: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.medium, color: colors.faint },
  expires: { flexShrink: 1, fontSize: 13, fontFamily: fonts.ui.bold, color: colors.accentInk },
  stamp: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, borderWidth: 2.5, borderColor: colors.faint },
  stampLive: { borderColor: colors.accentInk },
  stampDone: { borderColor: colors.verified, transform: [{ rotate: '-6deg' }] },
  stampText: { fontSize: 14, letterSpacing: 2.2, fontFamily: fonts.ui.extrabold, color: colors.faint },
  stampTextLive: { color: colors.accentInk },
  stampTextDone: { color: colors.verified },
  see: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.surface },
  seeText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
});
