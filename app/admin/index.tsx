import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminApi } from '@/api/endpoints';
import type { EntityOwnerItem, VerificationStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { SignInPrompt } from '@/components/SignInPrompt';
import { colors, fonts, radius, spacing } from '@/theme';

const TABS: { key: VerificationStatus; label: string }[] = [
  { key: 'pending', label: 'En revisión' },
  { key: 'verified', label: 'Verificados' },
  { key: 'rejected', label: 'Rechazados' },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminScreen() {
  const { status, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<VerificationStatus>('pending');
  const [workingId, setWorkingId] = useState<string | null>(null);

  const isAdmin = status === 'signedIn' && user?.role === 'admin';
  const query = useQuery({
    queryKey: ['admin-entities', tab],
    queryFn: () => adminApi.listEntities({ status: tab, pageSize: 50 }),
    enabled: isAdmin,
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

  if (status !== 'signedIn' || !user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {back}
          <Text style={styles.headerTitle}>Administración</Text>
        </View>
        <SignInPrompt title="Panel de administración" message="Inicia sesión con una cuenta de administrador." />
      </View>
    );
  }

  if (user.role !== 'admin') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {back}
          <Text style={styles.headerTitle}>Administración</Text>
        </View>
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.muted} />
          <Text style={styles.empty}>No tienes permisos para ver esta sección.</Text>
        </View>
      </View>
    );
  }

  const entities = query.data?.data ?? [];

  const review = async (entity: EntityOwnerItem, nextStatus: 'verified' | 'rejected') => {
    if (workingId) return;
    setWorkingId(entity.id);
    try {
      await adminApi.verifyEntity(entity.id, nextStatus);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-entities'] }),
        queryClient.invalidateQueries({ queryKey: ['entities'] }),
        queryClient.invalidateQueries({ queryKey: ['entity', entity.id] }),
        queryClient.invalidateQueries({ queryKey: ['my-entities'] }),
      ]);
    } catch (error) {
      Alert.alert(
        'No pudimos actualizar el negocio',
        error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      );
    } finally {
      setWorkingId(null);
    }
  };

  const confirmReview = (entity: EntityOwnerItem, nextStatus: 'verified' | 'rejected') => {
    const verb = nextStatus === 'verified' ? 'verificar' : 'rechazar';
    Alert.alert(`¿${verb.charAt(0).toUpperCase() + verb.slice(1)} "${entity.name}"?`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: verb.charAt(0).toUpperCase() + verb.slice(1), onPress: () => void review(entity, nextStatus) },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {back}
        <Text style={styles.headerTitle}>Administración</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Categorías"
          onPress={() => router.push('/admin/categories')}
          style={styles.categoriesButton}
          hitSlop={8}
        >
          <Ionicons name="pricetags-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="button"
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.centered} />
      ) : query.isError ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No pudimos cargar la lista.</Text>
        </View>
      ) : entities.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="checkmark-done-outline" size={32} color={colors.muted} />
          <Text style={styles.empty}>No hay negocios en esta categoría.</Text>
        </View>
      ) : (
        <FlatList
          data={entities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isWorking = workingId === item.id;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/business/[id]', params: { id: item.id } })}
                style={styles.card}
              >
                <Avatar uri={item.profile_url} name={item.name} size={48} />
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.category_name}
                  </Text>
                  <Text style={styles.metaSmall}>Creado {formatDate(item.created_at)}</Text>
                </View>
                {isWorking ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <View style={styles.actions}>
                    {tab !== 'rejected' && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Rechazar ${item.name}`}
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation();
                          confirmReview(item, 'rejected');
                        }}
                        style={[styles.actionButton, styles.rejectButton]}
                      >
                        <Ionicons name="close" size={18} color={colors.danger} />
                      </Pressable>
                    )}
                    {tab !== 'verified' && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Verificar ${item.name}`}
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation();
                          confirmReview(item, 'verified');
                        }}
                        style={[styles.actionButton, styles.approveButton]}
                      >
                        <Ionicons name="checkmark" size={18} color={colors.success} />
                      </Pressable>
                    )}
                  </View>
                )}
              </Pressable>
            );
          }}
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
  headerTitle: { flex: 1, fontSize: 20, fontFamily: fonts.display.semibold, color: colors.ink },
  categoriesButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  tabTextActive: { color: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  empty: { color: colors.muted, fontSize: 14, fontFamily: fonts.ui.medium, textAlign: 'center' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  meta: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  metaSmall: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  actions: { flexDirection: 'row', gap: spacing.xs },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: { backgroundColor: colors.success + '1A' },
  rejectButton: { backgroundColor: colors.danger + '1A' },
});
