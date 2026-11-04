import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { entitiesApi, usersApi } from '@/api/endpoints';
import type { VerificationStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { EmpreSymbol, type EmpreProduct } from '@/components/EmpreSymbol';
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
import { colors, fonts } from '@/theme';

const version = Constants.expoConfig?.version;

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
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          Todos mis negocios · hoy
        </Text>
        {entities.map((e) => (
          <View key={e.id} style={styles.allRow}>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {e.name}
            </Text>
            <Text style={styles.rowLabel}>{formatPesos(salesOf(e.id)?.sales_total ?? 0)}</Text>
          </View>
        ))}
        <View style={[styles.allRow, styles.allTotal]}>
          <Text style={styles.rowLabel}>Total</Text>
          <Text style={styles.rowLabel}>{formatPesos(allTotal)}</Text>
        </View>
        <Text style={styles.rowSub}>Solo para ver. Cada venta, gasto o canje se registra en un negocio a la vez.</Text>
      </View>
    </Modal>
  );
  const businesses = (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.eyebrow} accessibilityRole="header">
          {`MIS NEGOCIOS${entities.length > 1 ? ` · ${entities.length}` : ''}`}
        </Text>
        {entities.length > 1 ? <Text style={styles.hint}>Toca uno para trabajar en él</Text> : null}
      </View>
      {mine.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : mine.isError ? (
        <Text style={styles.empty}>No pudimos cargar tus negocios.</Text>
      ) : (
        entities.map((entity) => {
          const isActive = entity.id === active;
          const reqs = inbox.byEntity.get(entity.id)?.requests ?? 0;
          const st = STATUS_STYLE[entity.verification_status];
          const today = salesOf(entity.id);
          return (
            <View key={entity.id} style={[styles.biz, entities.length > 1 && isActive && styles.bizOn]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={entities.length > 1 && !isActive ? `${entity.name}. Toca para trabajar en él` : `${entity.name}. Administrar mi negocio`}
                onPress={() => (entities.length > 1 && !isActive ? pick(entity.id) : router.push({ pathname: '/business/hub/[id]', params: { id: entity.id } }))}
                style={styles.bizTop}
              >
                <View style={styles.bizIcon}>
                  {entity.profile_url ? <Avatar uri={entity.profile_url} name={entity.name} size={48} /> : <Ionicons name="storefront-outline" size={22} color={colors.ink} />}
                </View>
                <View style={styles.bizText}>
                  <View style={styles.bizLine}>
                    <Text style={styles.bizName} numberOfLines={1}>
                      {entity.name}
                    </Text>
                    {entities.length > 1 && isActive ? <Text style={styles.activeTag}>ACTIVO</Text> : null}
                  </View>
                  <Text style={styles.bizCat} numberOfLines={1}>
                    {entity.category_name}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <Ionicons name={st.icon} size={12} color={st.fg} />
                  <Text style={[styles.badgeText, { color: st.fg }]}>{verificationLabel(entity.verification_status)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
              </Pressable>
              {reqs > 0 ? (
                <Pressable accessibilityRole="link" accessibilityLabel={`${entity.name}: ${requestsLabel(reqs)}. Ver agenda`} onPress={() => router.push({ pathname: '/business/agenda/[id]', params: { id: entity.id } })} style={styles.strip}>
                  <View style={styles.stripDot} />
                  <Text style={styles.stripText} numberOfLines={1}>
                    Hoy · {reqs} por responder
                  </Text>
                  <Text style={styles.stripLink}>Ver agenda ›</Text>
                </Pressable>
              ) : null}
              {isActive ? (
                <>
                  {today ? (
                    <Text style={styles.todayLine}>
                      Hoy · {today.sales_count === 1 ? '1 venta' : `${today.sales_count} ventas`} · {formatPesos(today.sales_total)}
                    </Text>
                  ) : null}
                  <View style={styles.quickRow}>
                    <QuickAction symbol="offers" icon="scan-outline" label="Canjear" onPress={() => router.push('/business/scan')} />
                    <QuickAction symbol="finance" icon="add-circle-outline" label="Vender" onPress={() => router.push({ pathname: '/business/ledger/sale/[id]', params: { id: entity.id } })} />
                    <QuickAction icon="calendar-outline" label="Agenda" onPress={() => router.push({ pathname: '/business/agenda/[id]', params: { id: entity.id } })} />
                  </View>
                </>
              ) : null}
            </View>
          );
        })
      )}
      {entities.length > 1 ? (
        <Pressable accessibilityRole="button" onPress={() => setAllOpen(true)} style={styles.allBtn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Todos mis negocios</Text>
            <Text style={styles.rowSub}>Ventas de hoy: {formatPesos(allTotal)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/business/new')} style={styles.createBtn}>
        <Text style={styles.createText}>+ Crear otro negocio</Text>
      </Pressable>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil" onPress={() => void changePhoto()} style={styles.avatarButton}>
          <Avatar uri={user.profile_picture_url} name={user.name} size={64} />
          <View style={styles.avatarBadge}>{uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={13} color="#fff" />}</View>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
          </Text>
          <Text style={styles.contact} numberOfLines={1}>
            {user.phone || user.email}
          </Text>
        </View>
      </View>

      {hasBusiness || mine.isLoading ? businesses : null}
      {allSheet}

      <View style={styles.section}>
        <Text style={styles.eyebrow} accessibilityRole="header">
          LO TUYO
        </Text>
        <View style={styles.group}>
          <MenuRow first icon="qr-code-outline" label="Mis salidas" sub="Tus QR, tus planes y lo ahorrado" onPress={() => router.push('/salidas')} />
          {FEATURES.agenda ? <MenuRow icon="calendar-outline" label="Mis citas" sub="Las que pediste y las que vienen" onPress={() => router.push('/appointments')} /> : null}
          <MenuRow icon="heart-outline" label="Negocios que sigo" sub="Lo que publican y sus ofertas" onPress={() => router.push('/favorites')} />
          <MenuRow icon="shield-checkmark-outline" label="Lo que Agent sabe de ti" sub="Qué recuerda y qué nunca guarda" onPress={() => router.push('/agent/privacy')} />
        </View>
      </View>

      {!hasBusiness && !mine.isLoading ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/business/new')} style={styles.invite}>
          <Ionicons name="storefront-outline" size={22} color={colors.ink} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowLabel}>¿Tienes un negocio?</Text>
            <Text style={styles.rowSub}>Ponlo en el mapa de Empre. Es gratis empezar.</Text>
          </View>
          <Text style={styles.inviteLink}>Crear ›</Text>
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.eyebrow} accessibilityRole="header">
          AJUSTES
        </Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="analytics-outline" size={19} color={colors.muted} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Medición anónima de uso</Text>
              <Text style={styles.rowSub}>Ayuda a mejorar Empre sin identificarte</Text>
            </View>
            <Switch
              value={analyticsOn}
              onValueChange={(on) => {
                setAnalyticsOn(on);
                void setAnalyticsEnabled(on);
              }}
              trackColor={{ true: colors.verified, false: colors.line }}
              thumbColor="#fff"
              accessibilityLabel="Medición anónima de uso"
            />
          </View>
          <MenuRow icon="map-outline" label="Cómo usar el mapa" onPress={() => router.push({ pathname: '/map', params: { guide: '1' } })} />
          {user.role === 'admin' ? <MenuRow icon="settings-outline" label="Panel de administración" onPress={() => router.push('/admin')} /> : null}
          <MenuRow danger icon="log-out-outline" label="Cerrar sesión" onPress={() => void signOut()} />
        </View>
        {version ? <Text style={styles.version}>Empre · versión {version}</Text> : null}
      </View>
    </ScrollView>
  );
}

function MenuRow({ icon, label, sub, onPress, first, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; first?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && { opacity: 0.8 }]}>
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.muted} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {danger ? null : <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />}
    </Pressable>
  );
}

