import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { entitiesApi, reviewsApi } from '@/api/endpoints';
import type { Review } from '@/api/types';
import { ReviewCard } from '@/components/profile/ReviewCard';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { colors, fonts, radius, spacing } from '@/theme';

const PAGE = 20;

interface Filter {
  verified: boolean;
  withComment: boolean;
  stars: number;
}
const NONE: Filter = { verified: false, withComment: false, stars: 0 };

/**
 * «Todas las reseñas» de un negocio: las más recientes primero, de 20 en 20 al bajar, con filtros «Solo verificadas»,
 * «Con comentario» y por estrellas. Con un filtro sin resultados dice qué pasa y deja quitarlo.
 */
export default function ReviewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [filter, setFilter] = useState<Filter>(NONE);
  const active = filter.verified || filter.withComment || filter.stars > 0;

  const business = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id ?? ''), enabled: Boolean(id) });
  const feed = useInfiniteQuery({
    queryKey: ['reviews-page', id, filter],
    queryFn: ({ pageParam }) => reviewsApi.page(id ?? '', { page: pageParam, pageSize: PAGE, stars: filter.stars || undefined, verified: filter.verified, withComment: filter.withComment }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.flatMap((p) => p.data).length < last.total ? pages.length + 1 : undefined),
    enabled: Boolean(id),
  });

  const reviews: Review[] = useMemo(() => feed.data?.pages.flatMap((p) => p.data) ?? [], [feed.data]);
  const total = feed.data?.pages[0]?.total ?? 0;
  const toggle = (patch: Partial<Filter>) => setFilter((f) => ({ ...f, ...patch }));

  const chip = (label: string, on: boolean, onPress: () => void, a11y?: string) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <SubScreenHeader title={business.data ? `Reseñas · ${business.data.name}` : 'Reseñas'} />
      <View style={styles.filtersWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityLabel="Ordenar y filtrar">
          {chip('Más recientes', !active, () => setFilter(NONE))}
          {chip('Solo verificadas', filter.verified, () => toggle({ verified: !filter.verified }))}
          {chip('Con comentario', filter.withComment, () => toggle({ withComment: !filter.withComment }))}
          {[5, 4, 3, 2, 1].map((n) => chip(`${n} ★`, filter.stars === n, () => toggle({ stars: filter.stars === n ? 0 : n }), `${n} estrellas`))}
        </ScrollView>
      </View>
      {total > 0 ? <Text style={styles.count}>Mostrando {reviews.length} de {total}</Text> : null}

      {feed.isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : feed.isError ? (
        <View style={styles.state} accessibilityRole="alert">
          <Text style={styles.stateTitle}>No pudimos cargar las reseñas</Text>
          <Pressable accessibilityRole="button" onPress={() => void feed.refetch()} style={styles.btn}>
            <Text style={styles.btnText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : reviews.length === 0 ? (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>{active ? 'Ninguna reseña con ese filtro' : 'Aún sin reseñas'}</Text>
          {active ? (
            <Pressable accessibilityRole="button" onPress={() => setFilter(NONE)} style={styles.btn}>
              <Text style={styles.btnText}>Quitar filtros</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <ReviewCard review={item} />}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
          }}
          ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : feed.hasNextPage ? null : <Text style={[styles.count, styles.footer]}>Llegaste al final</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filtersWrap: { backgroundColor: colors.bg },
  filters: { gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  chipTextOn: { color: colors.white },
  count: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs, fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  loader: { marginVertical: spacing.lg },
  footer: { textAlign: 'center', paddingVertical: spacing.lg },
  state: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  stateTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  btn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
