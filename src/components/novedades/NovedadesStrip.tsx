import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usersApi } from '@/api/endpoints';
import { novedadesApi } from '@/api/novedades';
import { Avatar } from '@/components/Avatar';
import { stripEntries, unseenCount } from '@/lib/novedades';
import { colors, fonts, radius, spacing } from '@/theme';

const RING = { offer: colors.accent, post: colors.primary, none: colors.line } as const;
const RING_LABEL = { offer: 'oferta nueva', post: 'publicación nueva', none: 'sin novedades nuevas' } as const;

/**
 * Franja de una fila sobre los chats: un círculo por negocio que sigues con algo
 * publicado desde que lo sigues. Aro ámbar = oferta nueva, azul = publicación
 * nueva, sin aro = visto. Si no sigues a nadie, una invitación; si sigues pero
 * no hay nada, no se dibuja.
 */
export function NovedadesStrip() {
  const router = useRouter();
  const novedades = useQuery({ queryKey: ['novedades'], queryFn: novedadesApi.list });
  const following = useQuery({ queryKey: ['my-favorites'], queryFn: usersApi.favorites });

  if (novedades.isLoading || following.isLoading) return null;

  const items = novedades.data ?? [];
  const entries = stripEntries(items);

  if (entries.length === 0) {
    if ((following.data ?? []).length > 0) return null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Descubre negocios para seguir"
        onPress={() => router.push('/(tabs)')}
        style={({ pressed }) => [styles.invite, pressed && styles.pressed]}
      >
        <View style={styles.inviteIcon}>
          <Ionicons name="notifications-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.inviteText}>
          <Text style={styles.inviteTitle}>Entérate de lo nuevo</Text>
          <Text style={styles.inviteBody}>Sigue a tus negocios y verás aquí sus ofertas y publicaciones.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  }

  const unseen = unseenCount(items);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Novedades{unseen > 0 ? ` · ${unseen}` : ''}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/novedades')} hitSlop={8}>
          <Text style={styles.all}>Ver todo</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {entries.map((entry) => (
          <Pressable
            key={entry.entityId}
            accessibilityRole="button"
            accessibilityLabel={`${entry.name}: ${RING_LABEL[entry.ring]}`}
            onPress={() => {
              void novedadesApi.markSeen(entry.entityId).then(() => novedades.refetch());
              router.push({ pathname: '/business/[id]', params: { id: entry.entityId } });
            }}
            style={styles.item}
          >
            <View style={[styles.ring, { borderColor: RING[entry.ring] }]}>
              <Avatar uri={entry.profileUrl} name={entry.name} size={52} />
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {entry.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  title: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  all: { fontSize: 13, fontFamily: fonts.ui.bold, color: colors.primary },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  item: { width: 68, alignItems: 'center', gap: 4 },
  ring: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 11.5, fontFamily: fonts.ui.semibold, color: colors.ink, maxWidth: 68 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  inviteIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  inviteText: { flex: 1, gap: 2 },
  inviteTitle: { fontSize: 14, fontFamily: fonts.display.bold, color: colors.ink },
  inviteBody: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.ui.medium, color: colors.muted },
  pressed: { opacity: 0.85 },
});
