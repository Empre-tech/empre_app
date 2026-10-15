import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { novedadesApi } from '@/api/novedades';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { SignInPrompt } from '@/components/SignInPrompt';
import { useNow } from '@/lib/useNow';
import { groupByDay, novedadText, type NovedadItem } from '@/lib/novedades';
import { colors, fonts, radius, spacing } from '@/theme';

/** Novedades: lo que publicaron los negocios que sigues desde que los sigues, agrupado por día. */
export default function NovedadesScreen() {
  const { status } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const novedades = useQuery({ queryKey: ['novedades'], queryFn: novedadesApi.list, enabled: status === 'signedIn' });
  const now = useNow(60_000);
  const items = useMemo(() => novedades.data ?? [], [novedades.data]);

  // Al abrir la lista todo se da por visto, pero el punto «nuevo» de esta visita se conserva hasta salir.
  const marked = useRef(false);
  const hadUnseen = items.some((i) => i.unseen);
  useEffect(() => {
    if (marked.current || !novedades.isSuccess || !hadUnseen) return;
    marked.current = true;
    void novedadesApi.markSeen();
  }, [novedades.isSuccess, hadUnseen]);
  // La franja de Mensajes se actualiza al salir, no mientras se lee la lista.
  useEffect(() => () => void queryClient.invalidateQueries({ queryKey: ['novedades'] }), [queryClient]);

  const sections = useMemo(() => groupByDay(items, now).map((d) => ({ title: d.label, data: d.items })), [items, now]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chats'))}
          style={styles.back}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Novedades</Text>
      </View>

      {status !== 'signedIn' ? (
        <SignInPrompt title="Novedades" message="Inicia sesión para ver lo nuevo de los negocios que sigues." />
      ) : novedades.isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.centered} />
      ) : novedades.isError ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No pudimos cargar las novedades.</Text>
          <Button title="Reintentar" variant="secondary" onPress={() => void novedades.refetch()} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="notifications-outline" size={32} color={colors.muted} />
          <Text style={styles.empty}>Todavía no hay novedades. Aquí aparece lo que los negocios que sigues publiquen desde ahora.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
          renderItem={({ item }) => <Row item={item} onPress={() => router.push({ pathname: '/business/[id]', params: { id: item.entity_id } })} />}
        />
      )}
    </View>
  );
}

function Row({ item, onPress }: { item: NovedadItem; onPress: () => void }) {
  const offer = item.kind === 'offer';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.entity_name}. ${novedadText(item)}${item.unseen ? '. Nuevo' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar uri={item.entity_profile_url} name={item.entity_name} size={44} />
      <View style={styles.rowInfo}>
        <Text style={styles.name} numberOfLines={1}>
          {item.entity_name}
        </Text>
        <Text style={styles.text} numberOfLines={2}>
          {novedadText(item)}
        </Text>
      </View>
      <View style={[styles.kind, offer ? styles.kindOffer : styles.kindPost]}>
        <Ionicons name={offer ? 'flash' : 'images'} size={14} color={offer ? colors.accentInk : colors.primaryDark} />
      </View>
      {item.unseen ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: fonts.display.bold, color: colors.ink },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  empty: { fontSize: 14, lineHeight: 20, fontFamily: fonts.ui.medium, color: colors.muted, textAlign: 'center' },
  list: { paddingHorizontal: spacing.lg },
  day: { fontSize: 13, fontFamily: fonts.ui.extrabold, color: colors.muted, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.85 },
  rowInfo: { flex: 1, gap: 1 },
  name: { fontSize: 14, fontFamily: fonts.ui.bold, color: colors.ink },
  text: { fontSize: 13, fontFamily: fonts.ui.medium, color: colors.muted },
  kind: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  kindOffer: { backgroundColor: colors.accentSoft },
  kindPost: { backgroundColor: colors.primarySoft },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
});
