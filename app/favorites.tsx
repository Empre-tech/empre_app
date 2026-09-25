import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { BusinessRow } from '@/components/BusinessRow';
import { Button } from '@/components/Button';
import { SignInPrompt } from '@/components/SignInPrompt';
import { colors, fonts, spacing } from '@/theme';

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
            <BusinessRow entity={item} onPress={() => router.push({ pathname: '/business/[id]', params: { id: item.id } })} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
