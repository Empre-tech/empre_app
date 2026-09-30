import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi, usersApi } from '@/api/endpoints';
import type { EntityMap } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { SignInPrompt } from '@/components/SignInPrompt';
import { categoryColor } from '@/lib/categoryColor';
import { colors, fonts, radius, spacing } from '@/theme';

export default function FavoritesScreen() {
  const { status } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const favorites = useQuery({
    queryKey: ['my-favorites'],
    queryFn: usersApi.favorites,
    enabled: status === 'signedIn',
  });

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
        <Text style={styles.headerTitle}>Mis favoritos</Text>
      </View>

      {status !== 'signedIn' ? (
        <SignInPrompt title="Tus favoritos" message="Inicia sesión para guardar y ver tus negocios favoritos." />
      ) : favorites.isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.centered} />
      ) : favorites.isError ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No pudimos cargar tus favoritos.</Text>
          <Button title="Reintentar" variant="secondary" onPress={() => void favorites.refetch()} />
        </View>
      ) : (favorites.data ?? []).length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="heart-outline" size={32} color={colors.muted} />
          <Text style={styles.empty}>
            Todavía no tienes negocios favoritos. Toca el corazón en el perfil de un negocio para guardarlo aquí.
          </Text>
        </View>
      ) : (
        <FlatList
          data={favorites.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
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
  const { bg, fg } = categoryColor(entity.category_id);

  const onUnfavorite = async () => {
    setRemoving(true);
    try {
      await entitiesApi.unfavorite(entity.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-favorites'] }),
        queryClient.invalidateQueries({ queryKey: ['entity', entity.id] }),
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
        accessibilityLabel="Quitar de favoritos"
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
