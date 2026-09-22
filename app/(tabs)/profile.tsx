import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi, usersApi } from '@/api/endpoints';
import type { VerificationStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { SignInPrompt } from '@/components/SignInPrompt';
import { verificationLabel } from '@/lib/format';
import { pickImage } from '@/lib/images';
import { colors, fonts, radius, spacing } from '@/theme';

const statusColor: Record<VerificationStatus, string> = {
  verified: colors.success,
  pending: colors.warning,
  rejected: colors.danger,
};

export default function ProfileScreen() {
  const { status, user, signOut, refreshUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const mine = useQuery({
    queryKey: ['my-entities'],
    queryFn: entitiesApi.mine,
    enabled: status === 'signedIn',
  });

  if (status !== 'signedIn' || !user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <SignInPrompt title="Tu perfil" message="Inicia sesión para ver tu cuenta y administrar tus negocios." />
      </View>
    );
  }

  const changePhoto = async () => {
    if (uploadingPhoto) return;
    try {
      const image = await pickImage({ aspect: [1, 1], maxWidth: 800 });
      if (!image) return;
      setUploadingPhoto(true);
      await usersApi.uploadProfileImage(image);
      await refreshUser();
      // Los negocios y chats no cambian, pero por si otra pantalla muestra tu foto.
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (error) {
      Alert.alert('No pudimos cambiar tu foto', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar foto de perfil"
          onPress={() => void changePhoto()}
          style={styles.avatarButton}
        >
          <Avatar uri={user.profile_picture_url} name={user.name} size={72} />
          <View style={styles.avatarBadge}>
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera" size={14} color="#fff" />
            )}
          </View>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.meta}>{user.email}</Text>
          {user.phone ? <Text style={styles.meta}>{user.phone}</Text> : null}
        </View>
      </View>

      {user.role === 'admin' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/admin')}
          style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={styles.adminCardText}>Panel de administración</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      )}

      <View style={styles.sectionRow}>
        <Text style={styles.section}>Mis negocios</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/business/new')} hitSlop={8}>
          <Text style={styles.link}>+ Crear negocio</Text>
        </Pressable>
      </View>
      {mine.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : mine.isError ? (
        <Text style={styles.empty}>No pudimos cargar tus negocios.</Text>
      ) : (mine.data ?? []).length === 0 ? (
        <Text style={styles.empty}>Aún no tienes negocios registrados. Crea el primero con “+ Crear negocio”.</Text>
      ) : (
        (mine.data ?? []).map((entity) => (
          <Pressable
            key={entity.id}
            onPress={() => router.push({ pathname: '/business/[id]', params: { id: entity.id } })}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
          >
            <Avatar uri={entity.profile_url} name={entity.name} size={48} />
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {entity.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {entity.category_name}
              </Text>
            </View>
            <Text style={[styles.badge, { color: statusColor[entity.verification_status] }]}>
              {verificationLabel(entity.verification_status)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Editar ${entity.name}`}
              hitSlop={8}
              onPress={() => router.push({ pathname: '/business/edit/[id]', params: { id: entity.id } })}
            >
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </Pressable>
          </Pressable>
        ))
      )}

      <Button title="Cerrar sesión" variant="secondary" onPress={() => void signOut()} style={styles.logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.md },
  headerInfo: { flex: 1, gap: 2 },
  name: { fontSize: 24, fontFamily: fonts.display.semibold, color: colors.ink },
  meta: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  avatarButton: { width: 72, height: 72 },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
  },
  adminCardText: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  section: { fontSize: 18, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  link: { fontSize: 14, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.primary },
  empty: { color: colors.muted, fontSize: 14, fontFamily: fonts.ui.medium },
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
  badge: { fontSize: 13, fontWeight: '700', fontFamily: fonts.ui.bold },
  logout: { marginTop: spacing.xl },
});
