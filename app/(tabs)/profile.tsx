import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, Modal } from 'react-native';
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
import { ledgerApi } from '@/api/ledger';
import { formatPesos } from '@/lib/ledger';
import { todayCO } from '@/lib/finance';
import { getPhoneFlag, setPhoneFlag } from '@/lib/phoneFlags';
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
  // El negocio en el que estás trabajando: lo recuerda este teléfono.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  useEffect(() => {
    void getPhoneFlag('active-business').then(setActiveId);
  }, []);
  const entities = mine.data ?? [];
  const active = entities.find((e) => e.id === activeId)?.id ?? entities[0]?.id;
  const pick = (id: string) => {
    setActiveId(id);
    void setPhoneFlag('active-business', id);
  };
  const today = todayCO();
  const todays = useQueries({
    queries: entities.map((e) => ({
      queryKey: ['ledger', e.id, 'analytics', today, today, 'prev'],
      queryFn: () => ledgerApi.analytics(e.id, { from: today, to: today, compare: 'prev' as const }),
      staleTime: 60_000,
      retry: false,
      enabled: status === 'signedIn',
    })),
  });
  const salesOf = (id: string) => todays[entities.findIndex((e) => e.id === id)]?.data?.current;
  const allTotal = todays.reduce((s, q) => s + (q.data?.current.sales_total ?? 0), 0);

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

  const hasBusiness = (mine.data ?? []).length > 0;
  const allSheet = (
    <Modal visible={allOpen} transparent animationType="slide" onRequestClose={() => setAllOpen(false)}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.veil} onPress={() => setAllOpen(false)} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={styles.section} accessibilityRole="header">
          Todos mis negocios · hoy
        </Text>
        {entities.map((e) => (
          <View key={e.id} style={styles.allRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {e.name}
            </Text>
            <Text style={styles.cardTitle}>{formatPesos(salesOf(e.id)?.sales_total ?? 0)}</Text>
          </View>
        ))}
        <View style={[styles.allRow, styles.allTotal]}>
          <Text style={styles.cardTitle}>Total</Text>
          <Text style={styles.cardTitle}>{formatPesos(allTotal)}</Text>
        </View>
        <Text style={styles.meta}>Solo para ver. Cada venta, gasto o canje se registra en un negocio a la vez.</Text>
      </View>
    </Modal>
  );
  const businesses = (
    <>
      <View style={styles.sectionRow}>
        <Text style={styles.section}>{hasBusiness ? `Mis negocios${entities.length > 1 ? ` · ${entities.length}` : ''}` : 'Tu negocio'}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/business/new')} hitSlop={8}>
          <Text style={styles.link}>+ Crear negocio</Text>
        </Pressable>
      </View>
      {mine.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : mine.isError ? (
        <Text style={styles.empty}>No pudimos cargar tus negocios.</Text>
      ) : (mine.data ?? []).length === 0 ? (
        <Text style={styles.empty}>¿Tienes un negocio? Ponlo en Empre para que te encuentren cerca.</Text>
      ) : (
        (mine.data ?? []).map((entity) => (
          <Pressable
            key={entity.id}
            accessibilityRole="button"
            accessibilityState={{ selected: entity.id === active }}
            accessibilityLabel={entities.length > 1 && entity.id !== active ? `${entity.name}. Toca para trabajar en él` : `${entity.name}, negocio activo. Administrar`}
            onPress={() => (entities.length > 1 && entity.id !== active ? pick(entity.id) : router.push({ pathname: '/business/hub/[id]', params: { id: entity.id } }))}
            style={({ pressed }) => [styles.card, entities.length > 1 && entity.id === active && styles.cardActive, pressed && { opacity: 0.85 }]}
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
            {entity.id === active ? (
              <View style={styles.activeBlock}>
                {entities.length > 1 ? <Text style={styles.activeTag}>ACTIVO</Text> : null}
                {salesOf(entity.id) ? (
                  <Text style={styles.meta}>
                    Hoy · {salesOf(entity.id)!.sales_count === 1 ? '1 venta' : `${salesOf(entity.id)!.sales_count} ventas`} · {formatPesos(salesOf(entity.id)!.sales_total)}
                  </Text>
                ) : null}
                <View style={styles.quickRow}>
                  <QuickAction icon="scan-outline" label="Canjear" onPress={() => router.push('/business/scan')} />
                  <QuickAction icon="add-circle-outline" label="Vender" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entity.id } })} />
                  <QuickAction icon="calendar-outline" label="Agenda" onPress={() => router.push({ pathname: '/business/agenda/[id]', params: { id: entity.id } })} />
                </View>
              </View>
            ) : null}
            {/* «Mi negocio» es el centro: datos, productos e inventario, fotos, ofertas, ventas, agenda y suscripción. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Administrar ${entity.name}`}
              onPress={() => router.push({ pathname: '/business/hub/[id]', params: { id: entity.id } })}
              style={({ pressed }) => [styles.ledgerStrip, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="storefront-outline" size={18} color={colors.primaryDark} />
              <Text style={styles.ledgerStripText} numberOfLines={1}>
                Administrar mi negocio
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primaryDark} />
            </Pressable>
          </Pressable>
        ))
      )}
    </>
  );

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

      {hasBusiness || mine.isLoading ? businesses : null}
      {entities.length > 1 ? (
        <Pressable accessibilityRole="button" onPress={() => setAllOpen(true)} style={({ pressed }) => [styles.allBtn, pressed && { opacity: 0.85 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Todos mis negocios</Text>
            <Text style={styles.meta}>Ventas de hoy: {formatPesos(allTotal)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
      {allSheet}

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
        onPress={() => router.push('/agent/privacy')}
        style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.adminCardIcon}>
          <Ionicons name="shield-checkmark-outline" size={19} color={colors.primary} />
        </View>
        <Text style={styles.adminCardText}>Lo que Agent sabe de ti</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/salidas')}
        style={({ pressed }) => [styles.adminCard, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.adminCardIcon}>
          <Ionicons name="qr-code-outline" size={19} color={colors.primary} />
        </View>
        <Text style={styles.adminCardText}>Mis salidas</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      {/* La guía de la primera vez de Explorar (3.23), para volver a verla. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/map', params: { guide: '1' } })}
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

      {!hasBusiness && !mine.isLoading ? businesses : null}
      <Button title="Cerrar sesión" variant="secondary" onPress={() => void signOut()} style={styles.logout} />
    </ScrollView>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={18} color={colors.ink} />
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardActive: { borderWidth: 2, borderColor: colors.ink },
  activeBlock: { width: '100%', gap: spacing.sm },
  activeTag: { alignSelf: 'flex-start', fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.ui.extrabold, color: colors.ink },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quick: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.md, backgroundColor: colors.selectedSoft },
  quickText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  allBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  veil: { flex: 1, backgroundColor: 'rgba(11,26,54,0.45)' },
  sheet: { gap: spacing.sm, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.surface },
  allRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  allTotal: { borderTopWidth: 1, borderTopColor: colors.line },
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
