import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi, usersApi } from '@/api/endpoints';
import type { EntityMap } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonRows } from '@/components/Skeleton';
import { SignInPrompt } from '@/components/SignInPrompt';
import { categoryColor } from '@/lib/categoryColor';
import { colors, fonts, radius, spacing } from '@/theme';
import { usePullRefresh } from '@/lib/usePullRefresh';

export default function FavoritesScreen() {
  const { status } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const favorites = useQuery({
    queryKey: ['my-favorites'],
    queryFn: usersApi.favorites,
    enabled: status === 'signedIn',
  });
  const pull = usePullRefresh(favorites.refetch);

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Volver"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      style={styles.backButton}
      hitSlop={8}
    >
      <Ionicons name="chevron-back" size={24} color={colors.ink} />
    </Pressable>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {back}
        <Text style={styles.headerTitle}>Negocios que sigo</Text>
      </View>

      {status !== 'signedIn' ? (
        <SignInPrompt title="Negocios que sigues" message="Inicia sesión para seguir negocios y enterarte de sus novedades." />
      ) : favorites.isLoading ? (
        <SkeletonRows count={5} />
      ) : favorites.isError ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No pudimos cargar los negocios que sigues.</Text>
          <Button title="Reintentar" variant="secondary" onPress={() => void favorites.refetch()} />
        </View>
      ) : (favorites.data ?? []).length === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            icon="people-outline"
            title="Todavía no sigues ningún negocio"
            body="Toca «Seguir» en su perfil y verás aquí sus novedades."
            action={{ title: 'Descubrir negocios', onPress: () => router.push('/(tabs)') }}
          />
        </View>
      ) : (
        <FlatList
          data={favorites.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <FavoriteRow entity={item} onPress={() => router.push({ pathname: '/business/[id]', params: { id: item.id } })} />
          )}
        />
      )}
    </View>
  );
}

/** Fila de un favorito: caja de ícono teñida según la categoría del negocio
 * (en vez del avatar redondo genérico de BusinessRow), nombre, "categoría ·
 * distancia" en una sola línea, y un corazón lleno para quitarlo de favoritos
 * sin tener que entrar al perfil. */
function FavoriteRow({ entity, onPress }: { entity: EntityMap; onPress: () => void }) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState(false);
  const { bg, fg } = categoryColor(entity.category_color);

  const onUnfavorite = async () => {
    setRemoving(true);
    try {
      await entitiesApi.unfavorite(entity.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-favorites'] }),
        queryClient.invalidateQueries({ queryKey: ['entity', entity.id] }),
        queryClient.invalidateQueries({ queryKey: ['novedades'] }),
      ]);
    } catch {
      setRemoving(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil de ${entity.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.iconBox, { backgroundColor: bg }]}>
        <Ionicons name={(entity.category_icon || 'storefront-outline') as keyof typeof Ionicons.glyphMap} size={24} color={fg} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {entity.name}
        </Text>
        {entity.category_name ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {entity.category_name}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dejar de seguir"
        onPress={() => void onUnfavorite()}
        disabled={removing}
        hitSlop={8}
      >
        <Ionicons name="heart" size={22} color={removing ? colors.line : colors.accent} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowPressed: { opacity: 0.85 },
  iconBox: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1, minWidth: 0, gap: 3 },
  rowName: { fontSize: 16, fontFamily: fonts.display.bold, color: colors.ink },
  rowMeta: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backButton: { padding: 4, marginLeft: -4 },
  headerTitle: { fontSize: 20, fontFamily: fonts.display.semibold, color: colors.ink },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  empty: { color: colors.muted, fontSize: 14, fontFamily: fonts.ui.medium, textAlign: 'center' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  separator: { height: spacing.sm },
});
