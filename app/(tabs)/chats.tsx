import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatApi, entitiesApi } from '@/api/endpoints';
import type { Conversation, EntityOwnerItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { NovedadesStrip } from '@/components/novedades/NovedadesStrip';
import { SignInPrompt } from '@/components/SignInPrompt';
import { useInboxSummary } from '@/chat/useInboxSummary';
import { formatMessageTime } from '@/lib/format';
import { requestsLabel } from '@/lib/inbox';
import { colors, fonts, radius, spacing } from '@/theme';
import { usePullRefresh } from '@/lib/usePullRefresh';

type Tab = 'personal' | 'business';

export default function ChatsScreen() {
  // Conteo de pendientes por pestaña y solicitudes de cita por negocio (3.37); la misma fuente que la barra.
  const inbox = useInboxSummary();
  const { status } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('personal');
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: chatApi.conversations,
    enabled: status === 'signedIn',
  });

  const myEntities = useQuery({
    queryKey: ['my-entities'],
    queryFn: entitiesApi.mine,
    enabled: status === 'signedIn' && tab === 'business',
  });
  const businessPull = usePullRefresh(useCallback(() => Promise.all([myEntities.refetch(), conversations.refetch()]), [myEntities, conversations]));

  // Personales: yo soy el cliente hablando con un negocio (other_party es el negocio).
  const personalConversations = (conversations.data ?? []).filter((c) => c.other_party.type === 'entity');

  // De mis negocios: yo soy el dueño hablando con un cliente (other_party es el cliente).
  const businessConversations = (conversations.data ?? []).filter((c) => c.other_party.type === 'user');
  // Este useMemo (y cualquier otro hook) debe ir SIEMPRE antes del `return`
  // condicional de abajo: si no, en un render sin sesión React monta menos
  // hooks que en uno con sesión y lanza "Rendered fewer hooks than expected".
  const conversationsByEntity = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const c of businessConversations) {
      const list = map.get(c.entity_id) ?? [];
      list.push(c);
      map.set(c.entity_id, list);
    }
    return map;
  }, [businessConversations]);

  if (status !== 'signedIn') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <SignInPrompt title="Habla con los negocios" message="Pregunta por horarios, precios o envíos directo con cada negocio." variant="messages" />
      </View>
    );
  }

  const open = (conversation: Conversation) => {
    const { other_party: party, entity_id: entityId } = conversation;
    if (!entityId) return;
    // Cliente: el otro lado es el negocio. Dueño: el otro lado es el cliente, y su id viaja como userId.
    router.push({
      pathname: '/chat/[entityId]',
      params: { entityId, name: party.name, avatar: party.profile_url, ...(party.type === 'user' ? { userId: party.id } : {}) },
    });
  };

  const selectedBusiness = (myEntities.data ?? []).find((e) => e.id === selectedBusinessId) ?? null;
  const selectedBusinessConversations = selectedBusinessId ? conversationsByEntity.get(selectedBusinessId) ?? [] : [];

  const switchTab = (next: Tab) => {
    setTab(next);
    setSelectedBusinessId(null);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Mensajes</Text>

      <View style={styles.tabs}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'personal' }}
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={() => switchTab('personal')}
          style={[styles.tab, tab === 'personal' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'personal' && styles.tabTextActive]}>Personales</Text>
          <TabCount n={inbox.personal} on={tab === 'personal'} />
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'business' }}
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={() => switchTab('business')}
          style={[styles.tab, tab === 'business' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'business' && styles.tabTextActive]}>Mis negocios</Text>
          <TabCount n={inbox.business} on={tab === 'business'} />
        </Pressable>
      </View>

      {tab === 'personal' ? <NovedadesStrip /> : null}

      {tab === 'personal' ? (
        <ConversationList
          loading={conversations.isLoading}
          error={conversations.isError}
          data={personalConversations}
          onRetry={() => void conversations.refetch()}
          onRefresh={conversations.refetch}
          onOpen={open}
          empty={{
            icon: 'chatbubbles-outline',
            title: 'Aún no tienes conversaciones',
            body: 'Abre el perfil de un negocio y toca «Escribirle».',
            action: { title: 'Explorar negocios', onPress: () => router.navigate('/') },
          }}
        />
      ) : selectedBusinessId ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedBusinessId(null)}
            style={styles.backRow}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
            <Text style={styles.backText}>{selectedBusiness?.name ?? 'Volver'}</Text>
          </Pressable>
          {(inbox.byEntity.get(selectedBusinessId)?.requests ?? 0) > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/business/agenda/[id]', params: { id: selectedBusinessId } })}
              style={({ pressed }) => [styles.reqBanner, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.accentInk} />
              <Text style={styles.reqBannerText}>
                {inbox.byEntity.get(selectedBusinessId)?.requests === 1 ? '1 solicitud de cita por revisar' : `${inbox.byEntity.get(selectedBusinessId)?.requests} solicitudes de cita por revisar`}
              </Text>
              <Text style={styles.reqBannerLink}>Ver agenda</Text>
            </Pressable>
          ) : null}
          <ConversationList
            loading={conversations.isLoading}
            error={conversations.isError}
            data={selectedBusinessConversations}
            onRetry={() => void conversations.refetch()}
            onRefresh={conversations.refetch}
            onOpen={open}
            empty={{
              icon: 'chatbubble-ellipses-outline',
              title: 'Sin conversaciones todavía',
              body: 'Cuando un cliente le escriba a este negocio, aparecerá aquí.',
            }}
          />
        </>
      ) : myEntities.isLoading ? (
        <ActivityIndicator style={styles.center} color={colors.primary} />
      ) : myEntities.isError ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No pudimos cargar tus negocios.</Text>
          <Button title="Reintentar" variant="secondary" onPress={() => void myEntities.refetch()} />
        </View>
      ) : (myEntities.data ?? []).length === 0 ? (
        <EmptyState
          icon="storefront-outline"
          title="Todavía no tienes negocios"
          body="Registra tu negocio para recibir mensajes de clientes."
          action={{ title: 'Registrar mi negocio', onPress: () => router.push('/business/new') }}
        />
      ) : (
        <FlatList
          data={myEntities.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={businessPull.refreshing}
          onRefresh={businessPull.onRefresh}
          renderItem={({ item }) => (
            <BusinessRow business={item} count={sumUnread(conversationsByEntity.get(item.id))} requests={inbox.byEntity.get(item.id)?.requests ?? 0} onPress={() => setSelectedBusinessId(item.id)} />
          )}
        />
      )}
    </View>
  );
}

