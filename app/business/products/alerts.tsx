import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi } from '@/api/endpoints';
import { ledgerApi, type InventoryItem } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { ArrivedSheet } from '@/components/inventory/ArrivedSheet';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { firstTab, inventoryAlerts, shoppingList, splitAlerts, type Alert } from '@/lib/alerts';
import { catalogCopy } from '@/lib/catalog';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Todos los avisos de inventario, por tipo: lo que se acabó (y tus clientes ven agotado), lo que se acaba pronto, los
 * platos en riesgo y lo que aún no lleva control. Cada uno con su acción: «Ya llegó», ver el plato o activar.
 */
export default function AlertsScreen() {
  const { entityId: raw } = useLocalSearchParams<{ entityId: string }>();
  const entityId = raw ?? '';
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [arrived, setArrived] = useState<InventoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const business = useQuery({ queryKey: ['entity', entityId], queryFn: () => entitiesApi.get(entityId), enabled: Boolean(entityId) });
  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);
  const inv = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), enabled: Boolean(entityId), staleTime: 0 });
  const alerts = useMemo(() => inventoryAlerts(inv.data?.items ?? []), [inv.data]);
  const split = useMemo(() => splitAlerts(alerts), [alerts]);
  // Pestañas solo si el negocio usa insumos; abre en la más urgente.
  const usesSupplies = useMemo(() => (inv.data?.items ?? []).some((i) => i.kind === 'supply'), [inv.data]);
  const [tab, setTab] = useState<'sell' | 'supplies' | null>(null);
  const tabNow = usesSupplies ? (tab ?? firstTab(split)) : 'sell';
  const shown = usesSupplies ? split[tabNow] : alerts;
  const food = copy.kind === 'food';

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ledger', entityId] });
    void qc.invalidateQueries({ queryKey: ['catalog', entityId] });
  };
  const setup = useMutation({
    mutationFn: () => ledgerApi.setupInventory(entityId, 'recommended'),
    onSuccess: refresh,
    onError: () => setError('No se pudo activar. Revisa tu conexión.'),
  });

  const share = async () => {
    const msg = shoppingList(alerts, business.data?.name);
    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`);
    } catch {
      // Sin WhatsApp: el menú de compartir del teléfono.
      await Share.share({ message: msg });
    }
  };

  const openItem = (i: InventoryItem) => router.push({ pathname: '/business/products/item', params: { entityId, itemId: i.item_id ?? i.ref } });

  const total = alerts.total;
  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Lo que se acaba" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={inv.isRefetching} onRefresh={() => void inv.refetch()} />}
      >
        {inv.isLoading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : inv.isError ? (
          <EmptyState icon="cloud-offline-outline" title="No pudimos cargar los avisos" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void inv.refetch() }} />
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {usesSupplies ? (
              <View style={styles.tabs} accessibilityRole="tablist">
                {(
                  [
                    ['sell', 'Lo que vendes', split.sell.total],
                    ['supplies', 'Insumos', split.supplies.total],
                  ] as const
                ).map(([k, label, n]) => (
                  <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tabNow === k }} accessibilityLabel={`${label}: ${n} avisos`} onPress={() => setTab(k)} style={[styles.tab, tabNow === k && styles.tabOn]}>
                    <Text style={[styles.tabText, tabNow === k && styles.tabTextOn]}>{label}</Text>
                    {n > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{n}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}

            {total === 0 && alerts.unset === 0 ? (
              <EmptyState icon="checkmark-circle-outline" title="Todo en orden" body="Nada se acabó ni se está acabando. Te avisamos aquí cuando pase." />
            ) : shown.total === 0 && tabNow === 'supplies' ? (
              <EmptyState icon="checkmark-circle-outline" title="Tus insumos están bien" body="Ninguno se acabó ni se está acabando." />
            ) : shown.total === 0 && shown.unset === 0 ? (
              <EmptyState icon="checkmark-circle-outline" title="Lo que vendes está bien" body="Nada se acabó ni se está acabando." />
            ) : null}

            <Group
              title={shown.out.length === 1 ? 'Se acabó · 1' : `Se acabaron · ${shown.out.length}`}
              tone="out"
              hint={tabNow === 'supplies' ? 'Lo que lo usa no se puede preparar.' : 'Tus clientes los ven agotados en tu perfil hasta que vuelva a haber.'}
              rows={shown.out}
              usedIn={tabNow === 'supplies'}
              action={(a) => ({ label: 'Ya llegó', primary: true, onPress: () => setArrived(a.item) })}
            />
            <Group
              title={shown.soon.length === 1 ? 'Se te acaba pronto · 1' : `Se te acaban pronto · ${shown.soon.length}`}
              tone="low"
              hint={tabNow === 'supplies' ? 'Con lo que gastas cada día.' : 'Con lo que vendes cada día.'}
              rows={shown.soon}
              usedIn={tabNow === 'supplies'}
              action={(a) => ({ label: 'Ya llegó', onPress: () => setArrived(a.item) })}
            />
            <Group
              title={`${food ? 'Platos' : 'Productos'} en riesgo · ${shown.risk.length}`}
              tone="low"
              hint={usesSupplies ? 'Les falta un insumo. Se resuelve en la pestaña Insumos.' : 'Les falta un insumo para lo que vendes en un día.'}
              rows={shown.risk}
              action={(a) => (usesSupplies ? { label: 'Ver insumos', onPress: () => setTab('supplies') } : { label: food ? 'Ver plato' : 'Ver', onPress: () => openItem(a.item) })}
            />

            {shown.unset > 0 ? (
              <View style={{ gap: spacing.xs }}>
                <GroupHead title={`Sin control · ${shown.unset}`} tone="muted" />
                <Text style={styles.meta}>No sabemos cuándo se acaban. Actívalos de una vez, según tu tipo de negocio.</Text>
                <View style={styles.card}>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{shown.unset === 1 ? '1 producto sin inventario' : `${shown.unset} productos sin inventario`}</Text>
                      <Text style={styles.meta}>Se llena solo al vender y comprar</Text>
                    </View>
                    <Pressable accessibilityRole="button" disabled={setup.isPending} onPress={() => setup.mutate()} style={[styles.btn, styles.btnSoft]}>
                      {setup.isPending ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.btnText, { color: colors.primary }]}>Activar</Text>}
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            {alerts.out.length + alerts.soon.length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => void share()} style={styles.share}>
                <Ionicons name="logo-whatsapp" size={20} color={colors.primary} />
                <Text style={styles.shareText}>Enviar lista de compras por WhatsApp</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
      <ArrivedSheet entityId={entityId} item={arrived} onClose={() => setArrived(null)} onDone={refresh} />
    </View>
  );
}

const TONE = { out: { dot: colors.danger, fg: '#B3261E' }, low: { dot: colors.accent, fg: colors.accentInk }, muted: { dot: '#B9C6D8', fg: '#55657C' } };

function GroupHead({ title, tone }: { title: string; tone: keyof typeof TONE }) {
  return (
    <View style={styles.head}>
      <View style={[styles.dot, { backgroundColor: TONE[tone].dot }]} />
      <Text style={[styles.headText, { color: TONE[tone].fg }]}>{title}</Text>
    </View>
  );
}

function Group({
  title,
  tone,
  hint,
  rows,
  action,
  usedIn = false,
}: {
  title: string;
  tone: keyof typeof TONE;
  hint: string;
  rows: Alert<InventoryItem>[];
  /** Insumos: debajo, los platos o productos que afecta. */
  usedIn?: boolean;
  action: (a: Alert<InventoryItem>) => { label: string; primary?: boolean; onPress: () => void };
}) {
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <GroupHead title={title} tone={tone} />
      <Text style={styles.meta}>{hint}</Text>
      <View style={styles.card}>
        {rows.map((a, n) => {
          const act = action(a);
          const users = usedIn ? a.item.used_in ?? [] : [];
          return (
            <View key={a.item.ref} style={n > 0 ? styles.line : undefined}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {a.item.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {a.text}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`${act.label}: ${a.item.name}`} onPress={act.onPress} style={[styles.btn, act.primary ? styles.btnPrimary : styles.btnSoft]}>
                  <Text style={[styles.btnText, { color: act.primary ? '#fff' : colors.primary }]}>{act.label}</Text>
                </Pressable>
              </View>
              {users.length > 0 ? (
                <View style={styles.users}>
                  <Text style={styles.usersLabel}>{tone === 'out' ? 'Afecta a' : 'Lo usan'}</Text>
                  {users.slice(0, 6).map((u) => (
                    <View key={u.ref} style={[styles.chip, { backgroundColor: tone === 'out' ? '#FDE8E8' : colors.accentSoft }]}>
                      <Text style={[styles.chipText, { color: tone === 'out' ? '#B3261E' : colors.accentInk }]}>{u.name}</Text>
                    </View>
                  ))}
                  {users.length > 6 ? <Text style={styles.usersLabel}>y {users.length - 6} más</Text> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  meta: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.ui.medium, color: colors.muted },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  headText: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.5, textTransform: 'uppercase' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  users: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingBottom: spacing.md, marginTop: -4 },
  usersLabel: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: colors.muted },
  chip: { minHeight: 26, paddingHorizontal: 10, borderRadius: radius.pill, justifyContent: 'center' },
  chipText: { fontSize: 12, fontFamily: fonts.ui.extrabold },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: '#EEF2F7' },
  tab: { flex: 1, minHeight: 42, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabOn: { backgroundColor: colors.surface },
  tabText: { fontSize: 14, fontFamily: fonts.ui.bold, color: '#55657C' },
  tabTextOn: { fontFamily: fonts.ui.extrabold, color: colors.ink },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontFamily: fonts.ui.extrabold, color: '#fff' },
  line: { borderTopWidth: 1, borderTopColor: '#EEF2F7' },
  name: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.ink },
  btn: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.primary },
  btnSoft: { backgroundColor: colors.primarySoft },
  btnText: { fontSize: 13, fontFamily: fonts.ui.extrabold },
  share: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  shareText: { fontSize: 15, fontFamily: fonts.ui.extrabold, color: colors.primary },
});
