import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatApi } from '@/api/endpoints';
import type { Conversation } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { SignInPrompt } from '@/components/SignInPrompt';
import { formatMessageTime } from '@/lib/format';
import { colors, spacing } from '@/theme';

export default function ChatsScreen() {
  const { status } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: chatApi.conversations,
    enabled: status === 'signedIn',
  });

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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Mensajes</Text>

      {conversations.isLoading ? (
        <ActivityIndicator style={styles.center} color={colors.primary} />
      ) : conversations.isError ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No pudimos cargar tus mensajes.</Text>
          <Button title="Reintentar" variant="secondary" onPress={() => void conversations.refetch()} />
        </View>
      ) : (
        <FlatList
          data={conversations.data ?? []}
          keyExtractor={(item) => item.id}
          refreshing={conversations.isRefetching}
          onRefresh={() => {
            void conversations.refetch();
          }}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>Aún no tienes conversaciones. Abre el perfil de un negocio y escríbele.</Text>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => open(item)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowInfo: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  time: { fontSize: 12, color: colors.muted },
  snippet: { fontSize: 14, color: colors.muted },
});
