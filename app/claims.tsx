import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ClaimStatus } from '@/api/types';
import { claimsApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { loadSavedClaims } from '@/claims/claimStore';
import { EmptyState } from '@/components/EmptyState';
import { SignInPrompt } from '@/components/SignInPrompt';
import { SkeletonRows } from '@/components/Skeleton';
import { effectiveClaimStatus, mergeClaims } from '@/lib/claims';
import { formatClock } from '@/lib/offer';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, spacing } from '@/theme';
import { usePullRefresh } from '@/lib/usePullRefresh';

const LABEL: Record<ClaimStatus, string> = {
  RECLAMADO: 'Activo',
  CANJEADO: 'Canjeado',
  EXPIRADO: 'Venció',
  CANCELADO: 'Cancelado',
};

const ICON: Record<ClaimStatus, keyof typeof Ionicons.glyphMap> = {
  RECLAMADO: 'qr-code-outline',
  CANJEADO: 'checkmark-circle-outline',
  EXPIRADO: 'time-outline',
  CANCELADO: 'close-circle-outline',
};

/** Mis reclamos: el QR de cada oferta reclamada, aunque ya no haya conexión. */
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
  const pull = usePullRefresh(mine.refetch);
  const claims = useMemo(() => mergeClaims(mine.data ?? [], saved.data ?? []), [mine.data, saved.data]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Mis reclamos</Text>
        <View style={styles.back} />
      </View>

      {authStatus !== 'loading' && !signedIn ? (
        <SignInPrompt title="Tus reclamos" message="Inicia sesión para ver los QR de las ofertas que reclamaste." />
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
          ListEmptyComponent={
            mine.isLoading || saved.isLoading ? (
              <SkeletonRows count={3} />
            ) : (
              <EmptyState
                icon="ticket-outline"
                title="Todavía no has reclamado ofertas"
                body="Cuando lo hagas, tu QR quedará aquí, aunque no tengas conexión."
                action={{ title: 'Ver ofertas', onPress: () => router.push('/(tabs)/offers') }}
              />
            )
          }
          renderItem={({ item }) => {
            const state = effectiveClaimStatus(item, now);
            const active = state === 'RECLAMADO';
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.offer?.title ?? 'Oferta'}, ${LABEL[state]}`}
                onPress={() => router.push({ pathname: '/offer/claim', params: { claimId: item.id, offerId: item.offer_id } })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.icon, active && styles.iconActive]}>
                  <Ionicons name={ICON[state]} size={22} color={active ? colors.primaryDark : colors.muted} />
                </View>
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.offer?.title ?? 'Oferta'}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[item.entity_name, active ? `vence a las ${formatClock(item.expires_at)}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{LABEL[state]}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted, marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, minHeight: 64 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.primarySoft },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink },
  meta: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.muted },
  chip: { paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.primarySoft },
  chipText: { fontSize: 11.5, fontFamily: fonts.ui.extrabold, color: colors.inkSoft },
  chipTextActive: { color: colors.primaryDark },
});
