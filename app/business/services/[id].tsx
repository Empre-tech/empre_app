import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { CatalogFilters } from '@/components/catalog/CatalogFilters';
import { CatalogItems } from '@/components/catalog/CatalogItems';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { audienceChips, catalogCopy, catalogCount, catalogGroups, filterCatalog, matchesAudience, publicCatalog, sectionChips, type Audience, type ServiceItem } from '@/lib/catalog';
import { safeIcon } from '@/lib/icons';
import { displayIcon } from '@/lib/mapView';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * El catálogo completo de un negocio (3.27/3.28): se llama según el tipo de negocio (Carta, Servicios, Productos…), con
 * buscador (sin tildes ni mayúsculas) y chips por sección cuando el dueño las usa. Tocar un ítem abre su detalle
 * (fotos, descripción y preguntar). Solo el catálogo habitual: las ofertas tienen su propia pantalla.
 */
export default function CatalogScreen() {
  const { id, section: initialSection, audience: initialAudience } = useLocalSearchParams<{ id: string; section?: string; audience?: Audience }>();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(initialSection ?? '');
  const [audience, setAudience] = useState<Audience | null>(initialAudience ?? null);

  const business = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id ?? ''), enabled: Boolean(id) });
  const catalog = useQuery({ queryKey: ['catalog', id, 'sections'], queryFn: () => catalogApi.listWithSections(id ?? ''), enabled: Boolean(id), staleTime: 60_000 });

  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);
  const items = useMemo(() => publicCatalog(catalog.data?.items ?? []), [catalog.data]);
  // El orden de las secciones es el del negocio (las que tienen productos), con «Otros» al final.
  const order = useMemo(() => (catalog.data?.sections ?? []).map((s) => s.name), [catalog.data]);
  const audiences = useMemo(() => (catalog.data?.audience ? audienceChips(items) : []), [catalog.data, items]);
  const forAudience = useMemo(() => items.filter((i) => matchesAudience(i.audience, audience)), [items, audience]);
  // Las secciones siempre se ven (salen de todos los productos); el conteo es el del filtro «Para».
  const chips = useMemo(() => sectionChips(items, order, forAudience), [items, order, forAudience]);
  const groups = useMemo(() => catalogGroups(filterCatalog(forAudience, query, section), order), [forAudience, query, section, order]);

  // Sin foto, cada producto muestra el ícono de su sección (o el de la categoría del negocio).
  const icons = useMemo(() => new Map((catalog.data?.sections ?? []).map((x) => [x.name, x.icon])), [catalog.data]);
  const fallback = safeIcon(displayIcon(business.data?.category?.icon), 'pricetag-outline');
  const iconOf = (item: ServiceItem) => safeIcon(icons.get(item.section ?? ''), fallback);
  const open = (item: ServiceItem) => router.push({ pathname: '/business/product', params: { entityId: id ?? '', itemId: item.id } });

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
          <CatalogFilters
            sections={chips}
            total={forAudience.length}
            section={section}
            onSection={setSection}
            audiences={audiences}
            audience={audience}
            onAudience={setAudience}
          />
          <Text style={styles.count} accessibilityLiveRegion="polite">
            {query || section || audience ? `${catalogCount(copy, groups.reduce((n, g) => n + g.items.length, 0))} de ${items.length}` : catalogCount(copy, items.length)}
          </Text>
          {groups.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{query ? `Nada coincide con «${query}».` : 'Nada por aquí con este filtro.'}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuery('');
                  setSection('');
                  setAudience(null);
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
                <CatalogItems items={g.items} iconOf={iconOf} color={business.data?.category?.color} onOpen={open} />
              </View>
            ))
          )}
        </ScrollView>
      )}
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
  count: { fontSize: 12.5, fontFamily: fonts.ui.semibold, color: colors.muted },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  emptyBtn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  emptyBtnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
