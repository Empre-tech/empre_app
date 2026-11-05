import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi, type Analytics, type ItemCost, type ProductStat } from '@/api/ledger';
import { EmptyState } from '@/components/EmptyState';
import { FinanceTop, Mini3 } from '@/components/finance/Top';
import { EmpreAICard, StatusCap, SystemGroup, SystemRow, SystemSection } from '@/components/system/parts';
import { rentaReadings } from '@/lib/empreAI';
import { presetRange, rankProducts, todayCO } from '@/lib/finance';
import { formatPesos } from '@/lib/ledger';
import { colors, fonts, softShadow, spacing } from '@/theme';

const READING_ICON = { low: 'pricetag-outline', cost: 'create-outline' } as const;

/** Rentabilidad: qué te deja plata de verdad. Solo cuenta lo que tiene costo, y lo dice. */
export default function RentabilidadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();
  const range = presetRange('30d', todayCO());
  const q = useQuery({
    queryKey: ['ledger', entityId, 'analytics', range.from, range.to, range.compare],
    queryFn: () => ledgerApi.analytics(entityId, { from: range.from, to: range.to, compare: range.compare }),
    enabled: Boolean(entityId),
    staleTime: 30_000,
  });
  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  const a = q.data;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + spacing.xxl }]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        <FinanceTop entityId={entityId} space="rentabilidad" title="Qué te deja plata" />
        {q.isLoading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : q.isError || !a ? (
          <EmptyState icon="cloud-offline-outline" title="No pudimos cargar tus números" body="Revisa tu conexión e inténtalo de nuevo." action={{ title: 'Reintentar', onPress: () => void q.refetch() }} />
        ) : a.current.costed_revenue > 0 ? (
          <Full a={a} entityId={entityId} items={items.data ?? []} />
        ) : (
          <First a={a} entityId={entityId} items={items.data ?? []} />
        )}
      </ScrollView>
      <StatusCap />
    </View>
  );
}

