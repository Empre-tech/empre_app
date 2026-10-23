import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { entitiesApi } from '@/api/endpoints';
import { postsApi, type PostKind } from '@/api/posts';
import type { PostEntry } from '@/api/types';
import { PostViewer, type ViewerSlide } from '@/components/profile/PostViewer';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { categoryColor } from '@/lib/categoryColor';
import { resolveImageUrl } from '@/lib/image';
import { alpha, colors, fonts, radius, spacing } from '@/theme';

const PAGE = 30;
const COLUMNS = 3;
const GAP = 3;
const FILTERS: { id: PostKind; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'photo', label: 'Fotos' },
  { id: 'video', label: 'Videos' },
];
const isVideo = (type: string) => type?.startsWith('video/') ?? false;

/**
 * «Todas las fotos» de un negocio: cuadrícula de 3 columnas con las publicaciones más recientes primero, de 30 en 30
 * al bajar (mientras llegan, bloques del color de la categoría), filtro Todo / Fotos / Videos, insignias de video y de
 * varias fotos, y el visor al tocar una. Solo lectura: el dueño edita desde el perfil.
 */
export default function PhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<PostKind>('all');
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const size = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  const business = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id ?? ''), enabled: Boolean(id) });
  const feed = useInfiniteQuery({
    queryKey: ['posts', id, kind],
    queryFn: ({ pageParam }) => postsApi.page(id ?? '', { page: pageParam, pageSize: PAGE, type: kind }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.flatMap((p) => p.posts).length < last.total ? pages.length + 1 : undefined),
    enabled: Boolean(id),
  });

  const posts: PostEntry[] = useMemo(() => feed.data?.pages.flatMap((p) => p.posts) ?? [], [feed.data]);
  const total = feed.data?.pages[0]?.total ?? 0;
  const cat = categoryColor(business.data?.category?.color);

  // Un archivo del visor por cada archivo de cada publicación, en el mismo orden de la cuadrícula.
  const slides: ViewerSlide[] = useMemo(
    () => posts.flatMap((p) => p.items.map((it, i) => ({ key: it.id, url: it.url, isVideo: isVideo(it.content_type), caption: p.caption, createdAt: p.created_at, k: i + 1, n: p.items.length }))),
    [posts],
  );
  // En qué diapositiva empieza cada publicación.
  const firstSlide = useMemo(() => {
    const map = new Map<string, number>();
    let at = 0;
    for (const p of posts) {
      map.set(p.id, at);
      at += p.items.length;
    }
    return map;
  }, [posts]);

  const renderItem = ({ item }: { item: PostEntry }) => {
    const first = item.items[0];
    const video = first ? isVideo(first.content_type) : false;
    const extraFiles = item.items.length > 1;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${video ? 'Video' : 'Foto'}${extraFiles ? `, ${item.items.length} archivos` : ''}${item.caption ? `: ${item.caption}` : ''}`}
        onPress={() => setViewerAt(firstSlide.get(item.id) ?? 0)}
        style={{ width: size, height: size, backgroundColor: video ? cat.fg : colors.primarySoft }}
      >
        {first && !video ? <Image accessible={false} source={{ uri: resolveImageUrl(first.url) ?? undefined }} style={styles.image} contentFit="cover" transition={120} /> : null}
        {video ? (
          <View style={styles.videoFill}>
            <Ionicons name="play" size={28} color={alpha(colors.white, 0.95)} />
          </View>
        ) : null}
        {extraFiles ? (
          <View style={styles.badge}>
            <Ionicons name="copy-outline" size={11} color={colors.white} />
            <Text style={styles.badgeText}>{item.items.length}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <SubScreenHeader title={business.data ? `Fotos · ${business.data.name}` : 'Fotos'} />
      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: kind === f.id }}
            onPress={() => setKind(f.id)}
            style={[styles.chip, kind === f.id && styles.chipOn]}
          >
            <Text style={[styles.chipText, kind === f.id && styles.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      {total > 0 ? <Text style={styles.count}>Mostrando {posts.length} de {total}</Text> : null}

      {feed.isLoading ? (
        <View style={styles.grid}>
          {Array.from({ length: 12 }, (_, i) => (
            <View key={i} style={{ width: size, height: size, backgroundColor: colors.line }} />
          ))}
        </View>
      ) : feed.isError ? (
        <View style={styles.state} accessibilityRole="alert">
          <Text style={styles.stateTitle}>No pudimos cargar las fotos</Text>
          <Pressable accessibilityRole="button" onPress={() => void feed.refetch()} style={styles.retry}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>{kind === 'video' ? 'No hay videos todavía' : kind === 'photo' ? 'No hay fotos todavía' : 'Este negocio todavía no tiene publicaciones'}</Text>
          {kind !== 'all' ? (
            <Pressable accessibilityRole="button" onPress={() => setKind('all')} style={styles.retry}>
              <Text style={styles.retryText}>Ver todo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
          }}
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} style={styles.footer} />
            ) : feed.hasNextPage ? null : (
              <Text style={[styles.count, styles.footer]}>Llegaste al final</Text>
            )
          }
        />
      )}

      <PostViewer
        key={viewerAt ?? 'closed'}
        visible={viewerAt !== null}
        slides={slides}
        startIndex={viewerAt ?? 0}
        businessName={business.data?.name ?? ''}
        businessAvatar={business.data?.profile_url}
        onClose={() => setViewerAt(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filters: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  chipTextOn: { color: colors.white },
  count: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs, fontSize: 12, fontFamily: fonts.ui.bold, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  image: { width: '100%', height: '100%' },
  videoFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: alpha(colors.night, 0.7) },
  badgeText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: colors.white },
  state: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  stateTitle: { fontSize: 15, fontFamily: fonts.display.bold, color: colors.ink, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  footer: { textAlign: 'center', paddingVertical: spacing.lg },
});
