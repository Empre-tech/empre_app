import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { claimsApi, offersApi } from '@/api/offers';
import { useAuth } from '@/auth/AuthContext';
import { getClaimPosition } from '@/claims/claimPosition';
import { loadSavedClaims, removeSavedClaim, saveClaim } from '@/claims/claimStore';
import { Button } from '@/components/Button';
import { ClaimIntro } from '@/components/claim/ClaimIntro';
import { ClaimQR } from '@/components/claim/ClaimQR';
import { ClaimRedeemed } from '@/components/claim/ClaimRedeemed';
import { claimToShowForOffer, effectiveClaimStatus, mergeClaims } from '@/lib/claims';
import { useNow } from '@/lib/useNow';
import { colors, fonts, spacing } from '@/theme';

/**
 * Reclamo de una oferta, en pasos según el estado:
 * antes de reclamar (la oferta, cómo funciona y las reglas) → QR activo con su
 * cuenta regresiva → vencido, o canjeado con la confirmación del cliente.
 *
 * El reclamo se guarda en el teléfono: al salir y volver, o sin conexión, el QR
 * sigue ahí. Mientras está activo se consulta al servidor cada pocos segundos
 * para enterarse de cuándo el negocio lo canjea.
 */
export default function ClaimScreen() {
  const params = useLocalSearchParams<{ offerId?: string; entityId?: string; title?: string; claimId?: string }>();
  const offerId = params.offerId ?? '';
  const entityId = params.entityId ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { status: authStatus, user } = useAuth();
  const signedIn = authStatus === 'signedIn' && Boolean(user);
  const userId = user?.id;
  const now = useNow(1000);

  const [chosenId, setChosenId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Reclamos que se conocen: los del servidor (si hay conexión) y los guardados en el teléfono.
  const mine = useQuery({ queryKey: ['claims', 'mine'], queryFn: claimsApi.mine, enabled: signedIn, retry: false, staleTime: 15_000 });
  const savedClaims = useQuery({
    queryKey: ['claims', 'saved', userId],
    queryFn: () => loadSavedClaims(userId!),
    enabled: signedIn,
  });
  const known = useMemo(
    () => mergeClaims(mine.data ?? [], savedClaims.data ?? []).filter((c) => !dismissed.includes(c.id)),
    [mine.data, savedClaims.data, dismissed],
  );

  const fromParams = params.claimId && !dismissed.includes(params.claimId) ? params.claimId : undefined;
  const activeId = chosenId ?? fromParams ?? (offerId ? claimToShowForOffer(known, offerId)?.id : undefined) ?? null;

  const claimQuery = useQuery({
    queryKey: ['claim', activeId],
    queryFn: async () => {
      const fresh = await claimsApi.get(activeId!);
      if (userId) void saveClaim(userId, fresh);
      return fresh;
    },
    enabled: Boolean(activeId) && signedIn,
    // Lo guardado se muestra al instante (también sin conexión) y se actualiza en segundo plano.
    initialData: () => known.find((c) => c.id === activeId),
    initialDataUpdatedAt: 0,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && effectiveClaimStatus(data, Date.now()) === 'RECLAMADO' ? 5000 : false;
    },
  });
  const claim = claimQuery.data ?? null;
  const status = claim ? effectiveClaimStatus(claim, now) : null;

  // La oferta, mientras no hay reclamo (para la pantalla de reglas).
  const offerQuery = useQuery({
    queryKey: ['offer', entityId],
    queryFn: () => offersApi.active(entityId),
    enabled: Boolean(entityId) && !claim,
  });
  const loadedOffer = offerQuery.data?.data ?? null;
  const offer = loadedOffer && loadedOffer.id === offerId ? loadedOffer : null;

  // Para «Cómo llegar».
  const directionsEntityId = claim?.offer?.entity_id ?? entityId;
  const entity = useQuery({
    queryKey: ['entity', directionsEntityId],
    queryFn: () => entitiesApi.get(directionsEntityId),
    enabled: Boolean(directionsEntityId) && status === 'RECLAMADO',
    staleTime: 60_000,
  });

  const isSaved = justSaved || (savedClaims.data ?? []).some((c) => c.id === claim?.id);

  const onClaim = async () => {
    const target = claim?.offer_id ?? offerId;
    if (!target) return;
    setBusy(true);
    setMessage(null);
    try {
      // El servidor comprueba que estés cerca del negocio; sin permiso o sin señal, reclama igual.
      const where = await getClaimPosition();
      const created = await claimsApi.claim(target, where?.latitude, where?.longitude);
      queryClient.setQueryData(['claim', created.id], created);
      void queryClient.invalidateQueries({ queryKey: ['claims', 'mine'] });
      if (userId) setJustSaved(await saveClaim(userId, created));
      setChosenId(created.id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No pudimos reclamar la oferta');
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!claim) return;
    setBusy(true);
    setMessage(null);
    try {
      await claimsApi.cancel(claim.id);
      if (userId) await removeSavedClaim(userId, claim.id);
      setDismissed((list) => [...list, claim.id]);
      setChosenId(null);
      queryClient.removeQueries({ queryKey: ['claim', claim.id] });
      void queryClient.invalidateQueries({ queryKey: ['claims'] });
      setMessage('Reclamo cancelado. Liberamos tu cupo.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No pudimos cancelar');
    } finally {
      setBusy(false);
    }
  };

  const onCancel = () => {
    if (Platform.OS === 'web') {
      void doCancel();
      return;
    }
    Alert.alert('¿Liberar tu cupo?', 'Otra persona podrá usarlo. Podrás reclamar de nuevo si aún quedan cupos.', [
      { text: 'Mantener', style: 'cancel' },
      { text: 'Cancelar reclamo', style: 'destructive', onPress: () => void doCancel() },
    ]);
  };

  const onConfirm = async () => {
    if (!claim) return;
    setBusy(true);
    setMessage(null);
    try {
      await claimsApi.confirm(claim.id);
      const updated = { ...claim, verified_by_client: true };
      queryClient.setQueryData(['claim', claim.id], updated);
      if (userId) void saveClaim(userId, updated);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No pudimos confirmar');
    } finally {
      setBusy(false);
    }
  };

  const onDirections = entity.data
    ? () => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${entity.data.latitude},${entity.data.longitude}`)
    : undefined;

  const title = !claim ? 'Reclamar oferta' : status === 'CANJEADO' ? 'Canjeado' : 'Tu oferta';
  const loadingOffer = !claim && Boolean(entityId) && offerQuery.isLoading;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        {authStatus === 'loading' || loadingOffer ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : claim && status ? (
          status === 'CANJEADO' ? (
            <ClaimRedeemed claim={claim} busy={busy} message={message} onConfirm={() => void onConfirm()} />
          ) : (
            <ClaimQR
              claim={claim}
              status={status}
              now={now}
              saved={isSaved}
              message={message}
              busy={busy}
              onDirections={onDirections}
              onCancel={onCancel}
              onClaimAgain={() => void onClaim()}
              onSeeOthers={() => router.replace('/(tabs)/offers')}
            />
          )
        ) : offer ? (
          <ClaimIntro
            offer={offer}
            signedIn={signedIn}
            claiming={busy}
            message={message}
            onClaim={() => void onClaim()}
            onSignIn={() => router.push('/(auth)/login')}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Esta oferta ya no está disponible</Text>
            <Text style={styles.emptyText}>
              {message ?? (offerQuery.isError ? 'No pudimos cargarla. Revisa tu conexión.' : 'Terminó o se retiró.')}
            </Text>
            {offerQuery.isError ? <Button title="Reintentar" variant="secondary" onPress={() => void offerQuery.refetch()} /> : null}
            <Button title="Ver otras ofertas" onPress={() => router.replace('/(tabs)/offers')} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  spinner: { marginTop: spacing.xxl },
  empty: { alignItems: 'stretch', gap: spacing.md, paddingTop: spacing.xl },
  emptyTitle: { fontSize: 18, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