/** Conteo de una pestaña de Mensajes: nada en 0. */
function TabCount({ n, on }: { n: number; on: boolean }) {
  if (n <= 0) return null;
  return (
    <View style={[styles.tabCount, on && styles.tabCountOn]} accessibilityLabel={`${n} sin leer`}>
      <Text style={[styles.tabCountText, on && styles.tabCountTextOn]}>{n > 9 ? '9+' : n}</Text>
    </View>
  );
}

/** Suma los mensajes sin leer de todas las conversaciones de un negocio (no cuántas conversaciones hay). */
function sumUnread(conversations?: Conversation[]): number {
  return (conversations ?? []).reduce((total, c) => total + c.unread_count, 0);
}

function BusinessRow({ business, count, requests, onPress }: { business: EntityOwnerItem; count: number; requests: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[business.name, count > 0 ? `${count} ${count === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}` : null, requests > 0 ? `${requestsLabel(requests)}` : null].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <Avatar uri={business.profile_url} name={business.name} size={52} />
      <View style={styles.rowInfo}>
        <Text style={styles.name} numberOfLines={1}>
          {business.name}
        </Text>
        <Text style={styles.snippet} numberOfLines={1}>
          {business.category_name}
        </Text>
        {requests > 0 ? (
          <View style={styles.reqPill}>
            <Ionicons name="calendar-outline" size={12} color={colors.accentInk} />
            <Text style={styles.reqPillText}>{requestsLabel(requests)}</Text>
          </View>
        ) : null}
      </View>
      {count > 0 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function ConversationList({
  loading,
  error,
  data,
  onRetry,
  onRefresh,
  onOpen,
  empty,
}: {
  loading: boolean;
  error: boolean;
  data: Conversation[];
  onRetry: () => void;
  onRefresh: () => Promise<unknown>;
  onOpen: (c: Conversation) => void;
  empty: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: { title: string; onPress: () => void } };
}) {
  const pull = usePullRefresh(onRefresh);
  if (loading) return <ActivityIndicator style={styles.center} color={colors.primary} />;
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No pudimos cargar tus mensajes.</Text>
        <Button title="Reintentar" variant="secondary" onPress={onRetry} />
      </View>
    );
  }
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      ListEmptyComponent={<EmptyState icon={empty.icon} title={empty.title} body={empty.body} action={empty.action} />}
      renderItem={({ item }) => {
        const unread = item.unread_count > 0;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.other_party.name}${unread ? `, ${item.unread_count} sin leer` : ''}. ${item.content}`}
            accessibilityHint="Abre la conversación"
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
          >
            <View>
              <Avatar uri={item.other_party.profile_url} name={item.other_party.name} size={52} />
              {unread ? <View style={styles.unreadDot} /> : null}
            </View>
            <View style={styles.rowInfo}>
              <View style={styles.rowTop}>
                <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
                  {item.other_party.name}
                </Text>
                <Text style={[styles.time, unread && styles.timeUnread]}>{formatMessageTime(item.created_at)}</Text>
              </View>
              <Text style={[styles.snippet, unread && styles.snippetUnread]} numberOfLines={1}>
                {item.sent_by_entity === (item.other_party.type === 'entity') ? '' : 'Tú: '}
                {item.content}
              </Text>
            </View>
            {unread ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{item.unread_count > 9 ? '9+' : item.unread_count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 28, fontFamily: fonts.display.semibold, color: colors.ink, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontFamily: fonts.ui.semibold, color: colors.muted },
  tabTextActive: { color: '#fff' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  backText: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.primary },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowInfo: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  nameUnread: { color: colors.ink },
  time: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  timeUnread: { color: colors.primary, fontFamily: fonts.ui.bold },
  snippet: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
  // Sin leer: el nombre ya es bold por defecto, así que lo que distingue de
  // verdad un mensaje pendiente es el snippet (normalmente gris) pasando a
  // tinta oscura y semibold, más el punto sobre el avatar y el contador.
  snippetUnread: { color: colors.ink, fontFamily: fonts.ui.semibold },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  tabCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  tabCountOn: { backgroundColor: '#fff' },
  tabCountText: { fontSize: 11, fontFamily: fonts.ui.extrabold, color: '#fff' },
  tabCountTextOn: { color: colors.primaryDark },
  reqPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.accentSoft },
  reqPillText: { fontSize: 11.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  reqBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  reqBannerText: { flex: 1, fontSize: 13.5, fontFamily: fonts.ui.bold, color: colors.accentInk },
  reqBannerLink: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.primaryDark },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 4,
  },
  countBadgeText: { color: '#fff', fontSize: 12, fontFamily: fonts.ui.bold },
});
