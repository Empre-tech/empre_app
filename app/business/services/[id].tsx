import { Ionicons } from '@expo/vector-icons';
import { loadFacts } from '@/lib/agentPrefsStore';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { catalogApi } from '@/api/catalog';
import { entitiesApi } from '@/api/endpoints';
import { CatalogFilters } from '@/components/catalog/CatalogFilters';
import { CatalogItems } from '@/components/catalog/CatalogItems';
import { SubScreenHeader } from '@/components/profile/SubScreenHeader';
import { attrGroups, audienceChips, catalogCopy, catalogCount, catalogGroups, filterCatalog, formatPesos, kindChips, matchesAttrs, matchesAudience, publicCatalog, quickFilters, sectionChips, type Audience, type ItemKind, type ServiceItem } from '@/lib/catalog';
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
  const [kind, setKind] = useState<ItemKind | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  // Filtros que salen de sus datos: hasta un precio y de poca duración (solo si parten la lista).
  const [cheap, setCheap] = useState(false);
  const mySize = useQuery({ queryKey: ['agent-facts'], queryFn: loadFacts }).data?.find((f) => f.name === 'Talla')?.value ?? null;
  const [short, setShort] = useState(false);

  const business = useQuery({ queryKey: ['entity', id], queryFn: () => entitiesApi.get(id ?? ''), enabled: Boolean(id) });
  const catalog = useQuery({ queryKey: ['catalog', id, 'sections'], queryFn: () => catalogApi.listWithSections(id ?? ''), enabled: Boolean(id), staleTime: 60_000 });

  const copy = catalogCopy(business.data?.category?.name, business.data?.business_profile);
  const items = useMemo(() => publicCatalog(catalog.data?.items ?? []), [catalog.data]);
  // El orden de las secciones es el del negocio (las que tienen productos), con «Otros» al final.
  const order = useMemo(() => (catalog.data?.sections ?? []).map((s) => s.name), [catalog.data]);
  // Servicios y productos nunca van mezclados: si hay de los dos, se elige; las secciones y los atributos siguen esa elección.
  const kinds = useMemo(() => kindChips(items), [items]);
  const byKind = useMemo(() => items.filter((i) => !kind || i.kind === kind), [items, kind]);
  const audiences = useMemo(() => (catalog.data?.audience ? audienceChips(byKind) : []), [catalog.data, byKind]);
  const forAudience = useMemo(() => byKind.filter((i) => matchesAudience(i.audience, audience)), [byKind, audience]);
  // Los atributos (talla, color…) salen de lo que se ve, y filtran juntos.
  const attrs = useMemo(() => attrGroups(forAudience), [forAudience]);
  const quick = useMemo(() => quickFilters(byKind), [byKind]);
  const shown = useMemo(
    () =>
      forAudience.filter(
        (i) =>
          matchesAttrs(i, chosen) &&
          (!cheap || quick.maxPrice === null || (typeof i.price === 'number' && i.price <= quick.maxPrice)) &&
          (!short || quick.maxMin === null || (typeof i.duration_min === 'number' && i.duration_min <= quick.maxMin)),
      ),
    [forAudience, chosen, cheap, short, quick],
  );
  const sizeGroup = attrs.find((g) => g.name.toLowerCase() === 'talla');
  const sizeValue = mySize && sizeGroup ? sizeGroup.values.find((v) => v.value.toUpperCase() === mySize.toUpperCase())?.value : undefined;
  const quickChips = [
    ...(sizeValue && sizeGroup ? [{ key: 'size', label: `Tu talla ${sizeValue}`, on: chosen[sizeGroup.name] === sizeValue, toggle: () => choose(sizeGroup.name, chosen[sizeGroup.name] === sizeValue ? null : sizeValue) }] : []),
    ...(quick.maxPrice !== null ? [{ key: 'cheap', label: `Hasta ${formatPesos(quick.maxPrice)}`, on: cheap, toggle: () => setCheap((v) => !v) }] : []),
    ...(quick.maxMin !== null ? [{ key: 'short', label: `${quick.maxMin} min o menos`, on: short, toggle: () => setShort((v) => !v) }] : []),
  ];
  // Las secciones siempre se ven (salen de lo de este tipo); el conteo es el de los demás filtros.
  const chips = useMemo(() => sectionChips(byKind, order, shown), [byKind, order, shown]);
  const groups = useMemo(() => catalogGroups(filterCatalog(shown, query, section), order), [shown, query, section, order]);
  const choose = (name: string, value: string | null) =>
    setChosen((c) => {
      const next = { ...c };
      if (value) next[name] = value;
      else delete next[name];
      return next;
    });
  const filtering = Boolean(query || section || audience || kind || cheap || short || Object.keys(chosen).length);

  // Sin foto, cada producto muestra el ícono de su sección (o el de la categoría del negocio).
  const icons = useMemo(() => new Map((catalog.data?.sections ?? []).map((x) => [x.name, x.icon])), [catalog.data]);
  const fallback = safeIcon(displayIcon(business.data?.category?.icon), 'pricetag-outline');
  const iconOf = (item: ServiceItem) => safeIcon(icons.get(item.section ?? ''), fallback);
  const open = (item: ServiceItem) => router.push({ pathname: '/business/product', params: { entityId: id ?? '', itemId: item.id } });

  return (
    <View style={styles.screen}>
      <SubScreenHeader title="Catálogo" subtitle={business.data ? `${business.data.name} · ${catalogCount(copy, items.length)}` : undefined} />
      {catalog.isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Busca en este negocio"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              accessibilityLabel="Busca en este negocio"
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
            total={shown.length}
            section={section}
            onSection={setSection}
            audiences={audiences}
            audience={audience}
            onAudience={setAudience}
            kinds={kinds}
            kind={kind}
            onKind={(k) => {
              setKind(k);
              setSection('');
              setChosen({});
            }}
            attrs={attrs}
            chosen={chosen}
            onChoose={choose}
          />
          {quickChips.length ? (
            <View style={styles.quick}>
              {quickChips.map((c) => (
                <Pressable key={c.key} accessibilityRole="button" accessibilityState={{ selected: c.on }} onPress={c.toggle} style={[styles.quickChip, c.on && styles.quickChipOn]}>
                  <Text style={[styles.quickText, c.on && styles.quickTextOn]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.count} accessibilityLiveRegion="polite">
            {filtering ? `${catalogCount(copy, groups.reduce((n, g) => n + g.items.length, 0))} de ${items.length}` : catalogCount(copy, items.length)}
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
                  setKind(null);
                  setChosen({});
                  setCheap(false);
                  setShort(false);
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
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: 'center' },
  quickChipOn: { backgroundColor: colors.selectedSoft, borderColor: colors.ink },
  quickText: { fontSize: 13.5, fontFamily: fonts.ui.semibold, color: colors.ink },
  quickTextOn: { color: colors.ink },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: 12, fontFamily: fonts.ui.extrabold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.muted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, fontFamily: fonts.ui.semibold, color: colors.muted },
  emptyBtn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  emptyBtnText: { fontSize: 13.5, fontFamily: fonts.ui.extrabold, color: colors.ink },
});
