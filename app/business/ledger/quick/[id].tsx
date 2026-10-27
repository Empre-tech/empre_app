import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ledgerApi } from '@/api/ledger';
import { Button } from '@/components/Button';
import { MethodChips, PartyPicker, type PartyChoice } from '@/components/ledger/parts';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { cartTotal } from '@/lib/inventory';
import { formatPesos, METHOD_LABEL, newClientId, type PayMethod } from '@/lib/ledger';
import { queueSale, queueVoid } from '@/ledger/ledgerStore';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Atención rápida, pensada para restaurantes y negocios donde se vende todo el día: fichas grandes con lo que más se
 * vende, un toque suma uno, «Cobrar» guarda la venta y deja la pantalla lista para el siguiente cliente. Cada venta
 * queda con sus platos, así Mi negocio sabe cuántos de cada uno vendiste. Funciona sin señal.
 */
export default function QuickSaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entityId = id ?? '';
  const insets = useSafeAreaInsets();

  const items = useQuery({ queryKey: ['ledger', entityId, 'items'], queryFn: () => ledgerApi.items(entityId), enabled: Boolean(entityId), staleTime: 60_000 });
  // Solo para ordenar (lo más vendido primero) y marcar lo agotado; si no hay señal se usa el orden del catálogo.
  const inv = useQuery({ queryKey: ['ledger', entityId, 'inventory'], queryFn: () => ledgerApi.inventory(entityId), enabled: Boolean(entityId), staleTime: 60_000 });

  const tiles = useMemo(() => {
    const meta = new Map((inv.data?.items ?? []).filter((i) => i.kind === 'product').map((i) => [i.ref, i]));
    return (items.data ?? [])
      .filter((i) => i.price !== null)
      .map((i) => ({ ...i, sold: meta.get(i.id)?.sold_28 ?? 0, out: meta.get(i.id)?.status === 'out' && meta.get(i.id)?.mode !== 'none' }))
      .sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name, 'es'));
  }, [items.data, inv.data]);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PayMethod>('cash');
  const [party, setParty] = useState<PartyChoice | null>(null);
  const [last, setLast] = useState<{ clientId: string; total: number; method: PayMethod } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = tiles.filter((t) => (qty[t.id] ?? 0) > 0);
  const total = cartTotal(lines.map((t) => ({ price: t.price ?? 0, qty: qty[t.id] ?? 0 })));
  const count = lines.reduce((s, t) => s + (qty[t.id] ?? 0), 0);

  // El aviso «Cobrado · Deshacer» dura unos segundos.
  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => setLast(null), 8000);
    return () => clearTimeout(t);
  }, [last]);

  const bump = (id: string, delta: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));

  const charge = () => {
    if (total <= 0) return;
    if (method === 'credit' && !party) return setError('Un fiado necesita el cliente.');
    const clientId = newClientId();
    queueSale(entityId, {
      client_id: clientId,
      total,
      method,
      party_id: method === 'credit' ? party?.id : undefined,
      lines: lines.map((t) => ({ item_id: t.id, name: t.name, qty: qty[t.id] ?? 1, unit_price: t.price ?? undefined })),
    });
    setLast({ clientId, total, method });
    setQty({});
    setParty(null);
    setMethod('cash');
    setError(null);
  };

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Atención rápida" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        {tiles.length === 0 ? (
          <Text style={styles.hint}>Aquí aparecen tus productos con precio para venderlos con un toque. Agrégalos en tu catálogo.</Text>
        ) : (
          <Text style={styles.hint}>Toca lo que pidió el cliente. Para quitar uno, toca el «−».</Text>
        )}
        <View style={styles.grid}>
          {tiles.map((t) => {
            const n = qty[t.id] ?? 0;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`${t.name}, ${formatPesos(t.price ?? 0)}${n > 0 ? `, ${n} en la cuenta` : ''}`}
                onPress={() => bump(t.id, 1)}
                style={({ pressed }) => [styles.tile, n > 0 && styles.tileOn, pressed && { opacity: 0.85 }]}
              >
                <Text style={[styles.tileName, n > 0 && { color: '#fff' }]} numberOfLines={2}>{t.name}</Text>
                <Text style={[styles.tilePrice, n > 0 && { color: '#fff' }]}>{formatPesos(t.price ?? 0)}</Text>
                {t.out ? <Text style={styles.out}>Agotado</Text> : null}
                {n > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{n}</Text>
                  </View>
                ) : null}
                {n > 0 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Quitar uno de ${t.name}`} onPress={() => bump(t.id, -1)} hitSlop={8} style={styles.minus}>
                    <Ionicons name="remove" size={18} color={colors.primary} />
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {last ? (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.toastText}>Cobrado {formatPesos(last.total)} · {METHOD_LABEL[last.method]}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              queueVoid('sale', entityId, last.clientId, 'Deshecha al momento');
              setLast(null);
            }}
            hitSlop={8}
          >
            <Text style={styles.toastUndo}>Deshacer</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {count > 0 ? (
          <>
            <MethodChips value={method} onChange={setMethod} />
            {method === 'credit' ? <PartyPicker entityId={entityId} kind="customer" value={party} onChange={setParty} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        ) : null}
        <Button title={count > 0 ? `Cobrar · ${formatPesos(total)}` : 'Toca un producto para empezar'} disabled={count === 0} onPress={charge} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hint: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '48%', minHeight: 92, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, padding: spacing.md, justifyContent: 'space-between' },
  tileOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileName: { fontSize: 16, fontFamily: fonts.ui.bold, color: colors.ink, paddingRight: 26 },
  tilePrice: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  out: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.danger },
  badge: { position: 'absolute', top: 8, right: 8, minWidth: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.primary },
  minus: { position: 'absolute', bottom: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.md },
  toastText: { flex: 1, fontSize: 14.5, fontFamily: fonts.ui.semibold, color: '#fff' },
  toastUndo: { fontSize: 14.5, fontFamily: fonts.ui.bold, color: '#fff', textDecorationLine: 'underline' },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  error: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.danger },
});