function QuickAction({ symbol, icon, label, onPress }: { symbol?: EmpreProduct; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.8 }]}>
      {symbol ? <EmpreSymbol product={symbol} size={30} /> : <View style={styles.quickIcon}><Ionicons name={icon} size={18} color={colors.verified} /></View>}
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerInfo: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display.bold, color: colors.ink },
  contact: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.faint },
  avatarButton: { width: 64, height: 64, borderRadius: 32 },
  avatarBadge: { position: 'absolute', right: -3, bottom: -3, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg, backgroundColor: colors.primary },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  eyebrow: { fontSize: 12, letterSpacing: 1.2, fontFamily: fonts.ui.extrabold, color: colors.faint },
  hint: { fontSize: 12, fontFamily: fonts.ui.bold, color: colors.faint },
  empty: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  biz: { padding: 14, gap: 12, borderRadius: 20, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  bizOn: { borderWidth: 2, borderColor: colors.ink },
  bizTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bizIcon: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  bizText: { flex: 1, minWidth: 0, gap: 2 },
  bizLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bizName: { flexShrink: 1, fontSize: 17, lineHeight: 21, fontFamily: fonts.display.bold, color: colors.ink },
  activeTag: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.primary, fontSize: 11, letterSpacing: 0.9, fontFamily: fonts.ui.extrabold, color: '#fff' },
  bizCat: { fontSize: 12.5, fontFamily: fonts.ui.medium, color: colors.faint },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  badgeText: { fontSize: 12, fontFamily: fonts.ui.extrabold },
  strip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.accentSoft },
  stripDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  stripText: { flex: 1, fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  stripLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.accentInk },
  todayLine: { fontSize: 12.5, fontFamily: fonts.ui.bold, color: colors.muted },
  quickRow: { flexDirection: 'row', gap: 8 },
  quick: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 16, borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface },
  quickIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.verifiedSoft },
  quickText: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.ink },
  allBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, padding: 12, borderRadius: 16, backgroundColor: colors.surface },
  createBtn: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  createText: { fontSize: 14, fontFamily: fonts.ui.extrabold, color: colors.muted },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  inviteLink: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  group: { paddingVertical: 2, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.selectedSoft },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selectedSoft },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowLabel: { fontSize: 14.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  rowSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.faint },
  version: { paddingTop: 6, fontSize: 12, fontFamily: fonts.ui.medium, color: colors.placeholder, textAlign: 'center' },
  veil: { flex: 1, backgroundColor: 'rgba(14,35,70,0.38)' },
  sheet: { gap: 8, paddingTop: 16, paddingHorizontal: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  sheetTitle: { fontSize: 20, lineHeight: 25, fontFamily: fonts.display.bold, color: colors.ink },
  allRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  allTotal: { borderTopWidth: 1, borderTopColor: colors.line },
});