function Full({ a, entityId, items }: { a: Analytics; entityId: string; items: ItemCost[] }) {
  const router = useRouter();
  const c = a.current;
  const margin = Math.round((c.gross_margin / c.costed_revenue) * 100);
  const list = rankProducts(a.products, 'profit').filter((p) => p.profit !== null);
  const shown = list.slice(0, 4);
  const [sel, setSel] = useState(0);
  const cur: ProductStat | undefined = shown[sel] ?? shown[0];
  const top = Math.max(1, ...shown.map((p) => Math.abs(p.profit ?? 0)));
  const item = cur ? items.find((i) => i.id === cur.ref || i.name === cur.name) : undefined;
  const price = item?.price ?? (cur && cur.qty > 0 ? Math.round(cur.costed_revenue / cur.qty) : 0);
  const cost = cur && cur.qty > 0 ? Math.round((cur.costed_revenue - (cur.profit ?? 0)) / cur.qty) : 0;
  const costShare = price > 0 ? Math.min(100, Math.round((cost / price) * 100)) : 0;
  const readings = rentaReadings(a.products, a.uncosted_count, a.uncosted_revenue);
  const inv = a.inventory;
  const goCosts = () => router.push({ pathname: '/business/ledger/costs/[id]', params: { id: entityId } });
  const goDetail = (tab: 'products' | 'inventory') => router.push({ pathname: '/business/ledger/analytics/[id]', params: { id: entityId, tab } });

  return (
    <>
      <View style={styles.card}>
        <View>
          <Text style={styles.label}>Estos 30 días, de cada $100 que vendes te quedan</Text>
          <Text style={[styles.hero, margin < 0 && { color: colors.warning }]} numberOfLines={1} accessibilityLiveRegion="polite">
            {margin < 0 ? `−$${-margin}` : `$${margin}`}
          </Text>
        </View>
        <Mini3 items={[['Vendiste', formatPesos(c.costed_revenue)], ['Te costó', formatPesos(c.costed_revenue - c.gross_margin)], ['Te dejó', formatPesos(c.gross_margin)]]} />
        {a.uncosted_revenue > 0 ? <Text style={styles.note}>Sobre {formatPesos(c.costed_revenue)} de tus {formatPesos(c.sales_total)}: a lo demás le falta el costo.</Text> : null}
      </View>

      <SystemSection title="Lo que más te deja" link={list.length > 4 ? 'Ver todos' : undefined} onLink={() => goDetail('products')}>
        <View style={styles.listCard}>
          {shown.map((p, i) => {
            const on = i === sel;
            const v = p.profit ?? 0;
            return (
              <Pressable key={p.ref} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setSel(i)} style={[styles.row, on && styles.rowOn, i > 0 && !on && styles.rowLine]}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[styles.rowValue, v < 0 && { color: colors.warning }]}>{v < 0 ? `−${formatPesos(-v)}` : formatPesos(v)}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${(Math.abs(v) / top) * 100}%`, backgroundColor: on ? colors.ink : '#8796AB' }]} />
                </View>
                <Text style={styles.note}>
                  {String(Math.round(p.qty * 10) / 10).replace('.', ',')} vendidos · te deja {Math.round(p.margin_pct ?? 0)} %
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SystemSection>

      {cur ? (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.detailTitle}>
            {cur.name}: te deja {Math.round(cur.margin_pct ?? 0)} %
          </Text>
          <View style={styles.split}>
            <View style={{ width: `${costShare}%`, backgroundColor: '#B6C1D1' }} />
            <View style={{ flex: 1, backgroundColor: colors.ink }} />
          </View>
          <Mini3 items={[['Lo cobras', formatPesos(price)], ['Te cuesta', formatPesos(cost)], ['Te queda', price - cost < 0 ? `−${formatPesos(cost - price)}` : formatPesos(price - cost)]]} />
        </View>
      ) : null}

      {readings.length > 0 ? (
        <EmpreAICard title="Qué revisar">
          <View>
            {readings.map((r, i) => (
              <SystemRow key={r.kind} first={i === 0} icon={READING_ICON[r.kind]} title={r.title} sub={r.sub} onPress={r.kind === 'cost' ? goCosts : () => goDetail('products')} />
            ))}
          </View>
        </EmpreAICard>
      ) : null}

      {inv.value_cost > 0 || inv.idle_total > 0 ? (
        <SystemSection title="Tu mercancía" link="Ver todo" onLink={() => goDetail('inventory')}>
          <SystemGroup>
            {inv.value_cost > 0 ? <SystemRow first icon="cube-outline" title={`${formatPesos(inv.value_cost)} en mercancía`} sub={inv.value_price > inv.value_cost ? `Si lo vendes todo, ganarías ${formatPesos(inv.value_price - inv.value_cost)}` : `Con ${inv.valued} de ${inv.products} productos`} onPress={() => goDetail('inventory')} /> : null}
            {inv.idle_total > 0 ? <SystemRow first={inv.value_cost <= 0} icon="hourglass-outline" title={`${formatPesos(inv.idle_total)} quietos`} sub="No se venden hace más de 4 semanas" onPress={() => goDetail('inventory')} /> : null}
          </SystemGroup>
        </SystemSection>
      ) : null}
    </>
  );
}

/** Aún sin ventas con costo: con el catálogo ya se ve qué dejaría cada cosa, y qué falta para saberlo. */
function First({ a, entityId, items }: { a: Analytics; entityId: string; items: ItemCost[] }) {
  const router = useRouter();
  const priced = items.filter((i) => i.price !== null && i.price > 0);
  const goCosts = () => router.push({ pathname: '/business/ledger/costs/[id]', params: { id: entityId } });
  const known = priced.filter((i) => i.cost !== null).length;
  if (priced.length === 0) {
    return (
      <>
        <EmpreAICard title="Un primer cálculo">
          <Text style={styles.body2}>Con el precio y el costo de lo que vendes, aquí verás qué te deja cada cosa.</Text>
        </EmpreAICard>
        <SystemGroup>
          <SystemRow first icon="pricetags-outline" title="Agregar lo que vendes" sub="Con eso empezamos a calcular" onPress={() => router.push({ pathname: '/business/products/[id]', params: { id: entityId } })} />
        </SystemGroup>
      </>
    );
  }
  return (
    <>
      <EmpreAICard title="Un primer cálculo">
        <Text style={styles.body2}>
          {a.current.sales_count > 0 ? 'Tus ventas todavía no tienen costo. ' : 'Aún sin ventas ya se puede ver qué te dejaría cada cosa. '}
          {known === priced.length ? 'Lo que vendas desde ahora se calculará solo.' : 'Pon lo que te cuesta y el número aparece.'}
        </Text>
      </EmpreAICard>
      <SystemSection title="Lo que cobras y lo que te cuesta" link={priced.length > 6 ? 'Ver todos' : undefined} onLink={goCosts}>
        <SystemGroup>
          {priced.slice(0, 6).map((i, n) => (
            <SystemRow key={i.id} first={n === 0} icon="pricetag-outline" title={i.name} sub={i.cost !== null ? `Lo cobras ${formatPesos(i.price ?? 0)} · te queda ${formatPesos((i.price ?? 0) - i.cost)}` : `Lo cobras ${formatPesos(i.price ?? 0)} · falta el costo`} onPress={goCosts} />
          ))}
        </SystemGroup>
      </SystemSection>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 20, gap: 24 },
  card: { gap: 12, padding: 16, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  label: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  hero: { fontSize: 40, lineHeight: 46, fontFamily: fonts.display.bold, color: colors.ink, fontVariant: ['tabular-nums'] },
  note: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.semibold, color: colors.muted },
  body2: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.ui.semibold, color: colors.muted },
  listCard: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 20, backgroundColor: colors.surface, ...softShadow },
  row: { gap: 6, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
  rowOn: { backgroundColor: colors.selectedSoft },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowTitle: { flex: 1, minWidth: 0, fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowValue: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.line },
  fill: { height: 6, borderRadius: 3 },
  detailTitle: { fontSize: 19, lineHeight: 24, fontFamily: fonts.display.bold, color: colors.ink },
  split: { height: 14, flexDirection: 'row', borderRadius: 7, overflow: 'hidden' },
});
