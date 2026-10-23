import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi, usersApi } from '@/api/endpoints';
import type { VerificationStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { initAnalytics, isAnalyticsEnabled, setAnalyticsEnabled } from '@/analytics/track';
import { FEATURES } from '@/config';
import { SignInPrompt } from '@/components/SignInPrompt';
import { verificationLabel } from '@/lib/format';
import { pickImage } from '@/lib/images';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { requestsLabel } from '@/lib/inbox';
import { colors, fonts, radius, spacing } from '@/theme';

const STATUS_STYLE: Record<VerificationStatus, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  verified: { fg: colors.verified, bg: colors.verifiedSoft, icon: 'checkmark-circle' },
  pending: { fg: colors.warning, bg: '#FBF0DA', icon: 'time-outline' },
  rejected: { fg: colors.danger, bg: '#FBE4E4', icon: 'close-circle-outline' },
};

export default function ProfileScreen() {
  const inbox = useInboxSummary();
  const { status, user, signOut, refreshUser } = useAuth();
  // Medición anónima de uso (se puede apagar; al apagarla se cambia el identificador de la instalación).
  const [analyticsOn, setAnalyticsOn] = useState(true);
  useEffect(() => {
    void initAnalytics().then(() => setAnalyticsOn(isAnalyticsEnabled()));
  }, []);
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
        <SignInPrompt title="Tu perfil" message="Inicia sesión para ver tu cuenta y administrar tus negocios." variant="profile" />
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

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/favorites')}
        style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.adminCardIcon}>
          <Ionicons name="heart-outline" size={19} color={colors.primary} />
        </View>
        <Text style={styles.adminCardText}>Negocios que sigo</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/claims')}
        style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.adminCardIcon}>
          <Ionicons name="qr-code-outline" size={19} color={colors.primary} />
        </View>
        <Text style={styles.adminCardText}>Mis reclamos</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      {/* La guía de la primera vez de Explorar (3.23), para volver a verla. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/', params: { guide: '1' } })}
        style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.adminCardIcon}>
          <Ionicons name="map-outline" size={19} color={colors.primary} />
        </View>
        <Text style={styles.adminCardText}>Cómo usar el mapa</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      {FEATURES.agenda ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/appointments')}
          style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.adminCardIcon}>
            <Ionicons name="calendar-outline" size={19} color={colors.primary} />
          </View>
          <Text style={styles.adminCardText}>Mis citas</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : null}

      <View style={styles.adminCard}>
        <View style={styles.adminCardIcon}>
          <Ionicons name="analytics-outline" size={19} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.adminCardText}>Medición anónima de uso</Text>
          <Text style={{ fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted }}>
            Ayuda a mejorar Empre sin identificarte. Puedes apagarla.
          </Text>
        </View>
        <Switch
          value={analyticsOn}
          onValueChange={(on) => {
            setAnalyticsOn(on);
            void setAnalyticsEnabled(on);
          }}
          accessibilityLabel="Medición anónima de uso"
        />
      </View>

      {user.role === 'admin' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/admin')}
          style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.adminCardIcon}>
            <Ionicons name="shield-checkmark-outline" size={19} color={colors.primary} />
          </View>
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
            <View style={[styles.badge, { backgroundColor: STATUS_STYLE[entity.verification_status].bg }]}>
              <Ionicons
                name={STATUS_STYLE[entity.verification_status].icon}
                size={12}
                color={STATUS_STYLE[entity.verification_status].fg}
              />
              <Text style={[styles.badgeText, { color: STATUS_STYLE[entity.verification_status].fg }]}>
                {verificationLabel(entity.verification_status)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Gestionar ofertas de ${entity.name}`}
              hitSlop={8}
              onPress={() => router.push({ pathname: '/business/offers', params: { entityId: entity.id } })}
            >
              <Ionicons name="flash-outline" size={22} color={colors.primary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Editar ${entity.name}`}
              hitSlop={8}
              onPress={() => router.push({ pathname: '/business/edit/[id]', params: { id: entity.id } })}
            >
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </Pressable>
            {/* Solo lo de la agenda (3.37): solicitudes de cita por revisar, en su propia línea al pie de la tarjeta. */}
            {(inbox.byEntity.get(entity.id)?.requests ?? 0) > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${entity.name}: ${requestsLabel(inbox.byEntity.get(entity.id)?.requests ?? 0)}. Ver agenda`}
                onPress={() => router.push({ pathname: '/business/agenda/[id]', params: { id: entity.id } })}
                style={({ pressed }) => [styles.reqStrip, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.accentInk} />
                <Text style={styles.reqStripText} numberOfLines={1}>
                  {(inbox.byEntity.get(entity.id)?.requests ?? 0) === 1 ? '1 solicitud por revisar' : `${inbox.byEntity.get(entity.id)?.requests} solicitudes por revisar`}
                </Text>
                <Text style={styles.reqStripLink}>Ver agenda</Text>
              </Pressable>
            ) : null}
            {/* Administración del negocio (ventas, gastos, fiados): se está validando, por eso vive aquí y no en una pestaña. */}
            {FEATURES.ledger ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mi negocio: ventas, gastos y fiados de ${entity.name}`}
                onPress={() => router.push({ pathname: '/business/ledger/[id]', params: { id: entity.id } })}
                style={({ pressed }) => [styles.ledgerStrip, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="wallet-outline" size={18} color={colors.primaryDark} />
                <Text style={styles.ledgerStripText} numberOfLines={1}>
                  Mi negocio · ventas, gastos y fiados
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primaryDark} />
              </Pressable>
            ) : null}
          </Pressable>
        ))
      )}

      <Button title="Cerrar sesión" variant="secondary" onPress={() => void signOut()} style={styles.logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // La franja ocupa todo el ancho y pasa a su propia línea (la tarjeta envuelve).
  reqStrip: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  ledgerStrip: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  ledgerStripText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primaryDark },
  reqStripText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.bold, color: colors.accentInk },
  reqStripLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.md },
  headerInfo: { flex: 1, gap: 2 },
  name: { fontSize: 24, fontFamily: fonts.display.semibold, color: colors.ink },
  meta: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  avatarButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    ...Platform.select({
      ios: {
        shadowColor: colors.ink,
        shadowOpacity: 0.15,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      default: { elevation: 4 },
    }),
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
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
  adminCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCardText: { flex: 1, fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.ink },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  section: { fontSize: 18, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  link: { fontSize: 14, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.primary },
  empty: { color: colors.muted, fontSize: 14, fontFamily: fonts.ui.medium },
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontFamily: fonts.ui.bold },
  logout: { marginTop: spacing.xl },
});
