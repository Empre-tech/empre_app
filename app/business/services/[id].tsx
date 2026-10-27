import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { track } from '@/analytics/track';
import { AskSheet } from '@/components/profile/AskSheet';
import { CatalogRow } from '@/components/profile/CatalogSection';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { catalogCopy, catalogCount, catalogGroups, filterCatalog, publicCatalog, type ServiceItem } from '@/lib/catalog';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * El catálogo completo de un negocio (3.27/3.28): se llama según el tipo de negocio (Carta, Servicios, Productos…), con
 * buscador (sin tildes ni mayúsculas) y chips por sección cuando el dueño las usa. Tocar un ítem abre el mensaje para
 * preguntar por él. Solo el catálogo habitual: las ofertas tienen su propia pantalla.
 */
export default function CatalogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { status } = useAuth();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('');
  const [asking, setAsking] = useState<ServiceItem | null>(null);

  const business = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id ?? ''), enabled: Boolean(id) });
  const catalog = useQuery({ queryKey: ['catalog', id], queryFn: () => catalogApi.list(id ?? ''), enabled: Boolean(id), staleTime: 60_000 });

  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);
  const items = useMemo(() => publicCatalog(catalog.data ?? []), [catalog.data]);
  const sections = useMemo(() => catalogGroups(items).map((g) => g.section).filter(Boolean), [items]);
  const groups = useMemo(() => catalogGroups(filterCatalog(items, query, section)), [items, query, section]);

  const send = (message: string) => {
    setAsking(null);
    if (status !== 'signedIn') {
      router.push('/(auth)/login');
      return;
    }
    const b = business.data;
    if (!b) return;
    track('contact_started', b.id);
    router.push({ pathname: '/chat/[entityId]', params: { entityId: b.id, name: b.name, avatar: b.profile_url, draft: message } });
  };

  return (
    <View style={styles.screen}>
      <SubScreenHeader title={business.data ? `${copy.noun} · ${business.data.name}` : copy.noun} />
      {catalog.isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={copy.search}
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              accessibilityLabel={copy.search}
              returnKeyType="search"
            />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setQuery('')} style={styles.clear}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          {sections.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {['', ...sections].map((s) => {
                const on = s === section;
                return (
                  <Pressable key={s || 'all'} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setSection(s)} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{s || 'Todos'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          <Text style={styles.count} accessibilityLiveRegion="polite">
            {query || section ? `${catalogCount(copy, groups.reduce((n, g) => n + g.items.length, 0))} de ${items.length}` : catalogCount(copy, items.length)}
          </Text>
          {groups.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nada coincide con «{query}».</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setSection('');
                }}
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>Ver todo</Text>
              </Pressable>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.section || 'all'} style={styles.group}>
                {g.section ? (
                  <Text style={styles.groupTitle} accessibilityRole="header">
                    {g.section} · {g.items.length}
                  </Text>
                ) : null}
                <View style={styles.card}>
                  {g.items.map((item, i) => (
                    <CatalogRow key={item.id} item={item} color={business.data?.category?.color} icon={business.data?.category?.icon} first={i === 0} onPress={() => setAsking(item)} />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
      <AskSheet item={asking?.name ?? null} businessName={business.data?.name ?? ''} copy={copy} onClose={() => setAsking(null)} onSend={send} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loading: { marginTop: spacing.xxl },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingLeft: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  searchInput: { flex: 1, minHeight: 44, fontSize: 14, fontFamily: fonts.ui.medium, color: colors.ink },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 6 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
  chipTextOn: { color: '#fff' },
  count: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  emptyBtn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  emptyBtnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
