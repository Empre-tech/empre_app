import { Ionicons } from '@/components/Icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { paymentsApi, usersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { ProPerkList } from '@/components/pro/ProPerkList';
import { ProTag } from '@/components/pro/ProTag';
import { openLegal } from '@/lib/legal';
import { isProSubscription } from '@/lib/proPlan';
import { coverageLine, MAX_PRO_TIER, pesos, suggestedTier, tierChange, tierPriceCOP, tierTitle, toggleCoverage } from '@/lib/storePro';
import { buyTier, manageStore, restoreStore, storeAvailable, tierPackages, type TierPackage } from '@/payments/storePurchases';
import { colors, fonts, radius, spacing } from '@/theme';

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STORE_NAME = Platform.OS === 'ios' ? 'la App Store' : 'Google Play';

/**
 * Tu plan (2026-11-26, opción A): Empre Pro es del dueño y se compra en Google Play o en la App Store. Hay tres
 * niveles: 1, 2 o 3 negocios (el primero $39.900 y cada uno más, la mitad), y el dueño elige qué negocios cubre. La
 * compra la confirma la tienda al servidor (RevenueCat), así que al volver se consulta unas veces hasta verla activa.
 * Base es gratis y nunca oculta el negocio.
 */
export default function BusinessSubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const available = storeAvailable();

  const subQ = useQuery({ queryKey: ['subscription', id], queryFn: () => paymentsApi.getSubscription(id), enabled: Boolean(id) });
  const ovQ = useQuery({ queryKey: ['pro-overview'], queryFn: usersApi.proOverview, enabled: Boolean(user) });
  const pkgQ = useQuery({ queryKey: ['store-tiers', user?.id], queryFn: () => tierPackages(user!.id), enabled: available && Boolean(user), staleTime: 10 * 60_000, retry: 1 });

  const ov = ovQ.data;
  const plan = ov?.plan ?? null;
  const active = Boolean(ov?.active && plan);
  const tier = active && plan ? plan.tier : 0;
  const businesses = ov?.businesses ?? [];
  const isPro = isProSubscription(subQ.data?.subscription);
  const legacy = isPro && subQ.data?.source !== 'store';
  const coveredHere = Boolean(ov?.covered.includes(id));
  const [selected, setSelected] = useState<number>(1);
  const [cover, setCover] = useState<string[]>([]);
  useEffect(() => {
    if (!ov) return;
    setSelected(active ? tier : suggestedTier(ov.businesses.length));
    setCover(ov.covered);
  }, [ov, active, tier]);

  const priceOf = (t: number): string => (pkgQ.data ?? []).find((p) => p.tier === t)?.price ?? pesos(tierPriceCOP(t));
  const change = tierChange(tier, selected, active);
  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: ['pro-overview'] });
    await qc.invalidateQueries({ queryKey: ['subscription'] });
  };

  const buy = async () => {
    if (!user) return;
    const tp: TierPackage | undefined = (pkgQ.data ?? []).find((p) => p.tier === selected);
    if (!tp) {
      setError(`Este plan todavía no está disponible en ${STORE_NAME}. Intenta más tarde.`);
      return;
    }
    setError(null);
    setNote(null);
    setBusy('buy');
    try {
      // Sin plan vigente: este negocio queda marcado para cubrirse primero cuando llegue la compra.
      if (!active) await usersApi.setProCoverage([id]).catch(() => undefined);
      const r = await buyTier(user.id, tp, active && plan ? { productId: plan.product_id, tier: plan.tier } : null);
      if (r === 'cancelled') return;
      if (change === 'downgrade') {
        setNote(`Listo: pasas a ${tierTitle(selected)} cuando se renueve tu plan.`);
        await refreshAll();
        return;
      }
      // La tienda le avisa al servidor (RevenueCat): puede tardar unos segundos.
      for (let i = 0; i < 8; i += 1) {
        await sleep(1500);
        const fresh = await qc.fetchQuery({ queryKey: ['pro-overview'], queryFn: usersApi.proOverview, staleTime: 0 });
        if (fresh.active && fresh.plan && fresh.plan.tier >= selected) break;
      }
      await refreshAll();
      setNote(`Listo: ya tienes ${tierTitle(selected)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la compra.');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!user) return;
    setError(null);
    setNote(null);
    setBusy('restore');
    try {
      await restoreStore(user.id);
      await sleep(1500);
      await refreshAll();
      setNote('Revisamos tus compras de la tienda. Si tenías un plan, ya quedó en tu cuenta.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos restaurar tus compras.');
    } finally {
      setBusy(null);
    }
  };

  const saveCover = async () => {
    setError(null);
    setBusy('cover');
    try {
      await usersApi.setProCoverage(cover);
      await refreshAll();
      setNote('Guardamos los negocios de tu plan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos guardar los negocios.');
    } finally {
      setBusy(null);
    }
  };

  const coverChanged = active && (cover.length !== (ov?.covered.length ?? 0) || cover.some((c) => !ov?.covered.includes(c)));
  const buyLabel =
    change === 'buy' ? `Comprar ${tierTitle(selected)}` : change === 'upgrade' ? `Subir a ${tierTitle(selected)}` : change === 'downgrade' ? `Cambiar a ${tierTitle(selected)} al renovar` : 'Es tu plan actual';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Tu plan</Text>
      </View>

      {subQ.isLoading || ovQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : subQ.isError || ovQ.isError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>No pudimos cargar tu plan.</Text>
          <Button title="Reintentar" variant="secondary" onPress={() => void Promise.all([subQ.refetch(), ovQ.refetch()])} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.planCard}>
            <View style={styles.planHead}>
              {isPro ? <ProTag /> : null}
              <Text style={styles.planTitle} accessibilityRole="header">
                {isPro ? 'Empre Pro activo' : 'Plan Base · gratis'}
              </Text>
            </View>
            <Text style={styles.planSub}>{coverageLine({ active, tier, covered: coveredHere, legacy })}</Text>
            {active && plan ? (
              <Text style={styles.planSub}>
                {plan.will_renew ? `Se renueva el ${formatDate(plan.current_period_end)}.` : `Cancelado: tienes Pro hasta el ${formatDate(plan.current_period_end)}.`}
              </Text>
            ) : legacy ? (
              <Text style={styles.planSub}>{`Hasta el ${formatDate(subQ.data?.subscription.current_period_end)}.`}</Text>
            ) : (
              <Text style={styles.planSub}>Vendes, anotas, publicas ofertas y te encuentran en Empre sin pagar. Lo de Pro se ve en gris con la corona.</Text>
            )}
          </View>

          <View>
            <Text style={styles.lead}>{isPro ? 'Lo que tienes con Empre Pro:' : 'Lo que ya tienes sigue igual. Con Empre Pro se suma:'}</Text>
            <ProPerkList detail />
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={styles.section}>{active ? 'Tu plan' : 'Elige tu plan'}</Text>
            {Array.from({ length: MAX_PRO_TIER }, (_, i) => i + 1).map((t) => {
              const on = selected === t;
              const mine = active && t === tier;
              const suggested = !active && t === suggestedTier(businesses.length);
              return (
                <Pressable key={t} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setSelected(t)} style={[styles.tier, on && styles.tierOn]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.tierHead}>
                      <Text style={styles.tierTitle}>{tierTitle(t)}</Text>
                      {mine ? <Text style={styles.badge}>Tu plan</Text> : suggested ? <Text style={styles.badge}>Para ti</Text> : null}
                    </View>
                    <Text style={styles.tierSub}>{t === 1 ? 'Cubre uno de tus negocios.' : `Cubre ${t} de tus negocios. Cada uno más va a mitad de precio.`}</Text>
                  </View>
                  <Text style={styles.tierPrice}>
                    {priceOf(t)}
                    <Text style={styles.tierUnit}>/mes</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {active && businesses.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.section}>{`Negocios en tu plan · ${cover.length} de ${tier}`}</Text>
              {businesses.map((b) => {
                const on = cover.includes(b.id);
                return (
                  <Pressable key={b.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setCover((c) => toggleCoverage(c, b.id, tier))} style={styles.bizRow}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primary : colors.muted} />
                    <Text style={styles.bizName} numberOfLines={1}>
                      {b.name}
                    </Text>
                    {b.id === id ? <Text style={styles.tierSub}>Este</Text> : null}
                  </Pressable>
                );
              })}
              {coverChanged ? <Button title="Guardar negocios" variant="secondary" onPress={() => void saveCover()} loading={busy === 'cover'} /> : null}
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}

          {available ? (
            <>
              <Button title={buyLabel} onPress={() => void buy()} loading={busy === 'buy'} disabled={change === 'same' || busy !== null || pkgQ.isLoading} />
              {pkgQ.isError ? <Text style={styles.disclaimer}>{`No pudimos traer los precios de ${STORE_NAME}. Revisa tu conexión.`}</Text> : null}
              <View style={styles.links}>
                <Pressable accessibilityRole="button" onPress={() => void restore()} disabled={busy !== null} hitSlop={8}>
                  <Text style={styles.link}>{busy === 'restore' ? 'Restaurando…' : 'Restaurar compras'}</Text>
                </Pressable>
                {active && plan ? (
                  <Pressable accessibilityRole="button" onPress={() => void manageStore(plan.product_id)} hitSlop={8}>
                    <Text style={styles.link}>Administrar o cancelar</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <Text style={styles.disclaimer}>{`Empre Pro se compra desde la app descargada de ${STORE_NAME}. Esta versión todavía no tiene las compras.`}</Text>
          )}

          <Text style={styles.disclaimer}>
            {`La suscripción se cobra en ${STORE_NAME} y se renueva sola cada mes hasta que la canceles. Puedes cancelar cuando quieras: sigues con Pro hasta el final del mes pagado y después vuelves a Base sin perder nada. `}
            <Text style={styles.linkInline} onPress={() => openLegal('terms')}>
              Términos
            </Text>
            {' · '}
            <Text style={styles.linkInline} onPress={() => openLegal('privacy')}>
              Privacidad
            </Text>
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontFamily: fonts.ui.bold, color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  muted: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  content: { padding: spacing.md, gap: spacing.lg },
  planCard: { gap: 4, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.well, borderWidth: 1, borderColor: colors.line },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planTitle: { fontSize: 17, lineHeight: 22, fontFamily: fonts.ui.semibold, color: colors.ink },
  planSub: { fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  lead: { marginBottom: spacing.sm, fontSize: 13, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  section: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  tier: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  tierOn: { borderColor: colors.primary, backgroundColor: colors.well },
  tierHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tierTitle: { fontSize: 15, fontFamily: fonts.ui.bold, color: colors.ink },
  tierSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  tierPrice: { fontSize: 17, fontFamily: fonts.ui.bold, color: colors.ink },
  tierUnit: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  badge: { fontSize: 11, fontFamily: fonts.ui.bold, color: colors.primaryDark, backgroundColor: colors.well, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  bizRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  bizName: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  link: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  linkInline: { fontFamily: fonts.ui.bold, color: colors.primaryDark, textDecorationLine: 'underline' },
  error: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.danger, textAlign: 'center' },
  note: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.verified, textAlign: 'center' },
  disclaimer: { fontSize: 12, lineHeight: 16, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
});
