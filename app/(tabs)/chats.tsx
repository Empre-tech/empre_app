import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatApi, entitiesApi } from '@/api/endpoints';
import type { Conversation, EntityOwnerItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { SignInPrompt } from '@/components/SignInPrompt';
import { formatMessageTime } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

type Tab = 'personal' | 'business';

export default function ChatsScreen() {
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
        <SignInPrompt title="Tus mensajes" message="Inicia sesión para hablar con los negocios y ver tus conversaciones." />
      </View>
    );
  }

  const open = (conversation: Conversation) => {
    const { other_party: party, entity_id: entityId } = conversation;
    if (!entityId) return;
    // Cliente: el otro lado es el negocio. Dueño: el otro lado es el cliente, y su id viaja como userId.
    router.push({
      pathname: '/chat/[entityId]',
      params: { entityId, name: party.name, ...(party.type === 'user' ? { userId: party.id } : {}) },
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
          accessibilityRole="button"
          onPress={() => switchTab('personal')}
          style={[styles.tab, tab === 'personal' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'personal' && styles.tabTextActive]}>Personales</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => switchTab('business')}
          style={[styles.tab, tab === 'business' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'business' && styles.tabTextActive]}>Mis negocios</Text>
        </Pressable>
      </View>

      {tab === 'personal' ? (
        <ConversationList
          loading={conversations.isLoading}
          error={conversations.isError}
          data={personalConversations}
          onRetry={() => void conversations.refetch()}
          onOpen={open}
          emptyText="Aún no tienes conversaciones. Abre el perfil de un negocio y escríbele."
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
          <ConversationList
            loading={conversations.isLoading}
            error={conversations.isError}
            data={selectedBusinessConversations}
            onRetry={() => void conversations.refetch()}
            onOpen={open}
            emptyText="Todavía no tienes conversaciones con clientes de este negocio."
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
        <View style={styles.center}>
          <Text style={styles.empty}>Todavía no tienes negocios registrados.</Text>
        </View>
      ) : (
        <FlatList
          data={myEntities.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <BusinessRow business={item} count={conversationsByEntity.get(item.id)?.length ?? 0} onPress={() => setSelectedBusinessId(item.id)} />}
        />
      )}
    </View>
  );
}

function BusinessRow({ business, count, onPress }: { business: EntityOwnerItem; count: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <Avatar uri={business.profile_url} name={business.name} size={52} />
      <View style={styles.rowInfo}>
        <Text style={styles.name} numberOfLines={1}>
          {business.name}
        </Text>
        <Text style={styles.snippet} numberOfLines={1}>
          {business.category_name}
        </Text>
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
  onOpen,
  emptyText,
}: {
  loading: boolean;
  error: boolean;
  data: Conversation[];
  onRetry: () => void;
  onOpen: (c: Conversation) => void;
  emptyText: string;
}) {
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
      ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => onOpen(item)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
          <Avatar uri={item.other_party.profile_url} name={item.other_party.name} size={52} />
          <View style={styles.rowInfo}>
            <View style={styles.rowTop}>
              <Text style={styles.name} numberOfLines={1}>
                {item.other_party.name}
              </Text>
              <Text style={styles.time}>{formatMessageTime(item.created_at)}</Text>
            </View>
            <Text style={styles.snippet} numberOfLines={1}>
              {item.sent_by_entity === (item.other_party.type === 'entity') ? '' : 'Tú: '}
              {item.content}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 28, fontFamily: fonts.display.semibold, color: colors.ink, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
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
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  backText: { fontSize: 15, fontFamily: fonts.ui.semibold, color: colors.primary },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowInfo: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', fontFamily: fonts.ui.bold, color: colors.ink },
  time: { fontSize: 12, fontFamily: fonts.ui.medium, color: colors.muted },
  snippet: { fontSize: 14, fontFamily: fonts.ui.medium, color: colors.muted },
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
