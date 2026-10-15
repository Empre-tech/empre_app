import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categoriesApi } from '@/api/endpoints';
import { offersApi } from '@/api/offers';
import type { PromotionListItem, RelampagoListItem } from '@/api/types';
import { Button } from '@/components/Button';
import { formatCurrency, formatOfferEndsAt, formatSlotsLeft, offerTypeLabel } from '@/lib/offer';
import { formatDistance } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

type OffersView = 'relampagos' | 'promotions';
type Order = 'near' | 'trending';

/** Pestaña Ofertas: relámpagos y promociones activos, con orden y filtros. */
export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<OffersView>('relampagos');
  const [order, setOrder] = useState<Order>('near');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getLastKnownPositionAsync();
        if (pos) setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        // Sin ubicación: el listado ordena por urgencia o sin distancia.
      }
    })();
  }, []);

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list, staleTime: 5 * 60_000 });

  const feed = useQuery({
    queryKey: ['offers-feed', order, categoryId ?? 'all', coords ? `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}` : 'no-ref'],
    queryFn: () =>
      offersApi.feed({
        lat: coords?.latitude,
        long: coords?.longitude,
        category: categoryId,
        order,
      }),
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>Ofertas</Text>

      <View style={styles.segment}>
        <SegmentButton label="Relámpago" active={view === 'relampagos'} onPress={() => setView('relampagos')} />
        <SegmentButton label="Promociones" active={view === 'promotions'} onPress={() => setView('promotions')} />
      </View>

      <View style={styles.orderRow}>
        <OrderButton label="Cerca de ti" active={order === 'near'} onPress={() => setOrder('near')} />
        <OrderButton label="Lo más buscado" active={order === 'trending'} onPress={() => setOrder('trending')} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        <CategoryChip label="Todas" active={!categoryId} onPress={() => setCategoryId(undefined)} />
        {(categories.data ?? []).map((c) => (
          <CategoryChip
            key={c.id}
            label={c.name}
            active={categoryId === c.id}
            onPress={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
          />
        ))}
      </ScrollView>

      {feed.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : view === 'relampagos' ? (
        <FlatList
          data={feed.data?.relampagos ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyOffers />}
          renderItem={({ item }) => (
            <RelampagoCard item={item} onPress={() => router.push({ pathname: '/business/[id]', params: { id: item.entity_id } })} />
          )}
        />
      ) : (
        <FlatList
          data={feed.data?.promotions ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyOffers />}
          renderItem={({ item }) => (
            <PromotionCard item={item} onPress={() => router.push({ pathname: '/business/[id]', params: { id: item.entity_id } })} />
          )}
        />
      )}
    </View>
  );
}

function EmptyOffers() {
  const router = useRouter();
  return (
    <View style={styles.empty}>
      <Ionicons name="pricetag-outline" size={40} color={colors.muted} />
      <Text style={styles.emptyTitle}>Aún no hay ofertas cerca</Text>
      <Text style={styles.emptyText}>Explora el mapa para ver más negocios.</Text>
      <Button title="Ver en el mapa" variant="secondary" onPress={() => router.replace('/')} style={styles.emptyButton} />
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function OrderButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.orderBtn, active && styles.orderBtnActive]}>
      <Text style={[styles.orderText, active && styles.orderTextActive]}>{label}</Text>
    </Pressable>
  );
}

function CategoryChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function RelampagoCard({ item, onPress }: { item: RelampagoListItem; onPress: () => void }) {
  const distance = item.distance_meters > 0 ? formatDistance(item.distance_meters / 1000) : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Ionicons name="flash" size={16} color={colors.accent} />
      </View>
      <Text style={styles.cardMeta}>
        {item.entity_name} · {item.category_name}
        {distance ? ` · ${distance}` : ''}
      </Text>
      <Text style={styles.cardPrice}>{formatCurrency(item.price)}</Text>
      <Text style={styles.cardMeta}>
        {offerTypeLabel(item.type)} · hasta {formatOfferEndsAt(item.ends_at)} · {formatSlotsLeft(item.slots_left)}
      </Text>
    </Pressable>
  );
}

function PromotionCard({ item, onPress }: { item: PromotionListItem; onPress: () => void }) {
  const distance = item.distance_meters > 0 ? formatDistance(item.distance_meters / 1000) : null;
  const value = item.discount ? `${item.discount}%` : formatCurrency(item.price);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        {value ? <Text style={styles.promoValue}>{value}</Text> : null}
      </View>
      <Text style={styles.cardMeta}>
        {item.entity_name} · {item.category_name}
        {distance ? ` · ${distance}` : ''}
      </Text>
      <Text style={styles.cardMeta}>hasta {formatOfferEndsAt(item.ends_at)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  title: { fontSize: 24, fontFamily: fonts.display.bold, color: colors.ink, marginBottom: spacing.md },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, padding: 3, marginBottom: spacing.sm },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.muted },
  segmentTextActive: { color: '#fff' },
  orderRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  orderBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  orderBtnActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  orderText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  orderTextActive: { color: colors.primary },
  chipsRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.ink },
  chipTextActive: { color: '#fff' },
  list: { gap: spacing.md, paddingVertical: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 3, borderWidth: 1, borderColor: colors.line },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  cardMeta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  cardPrice: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.accent },
  promoValue: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.primary },
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxl },
  emptyTitle: { fontSize: 17, fontFamily: fonts.display.bold, color: colors.ink },
  emptyText: { fontSize: 14, fontFamily: fonts.ui.regular, color: colors.muted, textAlign: 'center' },
  emptyButton: { marginTop: spacing.md, minWidth: 180 },
});
